/*jslint node: true */

exports.HTTPError = function(incoming_message, body) {
  Error.call(this);
  Error.captureStackTrace(this, arguments.callee);
  this.name = 'HTTPError';
  this.message = 'HTTP Error ' + incoming_message.statusCode;
  this.incoming_message = incoming_message;
  this.body = body;
};

exports.ThrashError = function() {
  // raise to signal a loop to slow down, say, if you aren't getting any of the results you want
  Error.call(this);
  Error.captureStackTrace(this, arguments.callee);
  this.name = 'ThrashError';
  this.message = 'Thrash error';
};
