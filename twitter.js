/*jslint node: true */
var async = require('async');
var request = require('request');
var logger = require('loge');
var _ = require('underscore');
var twilight = require('twilight');


exports.resolveScreenNames = function(screen_names, callback) {
  /**
  Can only handle 100 screen_names (at a time)

  callback(Error | null, Array[Number] | null)
  */
  if (screen_names.length === 0) return callback(null, []);

  twilight.getOAuth('~/.twitter', function(err, oauth) {
    if (err) return callback(err);
    request({
      method: 'POST',
      url: 'https://api.twitter.com/1.1/users/lookup.json',
      oauth: oauth,
      json: true,
      form: {
        screen_name: screen_names.join(',')
      }
    }, function(err, response, body) {
      if (err) return callback(err);
      var user_ids = body.map(function(user) {
        return user.id_str;
      });
      callback(null, user_ids);
    });
  });
};