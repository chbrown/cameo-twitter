/*jslint node: true */
var _ = require('underscore');
var async = require('async');
var streaming = require('streaming');
var fs = require('fs');

var db = require('../db');
var errors = require('../errors');
var logger = require('loge');
var twitter = require('../twitter');
var edge_events = require('../edge_events');
var statuses = require('../statuses');
var fork = require('../fork');
var users = require('../users');

// var stream = require('stream');
// var util = require('util');
// var ArgStream = module.exports = function(predicate) {
//   stream.Transform.call(this, {objectMode: true});
//   this.predicate = predicate;
// };
// util.inherits(ArgStream, stream.Transform);
// ArgStream.prototype._transform = function(chunk, encoding, callback) {
//   var success = this.predicate(chunk);
//   if (success) {
//     this.push(chunk, encoding);
//   }
//   callback();
// };


var getLines = function(args, callback) {
  if (args.length === 0) {
    args = ['-'];
  }
  async.map(args, function(arg, callback) {
    if (arg == '-') {
      var stream = process.stdin.pipe(new streaming.Splitter());
      streaming.readToEnd(stream, callback);
    }
    else {
      // fs.createReadStream(arg, {encoding: 'utf8'});
      fs.readFile(arg, {encoding: 'utf8'}, function(err, data) {
        if (err) return callback(null, [arg]);
        callback(null, data.trim().split(/\n|\r/));
      });
    }
  }, function(err, lineslist) {
    if (err) return callback(err);
    var lines = Array.prototype.concat.apply([], lineslist);
    callback(null, lines);
  });
};

exports.install = function(argv) {
  db.install(function(err) {
    if (err) throw err;
  });
};

exports['edges-work'] = function(argv) {
  fork(function(callback) {
    edge_events.loop(argv.period, callback);
  }, argv.forks);
};

exports['edges-add'] = function(argv) {
  // pop off the command (argv[0])
  // var args = argv._.slice(1);
  // var groups = _.groupBy(args, function(user_id_or_screen_name) {
  //   return isNaN(user_id_or_screen_name) ? 'screen_names' : 'user_ids';
  // });
  // twitter.resolveScreenNames(groups.screen_names || [], function(err, resolved_user_ids) {
  //   if (err) throw err;
  //   var user_ids = [].concat(resolved_user_ids || [], groups.user_ids || []);
  //   async.each(user_ids, edge_events.addUser, function(err) {
  //     if (err) throw err;
  //     logger.info('Added %d user_ids', user_ids.length);
  //     process.exit();
  //   });
  // });
};

exports['statuses-work'] = function(argv) {
  fork(function(callback) {
    statuses.loop(callback);
  }, argv.forks);
};

exports['statuses-add'] = function(argv) {
  var args = argv._.slice(1);
  // var user_key = argv.field == 'user_id' ? 'id_str' : 'screen_name';
  getLines(args, function(err, lines) {
    if (err) throw err;

    // just assume they're all screen names
    users.add_screen_names(lines, function(err) {
      if (err) throw err;
      users.sync_missing(function(err) {
        if (err) throw err;

        db.Select('users')
        .whereIn('screen_name', screen_names)
        .where('missing IS FALSE')
        .execute(function(err, users) {
          if (err) throw err;

          async.each(users, function(user, callback) {
            db.Insert('statuses_watched_users')
            .set({user_id: user.id_str})
            .execute(callback);
          }, callback);
        });
      });
    })

    statuses.addScreenNames(lines, function(err) {
      if (err) throw err;
      logger.info('done');
    });
  });
};

exports.populate = function(argv) {
  users.sync_missing(function(err) {
    if (err) {
      logger.error('populate, sync_missing error:', err);
      process.exit(1);
    }

    logger.info('done');
    process.exit();
  });
};
