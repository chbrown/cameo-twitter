/*jslint node: true */
var path = require('path');
var db = require('../../db');
var logger = require('loge');

module.exports = function(argv) {
  /** Create the database if it doesn't exist and run schema.sql on it.
  callback: function(Error | null)
  */
  var schema_filepath = path.join(__dirname, '..', '..', 'schema.sql');
  db.initializeDatabase(schema_filepath, function(err) {
    if (err) {
      logger.error('Database install error: %j. %s', err, err.stack);
    }
    process.exit(err ? 1 : 0);
  });
};
