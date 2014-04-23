/*jslint node: true */
var cluster = require('cluster');
var logger = require('loge');
var os = require('os');

module.exports = function(workFunction, forks) {
  /**
  workFunction: function(callback)
    callback: function(Error)

    the workFunction should not usually call the callback function, it should loop.

  forks: Number
    Number of forks to split off in parallel
  */
  if (forks === undefined) {
    forks = os.cpus().length;
  }
  if (cluster.isMaster) {
    logger.info('Starting cluster with %d forks', forks);
    cluster.on('exit', function(worker, code, signal) {
      logger.error('cluster: worker exit %d (pid: %d)', worker.id, worker.process.pid, code, signal);
      // fork new worker to replace dead one
      cluster.fork();
    });
    cluster.on('fork', function(worker) {
      logger.debug('cluster: worker fork %d (pid: %d)', worker.id, worker.process.pid);
    });

    // fork initial workers
    for (var i = 0; i < forks; i++) {
      cluster.fork();
    }
  }
  else {
    workFunction(function(err) {
      if (err) throw err;
      process.exit();
    });
  }
};
