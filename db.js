/*jslint node: true */
var logger = require('loge');
var sqlcmd = require('sqlcmd');

// set TZ=UTC to ensure that node-postgres / postgresql interprets naive dates as UTC, regardless of server
process.env.TZ = 'UTC';

var database = process.env.npm_config_database || require('./package').config.database;

// console.log('db=%j', database);
var connection = module.exports = new sqlcmd.Connection({
  host: '/tmp',
  database: database,
});
// connection.logger = logger;

connection.install = function(callback) {
  /** Create the database if it doesn't exist and run schema.sql on it.
  callback: function(Error | null)
  */
  logger.level = 'debug';

  var path = require('path');
  var schema_filepath = path.join(__dirname, 'schema.sql');
  connection.databaseExists(function(err, exists) {
    if (err) return callback(err);
    logger.info('database "%s" %s', connection.options.database, exists ? 'already exists' : 'does not exist');

    if (!exists) {
      connection.createDatabase(function(err) {
        if (err) return callback(err);

        logger.info('created database "%s"', connection.options.database);
        connection.executeSQLFile(schema_filepath, function(err) {
          if (err) return callback(err);

          logger.info('executed SQL in "%s"', schema_filepath);
          callback();
        });
      });
    }
    else {
      callback();
    }
  });
};
