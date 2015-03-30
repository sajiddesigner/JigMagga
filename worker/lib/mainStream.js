'use strict';

var hgl = require('highland'),
    _ = require('lodash'),
    EventEmitter = require('events').EventEmitter;

var dependentPageSplitter = require('./dependentPageSplitter'),
    configMerge = require('./configMerge'),
    messageHelper = require('./message'),
    helper = require('./helper');

var generatorStream = require('../generator/index');
var args = require('../parseArguments')(process.argv);

var log = require('./logger')('worker', {basedomain: args.basedomain}, args);

var config = require('../config');

var messageStorage = messageHelper.storage;

/**
 * Pipes message from source stream to filter stream then to configuration
 * then split them by locale or pages and then send a messages to generator process
 *
 * @param  {Readable} source
 * @param  {{send: function}}   uploader
 * @param  {String} basePath
 * @param  {{live: boolean, bucket: ?string}} program
 */
module.exports = function (source, uploader, basePath, program) {
    var emitter = new EventEmitter();

    source.pipe(hgl.pipeline(
        messageHelper.checkBaseDomain(basePath),
        messageHelper.validateStream(emitter, basePath, config),
        configMerge.getConfigStream(),
        messageHelper.pageLocaleSplitter(),
        dependentPageSplitter(config),
        hgl.map(function (data) {
            messageStorage.add(data.key, data.onDone, data.queueShift);
            data.onDone = data.queueShift = null;

            data.message = messageHelper.extendMessage(data.message, program, data.config);
            data.bucketName = helper.generateBucketName(data, program, config.main.knox);
            emitter.emit('send:message', data.message.origMessage);
            return data;
        }),
        hgl.errors(function (err) {
            emitter.emit('error:message', err);
        })
    ))
    .pipe(generatorStream);

    generatorStream.on('new:uploadList', function (metadata, uploadList) {
        metadata.bucketName = program.bucket || metadata.bucketName;

        if (!program.write) {
            uploader.send('pipe', helper.stringifyPipeMessage(metadata, uploadList));
            uploadList = null;
            return;
        }

        // if write argument is true worker stores all generated files
        //in disk
        helper.saveFiles(uploadList, log, function (err) {
            if (err) {
                return log('error', err);
            }
            messageStorage.upload(metadata.messageKey);
            log('all files saved successfully');
        });

        uploadList = null;
    });


    generatorStream.on('api:done', function (key) {
        messageStorage.done(key);
    });

    /**
     * if zip is creating in the generator. Generator just send a link to it
     * to the worker and worker proxies this message to uploader
     *
     * @param  {{zipPath: string, message: object}} data
     */
    generatorStream.on('new:zip', function (data) {
        log('new zip saved by generator', helper.getMeta(data.message));

        uploader.send('new:zip', {
            origMessage: data.message.origMessage,
            url: data.message.url,
            page: data.message.page,
            locale: data.message.locale,
            zipPath: data.zipPath,
            bucketName: program.bucket || data.bucketName,
            messageKey: data.key
        });
    });

    generatorStream.on('err', function (err) {
        emitter.emit('error:message', err);
    });

    return emitter;
};
