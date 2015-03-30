'use strict';

/**
 * module represents methods that allows to create a source
 * Source is a Readable stream that can send to the consumer
 * one or more messages
 *
 * @module messageSource
 */

var path = require('path');
var _ = require('lodash');
var hgl = require('highland');
var stream = require('./streamHelper');
var helper = require('./helper');
var messageHelper = require('./message');



module.exports = {
    /**
     * return a stream with messages from amqp queues.
     * Obtains a queue names using helper.getQueNames create an array
     * of stream for each of queues in the list merge them in one stream
     * and pipe to the messageParser
     *
     * @param  {object} program
     * @param  {Function} log
     * @param {ProcessRouter} queuePool
     * @return {Readable}
     */
    getQueueSource: function (program, log, queuePool) {
        var queueStream = hgl.pipeline(messageHelper.assignMessageMethods(queuePool, log));

        queuePool.addRoutes({
            'message:amqpQueue': function (message) {
                log('info', '[message from amqp]', _.merge({}, message.message, {incoming: true}));
                queueStream.write(message);
            }
        });

        queuePool.send('get:stream', 'amqpQueue');

        return queueStream;
    },

    /**
     * create a message from the application arguments and
     * push it to the readable stream
     *
     *
     * @param  {object} program
     * @param  {Functon} log     - function that could be used for logging
     * @return {Readable}
     */
    getDefaultSource: function (program, log) {
        var data = {
            //grab 'basedomain', 'url', 'page', 'locale' from arguments to the message
            message: _.pick(program, ['basedomain', 'url', 'page', 'locale'])
        };
        var values = {};

        if (program.values) {
            try {
                values = JSON.parse(program.values);
            } catch (e) {
                throw new Error('Wrong format of values parameter. Should be JSON');
            }
        }
        data.message = _.assign(data.message, values);
        data.key = messageHelper.createMessageKey(data.message);

        data.queueShift = function () {
            process.nextTick(function () {
                log('all jobs done. Exiting...');
                process.exit();
            });
        };

        log('creating source from command line kyes', helper.getMeta(data.message));
        return hgl([data]);
    },

    /**
     * obtains all static-old page create a message from each of them
     * and return a stream with all of those messages
     *
     * @param  {object} program
     * @param  {Function} log
     * @param  {string} basePath
     * @return {Readable}
     */
    getStaticOldSource: function (program, log, basePath) {
        if (!program.basedomain) {
            throw new Error('can not work without basedomain');
        }
        var duplex = stream.duplex();
        var message = _.pick(program, ['basedomain', 'locale']);
        log('creating source from static-old pages');
        var staticOldPath = path.join(basePath, 'page', program.basedomain, 'static-old');

        helper.getFolderFiles(staticOldPath, function (file) {
            return (new RegExp('^[^_].+\\.html$')).test(file.name);
        }, function (err, files) {
            if (!files.length) {
                log('error', 'there is no static-old for this domain');
            }

            var queueShift = function () {
                process.nextTick(function () {
                    log('all jobs done. Exiting...');
                    process.exit();
                });
            };

            var key = messageHelper.createMessageKey({page: 'static-old'});


            files.map(function (file) {
                var url = file.path.replace(staticOldPath + '/', '').replace(/\.html$/g, '');
                return {
                    message: {
                        locale: message.locale,
                        basedomain: message.basedomain,
                        url: url,
                        page: 'static-old/' + url,
                        staticOld: true
                    },
                    key: key,
                    queueShift: queueShift
                };
            })
            .forEach(function (file) {
                log('starting generation of new static old page %j', file, {});
                duplex.write(file);
            });
            duplex.end();
        });

        return duplex;
    }
};
