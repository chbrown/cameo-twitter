/*jslint node: true */
var _ = require('lodash');
var async = require('async');
var db = require('../db');
var fs = require('fs');
var logger = require('loge');
var streaming = require('streaming');

// var errors = require('../../errors');
// var twitter = require('../twitter');
// var edge_events = require('../edge_events');
var users = require('../../users');
var statuses = require('../../statuses');

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

module.exports = function(argv) {
  var args = argv._.slice(1);
  // var user_key = argv.field == 'user_id' ? 'id_str' : 'screen_name';
  getLines(args, function(err, lines) {
    if (err) throw err;
    // just assume they're all screen names
    logger.info('adding %d screen_names', lines.length);
    users.add_screen_names(lines, function(err) {
      if (err) throw err;
      users.sync_missing(function(err) {
        if (err) throw err;
        // statuses.add_screen_names requires that the screen_names exist in the 'users' table
        statuses.add_screen_names(lines, function(err) {
          if (err) throw err;
          logger.info('statuses-add done');
          process.exit();
        });
      });
    });
  });
};
