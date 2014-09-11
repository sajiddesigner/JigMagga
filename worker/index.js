#! /usr/local/bin/node
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
    getRedisClient = require('./lib/redisClient'),
    parseArguments = require('./parseArguments');

var config = require('./config');


var amqp = require('./lib/amqp'),
    log = require('./lib/logger')('worker', {component: 'worker', processId: String(process.pid)}),
    ProcessRouter = require('./lib/router'),
    mainStream = require('./lib/mainStream'),
    helper = require('./lib/helper'),
    error = require('./lib/error'),
    messageSource = require('./lib/messageSource'),
    TimeDiff = require('./lib/timeDiff');

var timeDiff = new TimeDiff(log);
var startTimeDiff = timeDiff.create('start');

var createPipeHandler = require('./lib/pipeHandler');

if (config.main.nodetime) {
    log('connect to nodetime for profiling');
    require('nodetime').profile(config.main.nodetime);
}

log('started app pid %d current env is %s', process.pid, process.env.NODE_ENV);

// obtain application arguments by parsing command line
var program = parseArguments(process.argv);

var basePath = (program.namespace) ? path.join(process.cwd(), program.namespace) : process.cwd();
log('base project path is %s', basePath);

if (program.queue) {
    // get redis Client
    var redisClient = getRedisClient(config.redis, function error(err) {
        log('redis Error %j', err, {redis: true});
    }, function success() {
        log('redis client is ready', {redis: true});
    });

    //if queue argument exists connect to amqp queues
    var connection = amqp.getConnection(config.amqp.credentials);
    var queues = helper.getQueNames(program, config.amqp);

    log('queues in pool %j', queues, {});
    var queuePool = new amqp.QueuePool(queues, connection, {prefetch: config.amqp.prefetch});
}

/**
 * handle non fatal error regarding with message parsing
 *
 * @param  {{origMessage: object, message: string, stack: string}} err
 */
var workerErrorHandler = function (err) {
    log('error', 'Error while processing message: %j',  err, err.originalMessage, {});
    if (!program.queue) {
        return;
    }

    //if there is shift function for this message in the storage shift message from main queue
    helper.executeAck(err.messageKey);

    var originalMessage = err.originalMessage || {};
    originalMessage.error = err.message;

    if (program.queue) {
        queuePool.amqpErrorQueue.publish(originalMessage);

        if (!program.live && !originalMessage.upload) {
            queuePool.amqpDoneQueue.publish(originalMessage);
        }
    }
};

var generatorRouter,
    uploaderRouter,
    uploader,
    generator;

var generatorRoutes = {
    /**
     * if zip is creating in the generator. Generator just send a link to it
     * to the worker and worker proxies this message to uploader
     *
     * @param  {{zipPath: string, message: object}} data
     */
    'new:zip': function (data) {
        log('new zip saved by generator', helper.getMeta(data.message));
        uploaderRouter.send('new:zip', {url: data.message.url, zipPath: data.zipPath});
    },
    error: workerErrorHandler
};

var uploaderRoutes = {
    'message:uploaded': function (key) {
        helper.executeAck(key);
        log('message uploaded %s', key);
    },
    error: workerErrorHandler
};

var args = _.clone(process.argv).splice(2);


// Creates a generator and uploader child processes,
// creates a router for them
helper.createChildProcesses(args, function (err, result) {
    if (err) {
        throw new Error(err);
    }

    uploader = result.uploader,
    generator = result.generator;

    generatorRouter = new ProcessRouter(generator);
    uploaderRouter = new ProcessRouter(uploader);

    generatorRoutes.pipe = createPipeHandler(uploaderRouter, queuePool, redisClient, workerErrorHandler);

    generatorRouter.addRoutes(generatorRoutes);
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

    var main = mainStream(source, generatorRouter, basePath, program);

    startTimeDiff.stop();

    main.on('new:message', function (message) {
        log('filtered message', message);
    });

    main.on('send:message', function (message) {
        log('send to generator', message);
    });

    main.on('error:message', workerErrorHandler);
});

process.on('uncaughtException', error.getErrorHandler(log, workerErrorHandler));


if (config.main.memwatch) {
    var memwatch = require('memwatch');

    memwatch.on('leak', function(info) {
        log('warn', '[MEMORY:LEAK] %j', info, {memoryLeak: true});
    });
}


process.on('SIGTERM', function () {
    log('warn', 'process terminated remotely', {exit: true});
    if (uploader && _.isFunction(uploader.kill)) {
        uploader.kill();
    }
    if (generator && _.isFunction(generator.kill)) {
        generator.kill();
    }
    process.exit();
});