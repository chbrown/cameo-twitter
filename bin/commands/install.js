/*jslint node: true */
var db = require('../../db');

module.exports = function(argv) {
  db.install(function(err) {
    if (err) throw err;
  });
};
