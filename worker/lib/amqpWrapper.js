'use strict';


var amqp = require('./amqp');
var amqplib = require('./amqplib');

module.exports = function (config) {
    if (config.amqpDriver === 'amqplib') {
        return amqplib;
    }

    return amqp;
};
