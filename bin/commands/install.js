/*jslint node: true */
var db = require('../../db');
var logger = require('loge');

module.exports = function(argv) {
  db.install(function(err) {
    if (err) {
      logger.error('Database install error: %j. %s', err, err.stack);
    }
    process.exit(err ? 1 : 0);
  });
};
