/*jslint node: true */
var _ = require('lodash');
var async = require('async');
var logger = require('loge');

var db = require('./db');
var errors = require('./errors');
var twitter = require('./twitter');

exports.sync_missing = function(callback) {
  // populate half-filled users in the users table
  (function loop() {
    // db.Select('users').where('screen_name IS NOT NULL AND id_str IS NULL').limit(100)
    db.Select('users')
    .add('id_str', 'screen_name')
    .where('modified IS NULL')
    .limit(100)
    .execute(function(err, rows) {
      if (err) return callback(err);
      if (rows.length === 0) {
        // we're done!
        return callback();
      }

      // remove screen_name when redundant
      var users = rows.map(function(row) {
        return row.id_str ? {id_str: row.id_str} : {screen_name: row.screen_name};
      });

      logger.debug('Populating batch of %d users', users.length);
      twitter.getUsers(users, function(err, users) {
        if (err) {
          // treat 403 forbidden responses as non-fatal, just retry
          if (err instanceof errors.HTTPError && err.incoming_message.statusCode == 403) {
            logger.error('%s: %j', err.message, err.body);
            return setImmediate(loop);
          }
          else {
            return callback(err);
          }
        }

        var now = new Date();

        logger.info('Found %d users out of a total of %d',
          users.filter(function(user) { return user.created_at; }).length, users.length);

        async.each(users, function(user, callback) {
          var update = db.Update('users')
          .where('id_str = ? OR screen_name = ?', user.id_str, user.screen_name)
          .set({modified: now});

          if (user.created_at) {
            var fields = _.omit(user, 'id', 'entities', 'status');
            update = update.set(fields);
          }
          else {
            update = update.set({missing: true});
          }

          update.execute(callback);
        }, function(err) {
          if (err) return callback(err);
          setImmediate(loop);
        });
      });
    });
  })();
};

exports.add_screen_names = function(screen_names, callback) {
  // callback: function(Error | null)
  async.map(screen_names, function(screen_name, callback) {
    db.Insert('users')
    .set({screen_name: screen_name})
    .execute(function(err) {
      if (err) {
        // don't treat unique collisions as fatal
        if (err.code == '23505') {
          callback(null, false);
        }
        else {
          callback(err);
        }
      }
      else {
        callback(null, true);
      }
    });
  }, function(err, inserts) {
    if (err) return callback(err);
    logger.info('Inserted %d new screen names out of %d total', _.compact(inserts).length, screen_names.length);
    callback();
  });
};

