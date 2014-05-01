/*jslint node: true */
var db = require('../../db');
var statuses = require('../../statuses');
var fork = require('../../fork');

module.exports = function(argv) {
  fork(function(callback) {
    statuses.loop(callback);
  }, argv.forks);
};
