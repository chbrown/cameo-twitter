/*jslint node: true */
var _ = require('lodash');
var async = require('async');
var logger = require('loge');
var request = require('request');
var twilight = require('twilight');

var errors = require('./errors');

exports.getUsers = function(users, callback) {
  /** Get the user objects for a list of user_ids and/or screen_names.

  users is a list of {id_str: '18116587'} or {screen_name: 'chbrown'} objects

  This API method can only handle 100 screen_names at a time

  callback: function(Error | null, Array[Object] | null)
  */
  function attrFunc(attr) {
    return function(obj) { return obj[attr]; };
  }
  // apparently Twitter is happy with both
  var form = {
    user_id: users.filter(attrFunc('id_str')).map(attrFunc('id_str')).join(','),
    screen_name: users.filter(attrFunc('screen_name')).map(attrFunc('screen_name')).join(','),
  };

  twilight.getOAuth('~/.twitter', function(err, oauth) {
    if (err) return callback(err);
    request({
      method: 'POST',
      url: 'https://api.twitter.com/1.1/users/lookup.json',
      oauth: oauth,
      timeout: 10000,
      json: true,
      form: form,
    }, function(err, response, body) {
      if (err) return callback(err);
      if (response.statusCode != 200) {
        if (response.statusCode == 404) {
          logger.error('HTTP 404; considering all users missing;', body);
          body = [];
        }
        else {
          return callback(new errors.HTTPError(response, body));
        }
      }
      // logger.debug('twitter response', body);
      var find = function(user) {
        if (user.id_str) {
          return _.findWhere(body, user);
        }
        else {
          // search by screen_name must be case insensitive
          var needle = user.screen_name.toLowerCase();
          return _.find(body, function(full_user) {
            return full_user.screen_name.toLowerCase() == needle;
          });
        }
      };

      // extend the original objects
      users.forEach(function(user) {
        _.extend(user, find(user));
      });

      callback(null, users);
    });
  });
};

exports.getUserStatuses = function(user_id, max_id, callback) {
  twilight.getOAuth('~/.twitter', function(err, oauth) {
    if (err) return callback(err);

    var query = {
      user_id: user_id,
      count: 200,
      trim_user: true,
      exclude_replies: false,
      contributor_details: true,
      include_rts: true,
    };

    if (max_id !== undefined) {
      query.max_id = max_id;
    }

    // options: https://dev.twitter.com/docs/api/1.1/get/statuses/user_timeline
    request({
      method: 'GET',
      url: 'https://api.twitter.com/1.1/statuses/user_timeline.json',
      oauth: oauth,
      timeout: 10000,
      json: true,
      qs: query,
    }, function(err, response, body) {
      if (err) return callback(err);

      if (response.statusCode != 200) {
        return callback(new errors.HTTPError(response, body));
      }
      callback(null, body);
    });
  });
};

exports.getUserFollowers = function(user_id, callback) {
  // callback: function(Error | null, Array[String])
  twilight.getOAuth('~/.twitter', function(err, oauth) {
    if (err) return callback(err);

    request({
      method: 'GET',
      // https://dev.twitter.com/docs/api/1.1/get/followers/ids
      url: 'https://api.twitter.com/1.1/followers/ids.json',
      oauth: oauth,
      timeout: 10000,
      json: true,
      qs: {
        user_id: user_id,
        stringify_ids: 'true',
      },
    }, function(err, response, body) {
      if (err) return callback(err);

      if (response.statusCode != 200) {
        return callback(new errors.HTTPError(response, body));
      }
      callback(null, body.ids);
    });
  });
};

exports.getUserFriends = function(user_id, callback) {
  // callback: function(Error | null, Array[String])
  twilight.getOAuth('~/.twitter', function(err, oauth) {
    if (err) return callback(err);

    request({
      method: 'GET',
      // https://dev.twitter.com/docs/api/1.1/get/friends/ids
      url: 'https://api.twitter.com/1.1/friends/ids.json',
      oauth: oauth,
      timeout: 10000,
      json: true,
      qs: {
        user_id: user_id,
        stringify_ids: 'true',
      },
    }, function(err, response, body) {
      if (err) return callback(err);

      if (response.statusCode != 200) {
        return callback(new errors.HTTPError(response, body));
      }
      callback(null, body.ids);
    });
  });
};
