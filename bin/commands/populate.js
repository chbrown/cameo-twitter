/*jslint node: true */
var logger = require('loge');

var db = require('../../db');
var users = require('../../users');

module.exports = function(argv) {
  users.sync_missing(function(err) {
    if (err) {
      logger.error('populate, sync_missing error:', err);
      process.exit(1);
    }

    logger.info('populate done');
    process.exit();
  });
};
