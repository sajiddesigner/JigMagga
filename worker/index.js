#! /usr/bin/env node
'use strict';


/**
 * Main application module
 *
 * Responsibilities:
 *
 * - analyze application arguments
 * - creates generator and uploader child process
 * - creates a message source stream
 * - parse message add config to it and send them to generator
 * - obtain generated pages from generator process
 * - creates a zip for them if needed
 * - push them to the uploader via reddis or directly
 *
 * @module worker
 */

var _ = require('lodash'),
    path = require('path'),
    parseArguments = require('./parseArguments'),
    fs = require('fs-extra');

var config = require('./config');


var logger = require('./lib/logger'),
    ProcessRouter = require('./lib/router'),
    mainStream = require('./lib/mainStream'),
    helper = require('./lib/helper'),
    error = require('./lib/error'),
    messageSource = require('./lib/messageSource'),
    messageStorage = require('./lib/message').storage,
    TimeDiff = require('./lib/timeDiff');

// obtain application arguments by parsing command line
var program = parseArguments(process.argv);

var args = _.clone(process.argv).splice(2);
var log = logger('worker',  {basedomain: program.basedomain}, program);

// cleanup old build
if (program.clean) {
  fs.removeSync('./yd/build')
  console.log('Removed build folder')
}

var timeDiff = new TimeDiff(log);
var startTimeDiff = timeDiff.create('start');

var generatorStream = require('./generator/index');

log('started app pid %d current env is %s', process.pid, process.env.NODE_ENV);

if (program.longjohn) {
    console.log('long jhon enabled');
    require('longjohn');
}

var basePath = (program.namespace) ? path.join(process.cwd(), program.namespace) : process.cwd();
log('base project path is %s', basePath);

var amqpProcess = null;
if (program.queue) {
    amqpProcess = helper.createSubProcess('./worker/amqpProxy.js', args);
    var queuePool = new ProcessRouter(amqpProcess);
}

var uploaderRouter,
    uploader;

var workerErrorHandler = error.getWorkerErrorHandler(log, queuePool, messageStorage, program);

var uploaderRoutes = {
    'message:uploaded': function (key) {

        messageStorage.upload(key);

        generatorStream.emit('message:uploaded', key);

        log('message uploaded %s', key);
    },
    error: workerErrorHandler
};


// Creates an uploader child process,
// creates a router for them
helper.createChildProcesses(args, function (err, result) {
    if (err) {
        throw new Error(err);
    }

    uploader = result.uploader;
    uploaderRouter = new ProcessRouter(uploader);

    // add pipe handler a function that should be executed on pipe
    // event from the generator

    uploaderRouter.addRoutes(uploaderRoutes);

    var source;

    //creates a message source and pass it to the mainStream function
    if (program.queue) {
        source = messageSource.getQueueSource(program, log, queuePool);
    } else if (program.staticold) {
        source = messageSource.getStaticOldSource(program, log, basePath);
    } else {
        source = messageSource.getDefaultSource(program, log);
    }

    var main = mainStream(source, uploaderRouter, basePath, program);

    startTimeDiff.stop();

    main.on('new:message', function (message) {
        log('filtered message', message);
    });

    main.on('send:message', function (message) {
        log('send to generator', message);
    });

    main.on('error:message', workerErrorHandler);
    var exitHandler = error.getExitHandler(log, [uploader, amqpProcess]);

    process.on('SIGTERM', exitHandler);
    process.on('SIGHUP', exitHandler);
    uploader.on('exit', exitHandler);

    if (amqpProcess) {
        amqpProcess.on('exit', exitHandler);
    }
});

process.on('uncaughtException', error.getErrorHandler(log, workerErrorHandler));


if (config.main.nodetime) {
    console.log('connect to nodetime for profiling');
    require('nodetime').profile(config.main.nodetime);
}

if (config.main.memwatch) {
    var memwatch = require('memwatch');

    memwatch.on('leak', function(info) {
        log('warn', '[MEMORY:LEAK] %j', info, {memoryLeak: true});
    });
}
