/*jslint node: true */
var async = require('async');
var request = require('request');
var logger = require('loge');
var _ = require('underscore');
var twilight = require('twilight');
var bigdecimal = require('bigdecimal');

var db = require('./db');
var errors = require('./errors');
var users = require('./users');

var getStatuses = function(oauth, user_id, max_id, callback) {
  // options: https://dev.twitter.com/docs/api/1.1/get/statuses/user_timeline

  var query = {
    user_id: user_id,
    count: 200,
    trim_user: true,
    exclude_replies: false,
    contributor_details: true,
    include_rts: true,
  };

  if (max_id !== undefined) {
    query.max_id = max_id;
  }

  request({
    method: 'GET',
    url: 'https://api.twitter.com/1.1/statuses/user_timeline.json',
    oauth: oauth,
    timeout: 10000,
    json: true,
    qs: query,
  }, function(err, response, body) {
    if (err) return callback(err);

    if (response.statusCode != 200) {
      return callback(new errors.HTTPError(response, body));
    }
    callback(null, body);
  });
};

function addStatus(status, callback) {
  var fields = _.omit(status,
    'id', 'in_reply_to_status_id', 'in_reply_to_user_id',
    'user', 'geo', 'retweeted_status', 'entities');
  fields.user_id_str = status.user.id_str;
  fields.user_screen_name = status.user.screen_name;

  if (status.retweeted_status) {
    fields.retweeted_status_id_str = status.retweeted_status.id_str;
  }

  db.Insert('statuses')
  .set(fields)
  .execute(callback);
}

var next = function(callback) {
  /**
  Get the next user that hasn't been synced recently enough.

  Or for now, just fill in the backlog.
  */

  var select_sql = [
    'UPDATE statuses_watched_users AS t1 SET modified = NOW()',
    'FROM (SELECT id, modified AS old_modified FROM statuses_watched_users',
    '  WHERE backlog_exhausted IS FALSE AND active IS TRUE ORDER BY modified ASC LIMIT 1 FOR UPDATE) AS t2',
    'WHERE t1.id = t2.id',
    'RETURNING *',
  ].join(' ');


  db.query(select_sql, [], function(err, rows) {
    if (err) return callback(err);
    if (rows.length === 0) return callback(new errors.ThrashError());
    var user_id = rows[0].user_id;
    logger.info('filling in backlog for user "%s"', user_id);

    // get the oldest status (the one with the least created_at date)
    db.Select('statuses')
    .add('id_str')
    .where('user_id_str = ?', user_id)
    .orderBy('created_at ASC')
    .limit(1)
    .execute(function(err, statuses_rows) {
      if (err) return callback(err);

      var last_status_id_str = statuses_rows[0] ? statuses_rows[0].id_str : null;
      twilight.getOAuth('~/.twitter', function(err, oauth) {
        if (err) return callback(err);
        // logger.info('using oauth', oauth);

        var ntweets = 0;
        (function loop() {
          var one = new bigdecimal.BigInteger('1');
          var max_id;
          if (last_status_id_str) {
            max_id = new bigdecimal.BigInteger(last_status_id_str).subtract(one).toString();
          }
          getStatuses(oauth, user_id, max_id, function(err, statuses) {
            if (err) return callback(err);
            logger.info('found batch of %d statuses (max_id = %s)', statuses.length, max_id);

            if (statuses.length) {
              ntweets += statuses.length;
              var last_status = statuses[statuses.length - 1];
              last_status_id_str = last_status.id_str;
              async.each(statuses, addStatus, function(err) {
                if (err) return callback(err);

                setImmediate(loop);
              });
            }
            else {
              logger.info('got %d tweets; stopping', ntweets);
              // return callback();
              db.Update('statuses_watched_users')
              .set({backlog_exhausted: true})
              .where('id = ?', rows[0].id)
              .execute(callback);
            }
          });
        })();
      });
    });
  });
};

exports.loop = function(callback) {
  (function loop() {
    next(function(err) {
      if (err instanceof errors.ThrashError) {
        console.error('ThrashError, waiting 1s.');
        return setTimeout(loop, 1000);
      }
      if (err) return callback(err);

      setImmediate(loop);
    });
  })();
};

exports.add_screen_names = function(screen_names, callback) {
  /** Resolve the given screen_names in the users table and add them to the
  statuses_watched_users table.

  callback: function(Error | null, )
  */
  async.map(screen_names, function(screen_name, callback) {
    db.Select('users')
    .where('screen_name = ?', screen_name)
    .execute(function(err, users) {
      if (err) return callback(err);

      var user = users[0];
      if (user === undefined) {
        logger.error('Screen name "%s" not found in "users" table', screen_name);
        return new Error('Screen name not found');
      }

      if (!user.missing) {
        db.Insert('statuses_watched_users')
        .set({user_id: user.id_str})
        .execute(function(err) {
          // 23505: unique violation, ignore
          if (err) {
            if (err.code == '23505') return callback(null, 'duplicate');
            return callback(err);
          }
          callback(null, 'inserted');
        });
      }
      else {
        callback(null, 'missing');
      }

    });
  }, function(err, results) {
    if (err) return callback(err);
    var counts = _.groupBy(results);
    logger.info('inserted %d users; %d duplicates, %d missing',
      (counts.inserted || []).length, (counts.duplicate || []).length, (counts.missing || []).length);

    callback();
  });
};
