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
