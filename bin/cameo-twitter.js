#!/usr/bin/env node
/*jslint node: true */
var logger = require('loge');
var os = require('os');

var optimist = require('optimist')
  .usage([
    'Usage: $0 <command> [<args>]',
    '',
    'commands:',
    '  install        Create the database and execute the schema, if needed',
    '  edges-work     Start the edge history worker in cluster mode',
    '  edges-add      Add user_ids / screen_names from file, argument, or STDIN',
    '  statuses-work  Start the user status worker in cluster mode',
    '  statuses-add   Add user ids / screen_names from file, argument, or STDIN',
    '',
  ].join('\n'))
  .describe({
    period: 'polling interval (seconds between fetching changes)',
    forks: 'number of subprocesses to fork for parallel tasks',
    help: 'print this help message',
    verbose: 'print extra output',
  })
  .alias({verbose: 'v'})
  .boolean(['help', 'verbose'])
  .default({
    forks: os.cpus().length,
    period: 3*60*60, // every three hours; 24*60*60 = seconds_per_day
  });

var argv = optimist.argv;
logger.level = argv.verbose ? 'debug' : 'info';
// Error.stackTraceLimit = 50;

if (argv.help) {
  optimist.showHelp();
}
else if (argv.version) {
  console.log(require('../package').version);
}
else {
  var commands = require('./cameo-twitter-commands');
  argv = optimist.check(function(argv) {
    if (argv._.length < 1) {
      throw new Error('You must specify a command');
    }
    if (commands[argv._[0]] === undefined) {
      throw new Error('Unrecognized command: ' + argv._[0]);
    }
  }).argv;

  commands[argv._[0]](argv);
}
