/*jslint node: true */
var async = require('async');
var request = require('request');
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

var sync_watched_user = function(user_id, started, ended, callback) {
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

    var database_followers = replayHistory(payload.database_followers, 'from_id');
    var database_friends = replayHistory(payload.database_friends, 'to_id');

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

var watched_users_loop = function(period, callback) {
  // The update with join is a way to lock the desired result, update it, and join on the pre-update values
  // http://stackoverflow.com/questions/7923237/return-pre-update-column-values-using-sql-only-postgresql-version
  // http://stackoverflow.com/questions/11532550/atomic-update-select-in-postgres
  var watched_users_select_sql = [
    'UPDATE edge_events_watched_users AS t1 SET modified = NOW()',
    'FROM (SELECT id, modified AS old_modified FROM edge_events_watched_users WHERE active IS TRUE AND modified < $1 LIMIT 1 FOR UPDATE) AS t2',
    'WHERE t1.id = t2.id',
    'RETURNING *',
  ].join(' ');
  (function loop() {
    logger.debug('Entering watched_users_loop');
    var now = new Date();
    var cutoff = new Date(now - (period * 1000));
    // lock, pop off, and update the next one
    db.query(watched_users_select_sql, [cutoff], function(err, rows) {
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
          // add a little extra time so that we don't race around during the 0 second
          setTimeout(loop, interval + 1000);
        });
      }
      else {
        sync_watched_user(row.user_id, row.old_modified, now, function(err) {
          if (err) {
            logger.error('sync_watched_user error; setting modified back to original value', err);

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

exports.startCluster = function(forks, period) {
  /** watched_users_cluster */
  var cluster = require('cluster');
  if (cluster.isMaster) {
    logger.info('Starting cluster with %d forks', forks);
    cluster.on('exit', function(worker, code, signal) {
      logger.error('cluster: worker exit %d (pid: %d)', worker.id, worker.process.pid, code, signal);
      cluster.fork();
    });
    // cluster.on('fork', function(worker) {
    //   logger.info('cluster: worker fork %d (pid: %d)', worker.id, worker.process.pid);
    // });

    // fork workers
    for (var i = 0; i < forks; i++) {
      cluster.fork();
    }
  }
  else {
    watched_users_loop(period, function(err) {
      // normally won't ever callback
      logger.error('edge_events_watched_users_loop raised error', err);
      process.exit(1);
    });
  }
};

exports.addUser = function(user_id, callback) {
  // check if that user already exists
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
