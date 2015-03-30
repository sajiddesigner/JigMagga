'use strict';

var _ = require('lodash'),
    gelfStream = require('gelf-stream'),
    bunyan = require('bunyan'),
    bunyanLogstash = require('bunyan-logstash'),
    config = require('../config'),
    parseArguments = require('../parseArguments');

var program = parseArguments(process.argv);
var logLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

var logger;
var graylogConfig;
var graylogTransport;

/*
    An example of the graylog setting in the config file

        logger: {
            "graylog": {
                 "host": "graylog-domain.com",
                 "port": 12345
            }
        }
 */

function getGraylogConfig() {
    if (program.graylogHost && program.graylogPort) {
        return {
            host: program.graylogHost,
            port: program.graylogPort
        };
    }

    if (config.main.logger.graylog) {
        return config.main.logger.graylog;
    }

    return null;
}

function graylogLogger(graylogConf) {
    var graylog = gelfStream.forBunyan(graylogConf.host, graylogConf.port);
    return {
        type: 'raw',
        stream: graylog,
        level: 'info'
    };
}

logger = bunyan.createLogger({
    name: config.main.logger.name || 'htmlWorker',
    streams: [
        {
            level: config.main.logger.defaultLogLevel,
            type: 'raw',
            stream: bunyanLogstash.createStream({
                host: config.main.logger.logstash.host,
                port: config.main.logger.logstash.port
            })
        },
        {
            stream: process.stdout,
            level: 'debug'
        }
    ]
});

graylogConfig = getGraylogConfig();
if (graylogConfig) {
    graylogTransport = graylogLogger(graylogConfig);

    // GELF stream has to be explicitly ended
    process.on('exit', function () {
        logger.info('Exiting... %s', process.pid);
        graylogTransport.stream.end();
    });

    logger.addStream(graylogTransport);
}

/**
 * Logger works with stdout, graylog or/and logstash.
 *
 * <code>
 * var log = logger('worker',  {basedomain: program.basedomain}, program);
 * log('some information');
 * log('warn', 'another information');
 * </code>
 *
 * @param {String} component
 * @param {Object} metadata
 * @param {Object} processArguments
 * @returns {Function}
 */
module.exports = function (component, metadata, processArguments) {
    var childLogger;

    metadata = metadata || {};
    processArguments = processArguments || {};
    metadata.component = component;

    if (processArguments.tag) {
        metadata.tag = processArguments.tag;
    }

    childLogger = logger.child({metadata: metadata});

    // if using standard the standard bunyan logger (without logger factory)
    // uncomment the next statement
    // return logger;

    // factory for the old logging style
    return function loggerFactory() {
        var args = Array.prototype.slice.apply(arguments);
        var meta = args.pop();
        var func;

        if (process.env.NODE_ENV === 'silent') {
            return;
        }

        if (logLevels.indexOf(args[0]) !== -1) {
            // log level is known
            func = args.shift();
        } else {
            // unknown log level
            func = config.main.logger.defaultLogLevel;
        }

        if (_.isPlainObject(meta)) {
            meta = _.assign({}, meta, metadata);
            args.unshift(meta);
        } else {
            args.push(meta);
            args.unshift(metadata);
        }

        childLogger[func].apply(logger, args);
    };
};
