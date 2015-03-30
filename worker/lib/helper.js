'use strict';
var _ = require('lodash'),
    walk = require('walk'),
    async = require('async'),
    format = require('util').format,
    fsExtra = require('fs-extra'),
    path = require('path'),
    spawn = require('child_process').spawn;


var METADATA_CHUNK_IDENTIFIER = '@@:::@@';

//TODO: move to domain config
var IGNORED_URLS = ['unknown-977514', 'test-blizzeria-hamburg-rotherbaum'];

module.exports = {
    /**
     * check correctness of URL
     *
     * @param  {string} url
     * @return {boolean}
     */
    isUrlCorrect: function (url) {
        var regexp = new RegExp('[^a-zA-Z0-9-_//]+', 'i');

        return !regexp.test(url) && !_.contains(IGNORED_URLS, url);
    },

    /**
     * check correctness of URL
     *
     * @param  {string} url
     * @return {boolean}
     */
    isDomainCorrect: function (url) {
        var regexp = new RegExp('[^a-zA-Z0-9-_//./]+', 'i');

        return !regexp.test(url);
    },

    /**
     * returns a an object with main queue and error queue names
     * based on program priority keys, basedomain and prefix
     *
     * @param  {object} program
     * @param  {object} config
     * @return {{amqpQueue: string, amqpErrorQueue: string}}
     */
    getQueNames: function (program, config) {

        var amqpQueue = config.queueBaseName;
        var amqpErrorQueue = config.queueErrorBaseName;

        var domain = (program.basedomain) ? program.basedomain.split('/')[0] : '';

        if (domain) {
            amqpQueue += '.' + domain;
            amqpErrorQueue = amqpErrorQueue.replace('error', domain + '.error');
        }

        if (program.errorqueue) {
            amqpQueue = amqpErrorQueue;
            amqpErrorQueue = amqpErrorQueue + '.error';
        } else if (program.errorerrorqueue) {
            amqpQueue = amqpErrorQueue + '.error';
        }

        var prefixes = config.prefixes;

        var priorities = ['lowprio', 'mediumprio', 'highprio'];

        var priority = priorities.reduce(function (current, next) {
            return program[next] ? next :  current;
        }, 'default');

        amqpQueue += prefixes[priority];
        amqpErrorQueue += prefixes[priority];

        if (program.postfix) {
            amqpQueue += '.' + program.postfix;
        }
        var queues = {
            amqpQueue: amqpQueue,
            amqpErrorQueue: amqpErrorQueue,
            amqpDoneQueue: (program.live) ? 'pages.generate.deploy.done' : 'pages.generate.done'
        };

        if (program.deployuncached) {
            var defaultName = 'pages.generate.deploy';
            queues.amqpDeployQueue = _.isString(program.deployuncached) ? program.deployuncached : defaultName;
        }

        return queues;
    },

    /**
     * create sub process based on child_process spawn command
     * with pipe and ipc channels enabled.
     * if callback is present it waits for ready message from a child
     * end return process instance in callback
     *
     * @param  {string}   modulePath - path to js file that will be executed like a process
     * @param  {array}    args       - arguments that will be passed to a module
     * @param  {Function} callback
     */
    createSubProcess: function (modulePath, args, callback) {
        if (_.isFunction(args)) {
            callback = args;
            args = [];
        }
        args = args || [];

        var options = {stdio: [0, 1, 2, 'pipe', 'ipc']},
            child,
            waitTime;
        if (args[0] !== 'debug' && args[0] !== 'prof') {
            args.unshift(modulePath);
        } else if (args[0] === 'debug') {
            args[0] = modulePath;
            args.unshift('--debug-brk');
        } else if (args[0] === 'prof') {
            args[0] = modulePath;
            args.unshift('--prof');
        }

        args.unshift('--stack-size=64000');

        child = spawn(process.execPath, args, options);
        if (!_.isFunction(callback)) {
            return child;
        }

        waitTime = (function (path) {
            return setTimeout(function () {
                callback('child process did not send a ready message :' + path);
                child.kill();
            }, 15000);
        }(modulePath));

        var onMessage = function onMessage(data) {
            if (!data.ready) {
                return;
            }
            child.removeListener('message', onMessage);
            callback(null, child);
            clearTimeout(waitTime);
        };

        child.on('message', onMessage);
    },

    /**
     * returns a name of zip archive for a message based on page name, url, locale
     * and current date
     * if write key is a string it uses it like a relative path to the folder with zip files
     *
     * @param  {{write: boolean}} program
     * @param  {{page: string, url: string, locale: string}} message
     * @param  {string} basePath
     * @return {string}
     */
    getZipName: function (program, message, basePath) {
        var page = encodeURIComponent(message.page),
            url = encodeURIComponent(message.url);

        var zipFileName = format('%s-%s-%s-%d.zip', page, url, message.locale, Date.now()),
            destinationPath;

        destinationPath = (_.isString(program.write)) ?
            path.join(process.cwd(), program.write) : path.join(basePath, 'tmp');

        return path.join(destinationPath, zipFileName);

    },

    /**
     * save files on disk from file list
     * create the path for each file if it does not exist
     *
     * @param {Array.<{path:String, content:String}>} fileList
     * @param {function} log
     * @param {function} callback
     */
    saveFiles: function (fileList, log, callback) {
        async.each(fileList, function (file, next) {
            fsExtra.outputFile(file.path, file.content, next);
        }, callback);
    },

    /**
     * creates a generator and uploader process in asynchronous mode
     *
     * @param  {array.<String>}   args      - array that throw to each process
     * @param  {Function} callback
     */
    createChildProcesses: function (args, callback) {
        if (_.isFunction(args)) {
            callback = args;
            args = [];
        }
        var that = this;
        async.parallel({
            //generator: function (next) {
            //    that.createSubProcess(__dirname + '/../generator/index.js', _.cloneDeep(args), next);
            //},
            uploader: function (next) {
                that.createSubProcess(__dirname + '/../uploader/index.js', _.cloneDeep(args), next);
            }
        }, callback);
    },

    /**
     * generate the name of bucket using message basedomain and
     * knox.buckets list from config
     *
     * @param  {{message: {basedomain: string}}}               data
     * @param  {{live: boolean, liveuncached: boolean}}        program
     * @param  {{S3_BUCKET: ?string, buckets: {live: Object, stage: Object, deploy: Object}}} config
     * @return {string}
     */
    generateBucketName: function (data, program, config) {
        var domainNames = data.message.basedomain.split('/');

        var parentDomain = domainNames[0];
        var baseDomain = domainNames.length === 1 ? domainNames[0] : domainNames.reverse()[0];

        var buckets = config.buckets;

        var generateLiveName = function (baseDomain, parentDomain, buckets) {
            if (!buckets) {
                return 'www.' + baseDomain;
            }
            var isSatellite = _.first(parentDomain.split('.')) === 'satellites';

            var satellites = buckets.satellites;


            if (isSatellite && satellites && satellites['www-prefixed'] &&
                satellites['www-prefixed'].indexOf(parentDomain) === -1) {
                return baseDomain;
            }

            return 'www.' + baseDomain;
        };

        if (config.S3_BUCKET) {
            return config.S3_BUCKET;
        }

        if (program.live || program.liveuncached) {
            return buckets && buckets.live && buckets.live[baseDomain] ? buckets.live[baseDomain]
                : generateLiveName(baseDomain, parentDomain, buckets);
        }

        return buckets && buckets.stage && buckets.stage[baseDomain] ? buckets.stage[baseDomain]
            : 'stage.' + baseDomain;
    },

    isDomainInSkipList: function (domain, skipDomains) {
        if (!skipDomains) {
            return false;
        }

        return skipDomains.indexOf(domain) >= 0;
    },

    /**
     * check correctness of message object. It must have basedomain field and this
     * domain should not be in the skip list. It should have both url and page fields
     * or should not have both of them
     *
     * @param  {object}  message
     * @param  {object}  comfig
     * @return {Boolean}
     */
    isMessageFormatCorrect: function (message, config) {
        var isEmptyError = function (message) {
            return !message.page && !message.url && message.error && message.status === 300
        };

        return Boolean((message && !isEmptyError(message) && message.basedomain &&
            !this.isDomainInSkipList(message.basedomain, config.main.skipDomains)));
    },

    /**
     * create a meta data for log message from message object
     *
     * @param  {object} msg
     * @return {object}
     */
    getMeta: function (msg) {
        return _.pick(msg, ['page', 'url', 'locale', 'basedomain']);
    },

    /**
     * get a list of file from folder recursively
     * predicate param is a function that allow to filter files
     *
     * @param  {string}      folderPath  - path to folder
     * @param  {?Function}   predicate   - if exists executed for each file if it returns true file is included to result
     * @param  {Function}    callback
     */
    getFolderFiles: function (folderPath, predicate, callback) {
        if (!callback) {
            callback = predicate;
            predicate = null;
        }
        var walker = walk.walk(folderPath, {});
        var files = [];

        walker.on('files', function (root, stats, next) {
            stats = stats.map(function (stat) {
                stat.path = path.join(root, stat.name);
                return stat;
            });

            if (_.isFunction(predicate)) {
                stats = stats.filter(predicate);
            }

            files = files.concat(stats);
            next();
        });

        walker.on('errors', function (root, nodeStatsArray, next) {
            next('error while getting all files');
        });

        walker.on('end', function () {
            callback(null, files);
        });

    },

    /**
     *
     * @param {Metadata} metadata
     * @param {Array.<UploadItem>} archive
     */
    stringifyPipeMessage: function (metadata, archive) {
        metadata = JSON.stringify(metadata) + METADATA_CHUNK_IDENTIFIER;

        archive = JSON.stringify(archive);

        return Buffer.concat([new Buffer(metadata), new Buffer(archive)]);
    },

    /**
     *
     * @param {Buffer} message
     * @return {{metadata: Metadata, pages: Array.<UploadItem>}}
     */
    parsePipeMessage: function (message) {
        message = Buffer.isBuffer(message) ? message.toString() : message;

        message = message.split(METADATA_CHUNK_IDENTIFIER);
        return {
            metadata: JSON.parse(message[0]),
            pages: JSON.parse(message[1])
        };
    }
};
