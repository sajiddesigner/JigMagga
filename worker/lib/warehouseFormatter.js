'use strict';

var configMerge = require('jmUtil').configMerge,
    path = require('path'),
    _ = require('lodash'),
    parseArgs = require('../parseArguments'),
    projectConfig = require('../config'),
    helper = require('./helper');

var args = parseArgs(process.argv);
var STATUSES = {
    new: 0,
    upload: 1,
    error: 3
};
var basePath = (args.namespace) ? path.join(process.cwd(), args.namespace, 'page') : process.cwd();

var getMessage = _.curry(function (message, bucket, status, url) {
    return {
        messageType: 'com.takeaway.events.cdn.page.PageAltered',
        data: {
            domain: message.basedomain,
            bucket: bucket,
            status: STATUSES[status],
            url: url.replace('{url}', message.url)
        }
    };
});

module.exports = {
    /**
     *
     * @param {WorkerMessage} message
     * @param {Function} callback
     */
    statusCheckerFormatter: function (status, message, callback) {
        message = message.originalMessage || message;

        if (!message.basedomain || !message.page) {
            return callback('wrong message format');
        }
        var bucket = args.bucket || helper.generateBucketName({message: message}, args, projectConfig.main.knox);

        configMerge.getPageConfig(basePath, message.basedomain, null, function (err, config) {
            if (err) {
                return callback(err);
            }


            var urls = config.pages[message.page],
                result;

            if (message.locale) {
                result = getMessage(message, bucket, status, urls[message.locale]);
            } else {
                result = _.values(urls).map(getMessage(message, bucket, status));
            }

            callback(null, result);
        });
    }
};
