/*jslint node: true */
var async = require('async');
var request = require('request');
// var redis = require('redis');
var logger = require('loge');
var _ = require('underscore');
var twilight = require('twilight');

var db = require('./db');

var replayHistory = function(rows, key) {
  var users = {};
  rows.forEach(function(row) {
    if (row.type == 'follow') {
      users[row[key]] = 1;
    }
    else {
      delete users[row[key]];
    }
  });
  return Object.keys(users);
};

var syncUser = function(user_id, started, ended, callback) {
  // https://dev.twitter.com/docs/api/1.1/get/followers/ids
  // https://dev.twitter.com/docs/api/1.1/get/friends/ids
  var twitter_request = request.defaults({
    method: 'GET',
    timeout: 10000,
    json: true,
    qs: {user_id: user_id, stringify_ids: 'true'},
  });

  async.auto({
    oauth: function(callback) {
      twilight.getOAuth('~/.twitter', callback);
    },
    followers: ['oauth', function(callback, payload) {
      twitter_request({
        url: 'https://api.twitter.com/1.1/followers/ids.json',
        oauth: payload.oauth,
      }, function(err, response, body) {
        if (err) return callback(err);
        callback(null, body.ids);
      });
    }],
    friends: ['oauth', function(callback, payload) {
      twitter_request({
        url: 'https://api.twitter.com/1.1/friends/ids.json',
        oauth: payload.oauth,
      }, function(err, response, body) {
        if (err) return callback(err);
        callback(null, body.ids);
      });
    }],
    database_followers: function(callback) {
      db.Select('edge_events')
      .where('to_id = ?', user_id)
      .orderBy('ended')
      .execute(callback);
    },
    database_friends: function(callback) {
      db.Select('edge_events')
      .where('from_id = ?', user_id)
      .orderBy('ended')
      .execute(callback);
    },
  }, function(err, payload) {
    if (err) return callback(err);
    // console.log('payload', payload);

    // .map(atoi)
    var database_followers = replayHistory(payload.database_followers, 'from_id');
    var database_friends = replayHistory(payload.database_friends, 'to_id');
    // console.log('database_followers', database_followers);
    // console.log('database_friends', database_friends);

    var edge_events = [];
    _.difference(payload.friends, database_friends).forEach(function(friend_user_id) {
      edge_events.push({from_id: user_id, to_id: friend_user_id, type: 'follow'});
    });
    _.difference(database_friends, payload.friends).forEach(function(friend_user_id) {
      edge_events.push({from_id: user_id, to_id: friend_user_id, type: 'unfollow'});
    });
    _.difference(payload.followers, database_followers).forEach(function(friend_user_id) {
      edge_events.push({from_id: friend_user_id, to_id: user_id, type: 'follow'});
    });
    _.difference(database_followers, payload.followers).forEach(function(friend_user_id) {
      edge_events.push({from_id: friend_user_id, to_id: user_id, type: 'unfollow'});
    });

    // resolve the database followers and friends
    async.each(edge_events, function(edge_event, callback) {
      db.Insert('edge_events')
      .set(edge_event)
      .set({
        started: started, // whatever the watched user's modified value was last
        ended: ended, // generally, close to now, i.e., new Date()
      })
      .execute(callback);
    }, function(err) {
      if (err) return callback(err);

      logger.info('added %d edge_events for user %s', edge_events.length, user_id);
      callback();
    });
  });
};

var edge_events_watched_users_loop = function(period, callback) {
  // EVAL "return redis.call('zrangebyscore', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, 1)" 1 ztest   50
  // .zadd(users_key, '-inf', cutoff, 'WITHSCORES', 'LIMIT', 0, 1)
  // .zrangebyscore(users_key, '-inf', cutoff)
  // .zremrangebyscore(users_key, '-inf', cutoff)
  // if this doesn't cut it:
  // http://stackoverflow.com/questions/7923237/return-pre-update-column-values-using-sql-only-postgresql-version
  // http://stackoverflow.com/questions/11532550/atomic-update-select-in-postgres
  var select_sql = [
    'UPDATE edge_events_watched_users AS t1 SET modified = NOW()',
    'FROM (SELECT id, modified AS old_modified FROM edge_events_watched_users WHERE active IS TRUE AND modified < $1 LIMIT 1 FOR UPDATE) AS t2',
    'WHERE t1.id = t2.id',
    'RETURNING *',
  ].join(' ');

  (function loop() {
    logger.debug('Entering edge_events_watched_users_loop');
    var now = new Date();
    var cutoff = new Date(now - (period * 1000));
    // lock, pop off, and update the next one
    db.query(select_sql, [cutoff], function(err, rows) {
      if (err) return callback(err);

      var row = rows[0];
      if (row === undefined) {
        db.Select('edge_events_watched_users')
        .orderBy('modified ASC')
        .limit(1)
        .execute(function(err, rows) {
          if (err) return callback(err);

          var next_modified = rows[0].modified; // the oldest modified date in the bunch
          var interval = next_modified - cutoff;
          logger.warn('Oldest task is %s, waiting %ds.', next_modified, interval / 1000 | 0);
          setTimeout(loop, interval);
        });
      }
      else {
        syncUser(row.user_id, row.old_modified, now, function(err) {
          if (err) return callback(err);
          // logger.info('row', row);
          if (err) {
            logger.error('syncUser error; setting modified back to original value', err);

            db.Update('edge_events_watched_users')
            .set('modified', row.old_modified)
            .where('id = ?', row.id)
            .execute(function(err) {
              if (err) return callback(err);

              setImmediate(loop);
            });
          }
          else {
            setImmediate(loop);
          }
        });
      }
    });
  })();
};

var resolveScreenNames = function(screen_names, callback) {
  /**
  callback(Error | null, Array[Number] | null)
  */
  if (screen_names.length === 0) return callback(null, []);

  twilight.getOAuth('~/.twitter', function(err, oauth) {
    if (err) return callback(err);
    request({
      method: 'POST',
      url: 'https://api.twitter.com/1.1/users/lookup.json',
      oauth: oauth,
      json: true,
      form: {
        screen_name: screen_names.join(',')
      }
    }, function(err, response, body) {
      if (err) return callback(err);
      var user_ids = body.map(function(user) {
        return user.id;
      });
      callback(null, user_ids);
    });
  });
};

var addUser = function(user_id, callback) {
  // check if that user already exists
  // var client = redis.createClient();
  db.Insert('edge_events_watched_users')
  .set({
    user_id: user_id,
    active: true,
    modified: new Date(0),
  })
  .execute(function(err) {
    if (err) {
      // 23505: unique violation, ignore
      if (err.code != '23505') {
        // console.dir(err);
        return callback(err);
      }
    }

    callback();
  });
};

var main = function() {
  var optimist = require('optimist')
    .usage('$0 user_id screen_name [user_id...]')
    .describe({
      interval: 'seconds to wait betweet polling for new jobs',
      period: 'seconds between fetching changes for each user',
      help: 'print this help message',
      verbose: 'print extra output',
    })
    .alias({verbose: 'v'})
    .boolean(['help', 'verbose'])
    .default({
      interval: 15000,
      period: 24*60*60, // seconds_per_day
    });

  var argv = optimist.argv;
  logger.level = argv.verbose ? 'debug' : 'info';

  if (argv.help) {
    optimist.showHelp();
    process.exit(0);
  }

  var groups = _.groupBy(argv._, function(user_id_or_screen_name) {
    return isNaN(user_id_or_screen_name) ? 'screen_names' : 'user_ids';
  });
  resolveScreenNames(groups.screen_names || [], function(err, resolved_user_ids) {
    if (err) throw err;
    var user_ids = [].concat(resolved_user_ids || [], groups.user_ids || []);
    logger.info('Adding user_ids', user_ids);
    async.each(user_ids, addUser, function(err) {
      if (err) throw err;

      edge_events_watched_users_loop(argv.period, function(err) {
        // normally, won't return
        throw err;
      });
    });
  });
};

if (require.main === module) {
  // Error.stackTraceLimit = 50;
  main();
}
