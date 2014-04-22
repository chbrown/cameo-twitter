/*jslint node: true */
var _ = require('underscore');
var async = require('async');

var db = require('../db');
var logger = require('loge');
var twitter = require('../twitter');
var edge_events = require('../edge_events');

exports.install = function(argv) {
  db.install(function(err) {
    if (err) throw err;
  });
};

exports.work = function(argv) {
  edge_events.startCluster(argv.forks, argv.period);
};

exports.add = function(argv) {
  // pop off the command (argv[0])
  var args = argv._.slice(1);
  var groups = _.groupBy(args, function(user_id_or_screen_name) {
    return isNaN(user_id_or_screen_name) ? 'screen_names' : 'user_ids';
  });
  twitter.resolveScreenNames(groups.screen_names || [], function(err, resolved_user_ids) {
    if (err) throw err;
    var user_ids = [].concat(resolved_user_ids || [], groups.user_ids || []);
    async.each(user_ids, edge_events.addUser, function(err) {
      if (err) throw err;
      logger.info('Added %d user_ids', user_ids.length);
      process.exit();
    });
  });
};

var populate = function(callback) {
  // populate half-filled users in the users table
  (function loop() {
    db.Select('users')
    .where('screen_name IS NULL') // OR id IS NULL
    .limit(100)
    .execute(function(err, rows) {
      if (err) return callback(err);

      if (rows.length) {
        var user_ids = _.pluck(rows, 'id');
        logger.debug('Fetching user_ids: %j', user_ids);
        twitter.getUsers(user_ids, [], function(err, users) {
          if (err) return callback(err);
          var now = new Date();

          // users are not necessarily in order
          async.each(users, function(user, callback) {
            var fields = _.omit(user, 'id', 'entities', 'status');
            db.Update('users')
            .set(fields)
            .set({modified: now})
            .where('id = ?', user.id)
            .execute(callback);
          }, function(err) {
            if (err) return callback(err);
            setImmediate(loop);
          });
        });
      }
      else {
        callback();
      }
    });
  })();
};

exports.populate = function(argv) {
  populate(function(err) {
    if (err) throw err;

    logger.info('done');
    process.exit();
  });
};
