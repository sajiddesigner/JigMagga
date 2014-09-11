'use strict';

/**
 * Generator module. Obtains new message from worker,
 * Call api, generate JSON and HTML files
 */

var EventEmitter = require('events').EventEmitter,
    format = require('util').format,
    fs = require('fs'),
    _ = require('lodash'),
    path = require('path'),
    es = require('event-stream');

var log = require('../lib/logger')('generator', {component: 'generator', processId: process.pid}),
    archiver = require('../lib/archiver'),
    helper = require('../lib/helper'),
    stream = require('../lib/streamHelper'),
    ydGetText = require('jmUtil').ydGettext,
    generateConfig = require('./lib/generateConfig'),
    generator = require('./lib/generator'),
    ProcessRouter = require('../lib/router'),
    error = require('../lib/error'),
    TimeDiff = require('../lib/timeDiff');

var timeDiff = new TimeDiff(log);

var WorkerError = error.WorkerError;

//init process router
var router = new ProcessRouter(process);
log('started, pid', process.pid);

var config = require('../config');

var messageStream = stream.duplex();

router.addRoutes({
    /**
     * write to message stream the message that comes from generator
     * @param  {Object} data
     */
    'new:message': function (data) {
        messageStream.write(data);
    }
});

var handleError = function (text, data) {
    log('error', text, {error: true});

    return router.send('error', new WorkerError(text, data.message.origMessage, data.key));
};
/**
 * merge all configs and create viewContainer
 * @param  {object}   data [data from worker]
 * @param  {Function} next
 * @return {stream}
 */
var configStream = es.map(function (data, next) {
    var callback = function (err, res) {
        if (err) {
            handleError(err.stack || err, data);
            return next();
        }
        next(null, res);
    };
    generateConfig(data, config, callback);
});

var emitter = new EventEmitter();
emitter.on('call:parsing', function (name, config) {
    log('Parsing call for jig %s config: %j', name, config, {api:true});
});
emitter.on('call:success', function (requestId) {
    log('Api call success for %s', requestId, {api: true});
});

emitter.on('config:ready', function (readyConfigsLength, configsLength, url) {
    log('Config %d of %d for %s', readyConfigsLength, configsLength, url, {api: true});
});

/**
 * makes an api call for each message that comming to stream
 * returns the same data object with api call results in apiCallResult field
 *
 * @param  {object}   data
 * @param  {Function} next
 */
var apiStream = es.map(function (data, next) {
    log('[*] send api request', helper.getMeta(data.message));
    // Take first snapshot
    var apiMessageKey = generator.createApiMessageKey(data.key);
    var apiCallTimeDiff = timeDiff.create('apiCall:message:' + data.message.page);

    data.config.apiMessageKey = apiMessageKey;
    generator.apiCalls([data.config], emitter, function (err, res) {
        generator.deleteCachedCall(apiMessageKey);

        if (err) {
            var errorText = format('error in apiCall %j %j ', err, res);
            handleError(errorText, data);
            return next();
        }
        data.apiCallResult = res;
        apiCallTimeDiff.stop();
        return next(null, data);
    });
});

var lastLocale = '';
/**
 * loads locale file for each message if the file for that locale was not
 * loaded before
 *
 * @param  {object}   data
 * @param  {Function} callback
 */
var loadLocale = es.map(function (data, callback) {
    var domain = data.message.domain,
        locale = data.message.locale;
    if (lastLocale === domain + locale) {
        return callback(null, data);
    }
    ydGetText.locale(data.basePath, domain, locale, function () {
        lastLocale = domain + locale;
        callback(null, data);
    });

});

var saveZipToDisck = function (uploadList, data) {
    var archiveStream = archiver.bulkArchive(uploadList);
    var result = {
        message: data.message,
        key: data.key || undefined
    };

    log('creating zip file for message', helper.getMeta(data.message));
    var zipPath = helper.getZipName({}, data.message, data.basePath);
    archiveStream
        .pipe(fs.createWriteStream(zipPath))
        .on('finish', function () {
            log('[!] saved to %s', zipPath);
            result.zipPath = zipPath;
            router.send('new:zip', result);
        });
};
process.send({ready: true});


messageStream
    .pipe(configStream)
    .pipe(apiStream)
    .pipe(loadLocale)
    .pipe(es.through(function (data) {
        var that = this,
            saveDiskPath = path.join(data.basePath, '..'),
            knox = config.main.knox,
            json,
            uploadPages;

        var generatePageTimeDiff = timeDiff.create('generate:page:' + data.message.page);

        knox.S3_BUCKET = knox.S3_BUCKET || data.bucketName;
        try {

            ydGetText.setLocale(data.message.locale);
            generator.init(knox, ydGetText, saveDiskPath);
            // generate json and html files
            json = _.map(data.apiCallResult, generator.generateJsonPage);
            uploadPages = _.map(data.apiCallResult, function (config) {
                log('Processing page url: %s pagePath: %s', config.uploadUrl, config.pagePath);
                return generator.generatePage(config);
            });
        } catch (err) {
            return handleError(err.stack || err, data);
        }


        var result = {
                message: data.message,
                key: data.key || undefined
            },
            jsonLength = json.length,
            htmlLength = uploadPages.length;


        //create list of files to upload
        // result.uploadList = html.concat(_.flatten(json, true));
        for (var i = 0; i < jsonLength; i++) {
            uploadPages = uploadPages.concat(json[i]);
        }
        json = [];

        log('upload list length %d', uploadPages.length);
        generatePageTimeDiff.stop();
        //if html files amount is less then 200 send them to the worker
        if (htmlLength < 200) {
            that.emit('data', '');
            result.uploadList = uploadPages;
            router.send('pipe', result);
            return;
        } else {
            //if the amount is more then 200 create an archive write it to disk and
            //send to the worker the archive link

            saveZipToDisck(uploadPages, data);
        }
    }));

process.on('uncaughtException', error.getErrorHandler(log, function (err) {
    router.send('error', err);
}));

if (config.main.memwatch) {
    var memwatch = require('memwatch');

    memwatch.on('leak', function (info) {
        log('warn', '[MEMORY:LEAK] %j', info, {memoryLeak: true});
    });
}