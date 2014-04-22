/*jslint node: true */
var logger = require('loge');
var sqlcmd = require('sqlcmd');

// var pg = require('pg');
// var types = pg.types;
// types.setTypeParser(1114, function(stringValue) {
//   logger.debug('parsing pg type 1114', stringValue);
//   return Date.parse(stringValue);
// });
// set TZ=UTC to ensure that node-postgres interprets naive dates as UTC, regardless of server
process.env.TZ = 'UTC';

var connection = module.exports = new sqlcmd.Connection({host: '/tmp', database: 'cameo-twitter'});
// connection.logger = logger;

connection.install = function(callback) {
  /** Create the database if it doesn't exist and run schema.sql on it.
  callback: function(Error | null)
  */
  var path = require('path');
  var schema_filepath = path.join(__dirname, 'schema.sql');
  connection.databaseExists(function(err, exists) {
    if (err) return callback(err);
    if (!exists) {
      connection.createDatabase(function(err) {
        if (err) return callback(err);
        connection.executeSQLFile(schema_filepath, callback);
      });
    }
    else {
      callback();
    }
  });
};
