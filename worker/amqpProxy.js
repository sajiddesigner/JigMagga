'use strict';

var args = require('./parseArguments')(process.argv);
var log = require('./lib/logger')('amqp', {basedomain: args.basedomain}, args);

var config = require('./config'),
    _ = require('lodash'),
    createMessageKey = require('./lib/message').createMessageKey,
    amqpWrapper = require('./lib/amqpWrapper'),
    error = require('./lib/error'),
    ProcessRouter  = require('./lib/router'),
    helper = require('./lib/helper');

var router = new ProcessRouter(process);


var amqp = amqpWrapper(config.amqp);
//if queue argument exists connect to amqp queues
var prefetch = args.prefetch || config.amqp.prefetch;
var connection = amqp.getConnection(config.amqp);
log('worker connected to AMQP server on %s', config.amqp.credentials.host);
var queues = helper.getQueNames(args, config.amqp);

log('queues in pool %j', queues, {});
var queuePool = new amqp.QueuePool(queues, connection, {prefetch: prefetch});


var publish = _.curry(function (queue, message) {
    queuePool[queue].publish(message);
});

var routes = {};

_.each(queues, function (queue, name) {
    routes['publish:' + name] = publish(name);
});
var storage = {};


var consumeMessage = function (queueName, message) {
    var data = {};

    try {
        data.message = amqp.QueuePool.parseMessage(message);
    } catch (e) {
        message.queueShift();
        router.send('error', new error.WorkerError('Date from queue is not JSON', message.toString()));
    }

    data.key = createMessageKey(message);

    storage[data.key] = message.queueShift.bind(message);


    router.send('message:' + queueName, data);
};

routes['ack:message'] = function (key) {
    if (_.isFunction(storage[key])) {
        storage[key]();
        delete storage[key];
    }
};

routes['get:stream'] = function (queueName) {
    var queueStream = queuePool[queueName].getStream();
    queueStream.on('ready', function (queue) {
        log('info', '%s queue stream is ready', queue);
    });

    queueStream.on('data', _.partial(consumeMessage, queueName));
    queueStream.on('error', error.getErrorHandler(log, function () {}));
};

router.addRoutes(routes);

process.on('uncaughtException', error.getErrorHandler(log, function (err) {
    router.send('error', err);
}));
