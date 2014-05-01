/*jslint node: true */
var _ = require('lodash');
var async = require('async');
var logger = require('loge');
var request = require('request');
var twilight = require('twilight');

var errors = require('./errors');

// exports.resolveScreenNames = function(screen_names, callback) {
//   /**
//   Can only handle 100 screen_names (at a time)

//   callback(Error | null, Array[Number] | null)
//   */
//   if (screen_names.length === 0) return callback(null, []);

//   twilight.getOAuth('~/.twitter', function(err, oauth) {
//     if (err) return callback(err);
//     request({
//       method: 'POST',
//       url: 'https://api.twitter.com/1.1/users/lookup.json',
//       oauth: oauth,
//       json: true,
//       form: {
//         screen_name: screen_names.join(',')
//       }
//     }, function(err, response, body) {
//       if (err) return callback(err);

//       if (response.statusCode != 200) {
//         return callback(new errors.HTTPError(response, body));
//       }

//       var user_ids = body.map(function(user) {
//         return user.id_str;
//       });
//       callback(null, user_ids);
//     });
//   });
// };

exports.getUsers = function(users, callback) {
  /** Get the user objects for a list of user_ids and/or screen_names.

  users is a list of {id_str: '18116587'} or {screen_name: 'chbrown'} objects

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
    // .on('response', function(response) {
    //   logger.debug('got response', response);
    // });
  });
};
