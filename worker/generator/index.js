'use strict';

/**
 * Generator module. Obtains new message from worker,
 * Call api, generate JSON and HTML files
 */

var EventEmitter = require('events').EventEmitter,
    format = require('util').format,
    fsExtra = require('fs-extra'),
    util = require('util'),
    fs = require('fs-extra'),
    async = require('async'),
    _ = require('lodash'),
    path = require('path'),
    es = require('event-stream');

var args = require('../parseArguments')(process.argv);

var log = require('../lib/logger')('generator', {basedomain: args.basedomain}, args),
    archiver = require('../lib/archiver'),
    helper = require('../lib/helper'),
    stream = require('../lib/streamHelper'),
    ydGetText = require('jmUtil').ydGettext,
    generateConfig = require('./lib/generateConfig'),
    generator = require('./lib/generator'),
    WorkerError = require('../lib/error').WorkerError,
    TimeDiff = require('../lib/timeDiff');

var timeDiff = new TimeDiff(log);
var config = require('../config');

var messageStream = stream.duplex();

var handleError = function (text, data) {
    messageStream.emit('err', new WorkerError(text, data.message.origMessage, data.key));
};

// cleanup old build
fs.removeSync('./yd/build')
console.log('Removed build folder')


var emitter = new EventEmitter();
emitter.on('call:parsing', function (name, config) {
    log('Parsing call for jig %s config: %j', name, config, {api:true});
});
emitter.on('call:success', function (requestId, time, fromCache, page, url) {
    log('Api call success for %s', requestId, {api: true});

    if (!fromCache) {
        var logOptions = {
            timediff: true,
            diff: time,
            prefix: 'rest:call',
            page: page,
            url: url
        };
        log('info','time diff for %s', requestId, logOptions);
    }});

emitter.on('config:ready', function (readyConfigsLength, configsLength, url) {
    log('Config %d of %d for %s', readyConfigsLength, configsLength, url, {api: true});
});


/**
 * merge all configs and create viewContainer
 * @param  {object}   data [data from worker]
 * @param  {Function} next
 * @return {stream}
 */
var configStream = es.through(function (data) {
    var that = this;

    generateConfig(data, config, function (err, res) {
        if (err) {
            handleError(err.stack || err, data);
            return;
        }

        that.emit('data', res);
    });
});


/**
 * makes an api call for each message that comming to stream
 * returns the same data object with api call results in apiCallResult field
 *
 * @param  {object}   data
 * @param  {Function} next
 */
var apiStream = es.through(function (data) {
    var that = this;
    log('info', '[*] send api request', helper.getMeta(data.message));
    log('help', 'generating new message time %d', Date.now(), helper.getMeta(data.message));
    // Take first snapshot
    // var apiMessageKey = generator.createApiMessageKey(data.key);
    var apiCallTimeDiff = timeDiff.create('apiCall:message:' + data.message.page);

    data.config.apiMessageKey = data.key;

    generator.apiCalls([data.config], emitter, function (err, res) {

        if (err) {

            var errorText = format('error in apiCall %s', util.inspect(err));
            return handleError(errorText, data);
        }
        data.apiCallResult = res;
        apiCallTimeDiff.stop();
        return that.emit('data', data);
    });

});

var generateStream = es.through(function (data) {
    var saveDiskPath = path.join(data.basePath, '..'),
        knox = _.clone(config.main.knox),
        json,
        that = this;

    var generatePageTimeDiff = timeDiff.create('generate:page:' + data.message.page);

    knox.S3_BUCKET = data.bucketName;

    ydGetText.setLocale(data.message.locale);
    generator.init(knox, ydGetText, saveDiskPath);
    // generate json and html files

    json = _.map(data.apiCallResult, generator.generateJsonPage);

    if (data.config.uploadOnlyJson) {
        return this.emit('data', {data: data, json: json, html: []});
    }

    async.mapSeries(data.apiCallResult, function (config, next) {
        log('Processing page url: %s pagePath: %s', config.uploadUrl, config.pagePath);
        generator.generatePage(config, next);
    }, function (err, html) {
        if (err) {
            return  handleError(err.stack || err, data);
        }

        generatePageTimeDiff.stop();

        that.emit('data', {data: data, json: json, html: html});
    });

});

var lastLocale = {};
/**
 * loads locale file for each message if the file for that locale was not
 * loaded before
 *
 * @param  {object}   data
 */
var loadLocale = es.through(function (data) {
    var that = this,
        domain = data.message.domain,
        locale = data.message.locale;

    if (lastLocale[domain + locale]) {
        log('got from cache', {loadLocale: true, source: 'cache'});
        return that.emit('data', data);
    }
    ydGetText.locale(data.basePath, domain, locale, function () {
        log('loaded locale', {loadLocale: true, source: 'load'});
        lastLocale[domain + locale] = true;
        that.emit('data', data);
    });

});

/**
 * @name Metadata
 * @type {{
 *     bucketName: {String},
 *     origMessage: {Object},
 *     url: {String},
 *     page: {String},
 *     locale: {String},
 *     messageKey: {String}
 * }}
 */


/**
 *
 * @param {Object} message
 * @param {String} key
 * @param {String} bucketName
 * @param {Array.<UploadItem>} uploadPages
 */
var sendToWorker = function (message, key, bucketName, uploadPages) {

    var metaData = {
        bucketName: bucketName,
        url: message.url,
        page: message.page,
        locale: message.locale,
        origMessage: message.origMessage,
        messageKey: key
    };

    messageStream.emit('new:uploadList', metaData, uploadPages);
    messageStream.emit('api:done', key);
    uploadPages = null;

};

var saveZipToDisk = function (uploadList, data) {
    var archiveStream = archiver.bulkArchive(uploadList);
    var result = {
        message: data.message,
        key: data.key || undefined,
        bucketName: data.bucketName
    };

    log('creating zip file for message', helper.getMeta(data.message));
    var zipPath = helper.getZipName({}, data.message, data.basePath);


    fsExtra.ensureDir(path.join(data.basePath, 'tmp'), function (err) {
        archiveStream
            .pipe(fs.createWriteStream(zipPath))
            .on('finish', function () {
                log('[!] saved to %s', zipPath);
                result.zipPath = zipPath;
                messageStream.emit('new:zip', result);
                messageStream.emit('api:done', data.key);
            });
    });
};

messageStream
    .pipe(configStream)
    .pipe(apiStream)
    .pipe(loadLocale)
    .pipe(generateStream)
    .on('data', function (result) {

        var data = result.data,
            htmlFiles = result.html,
            fileList;

        fileList = htmlFiles.concat(_.flatten(result.json));

        log('info', 'upload list length %d', fileList.length,  helper.getMeta(data.message));
        //if the amount is more then 200 create an archive write it to disk and
        //send to the worker the archive link

        if (htmlFiles.length > 250) {
            return saveZipToDisk(fileList, data);
        }
        //if html files amount is less then 200 send them to the worker

        sendToWorker(data.message, data.key, data.bucketName, fileList);
    });

messageStream.on('message:uploaded', function (key) {
    log('deleting api cache for message with key %s', key);
});

module.exports = messageStream;
