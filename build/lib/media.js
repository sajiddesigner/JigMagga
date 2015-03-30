'use strict';

var _ = require('lodash'),
    async = require('async'),
    path = require('path'),
    es = require('event-stream'),
    helper = require('./helper'),
    fs = require('fs'),
    walk = require('walk');

var configMerge = require('./configMerger');

var isPattern = new RegExp('\\*', 'i');


/**
 * obtains a list of file entities with mandatory size field in each object
 *
 * create a list of objects each of them has a list of file entities
 * summary size of them not more then limitGroupSize
 *
 * @param fileList
 * @param limitGroupSize
 * @return {Array}
 */
var createFileGroupsBySize = function (fileList, limitGroupSize) {
    var result = [],
        currentGroup = {size: 0, files: []};

    fileList.forEach(function (file) {
        if ((currentGroup.size + file.size) > limitGroupSize) {
            result.push(_.cloneDeep(currentGroup));
            currentGroup = {size: 0, files: []};
        }
        currentGroup.size += file.size;
        currentGroup.files.push(file);
    });
    result.push(currentGroup);
    return result;
};

/**
 * obtain a list of files by patterns using async file wolker
 * @param pattern
 * @param callback
 */
var getFilesByPattern = function (pattern, callback) {
    pattern = pattern.replace('**', '');
    var files = [];

    var walker = walk.walk(pattern, {});

    walker.on('files', function (root, stats, next) {
        stats = stats.map(function (item) {
            return {from: path.join(root, item.name)};
        });
        files = files.concat(stats);
        next();
    });

    walker.on('errors', function (root, nodeStatsArray, next) {
        next('error while getting all files');
    });

    walker.on('end', function () {
        callback(null, files);
    });

};

/**
 * generate upload destination path by source descriptor from filed and build options
 *
 * @param descriptor
 * @param from
 * @param buildOptions
 * @return {*}
 */
var generateDestination = function (descriptor, from, buildOptions) {
    var destination;

    if (!descriptor.to) {
        return path.join(buildOptions.namespace, from.replace(buildOptions.namespacePath, ''));
    }

    if (!isPattern.test(descriptor.from)) {
       return descriptor.to;
    }

    var fromWithoutPattern = descriptor.from.replace('**', '');
    var pathToFolder = path.join(buildOptions.namespacePath, fromWithoutPattern);
    var fileName = from.replace(pathToFolder, '');
    destination = path.join(descriptor.to, fileName);

    return destination;
};


/**
 * obtain a list of file paths from mediaSource
 * mediaSource property could conatin one descripor or an array of them
 *
 * @param buildOptions
 * @param callback
 */
var extractFilePath = function (buildOptions, callback) {
    var sourceDescriptor = buildOptions.package.mediaSource;

    var extractFromDescriptor = function (descriptor, cb) {
        var exactFilePath,
            isPatternFrom = isPattern.test(descriptor.from);

        if (!descriptor.from) {
            throw new Error('there is no from field in media source descriptor');
        }

        var domain = _.last(buildOptions.domain.split('/'));
        var parentDomain = _.first(buildOptions.domain.split('/'));

        descriptor.from = descriptor.from
            .replace('<%= domain %>', domain)
            .replace('<%= parentDomain %>', parentDomain)
            .replace('<%= domainPath %>', buildOptions.domain);

        exactFilePath = path.join(buildOptions.namespacePath, descriptor.from);

        var next = function (err, result) {
            if (err) {
                return cb(err);
            }

            result = result.map(function (item) {
                item.to = generateDestination(descriptor, item.from, buildOptions);
                return item;
            });
            cb(null, result);
        };

        if (isPatternFrom) {
            return getFilesByPattern(exactFilePath, next);
        }
        next(null, [{from: exactFilePath}]);
    };


    if (_.isArray(sourceDescriptor)) {
        return async.map(sourceDescriptor, extractFromDescriptor, function (err, res) {
            callback(err, _.flatten(res));
        });
    }

    return extractFromDescriptor(sourceDescriptor, callback);
};

module.exports = {
    getMediaSources: function () {
        /**
         * obtain media source descriptors from config
         * and push each descriptor with all other date like sepparate message
         */
        return es.through(function write(data) {
            var that = this;
            var config = configMerge.getProjectConfig(data.build.namespace);
            data.build.package = data.build.package || {};

            if (_.isString(data.data.assetdomain) && data.data.assetdomain.length) {
                var result = _.cloneDeep(data);
                result.build.package.mediaSource = config.media.assetdomain || [];
                that.emit('data', result);
                return;
            }

            if (data.build.uploadmedia === true) {
                return _.each(config.media, function (source, sourceName) {
                    if (sourceName !== 'assetdomain') {
                        var result = _.cloneDeep(data);
                        result.build.package.mediaSource = source;
                        that.emit('data', result);
                    }
                });
            }
            if (!config.media[data.build.uploadmedia]) {
                throw new Error('there is no such media source: ' + data.build.uploadmedia);
            }

            data.build.package.mediaSource = config.media[data.build.uploadmedia];
            that.emit('data', data);
        });
    },


    extractFilePaths: function () {

        return es.map(
            /**
             * obtain a list of resources of media files and emit a message for each resource
             * with paths of files
             *
             * @param {{build:{namespace: string}}} data
             */
            function (data, callback) {
                extractFilePath(data.build, function (err, files) {
                    if (err) {
                        return callback(err);
                    }
                    if (!files.length) {
                        console.log('there is no media files for mask:', data.build.package.mediaSource);
                        return callback(null);
                    }

                    data.build.package = data.build.package || {};
                    data.build.package.mediaFiles = files;
                    callback(null, data);
                });
            });
    },

    /**
     * upload media files vie mediaFiles list from package property
     * if there is one file in the list it uploads it directly if more than one
     * it will create one or more archives, each of them should not be more then 9.5mb
     * and upload them
     *
     * @param ps
     * @return {*}
     */
    upload: function (ps) {
        return es.map(function (data, callback) {
            ps.pause();
            var config = configMerge.getProjectConfig(data.build.namespace);
            var uploader = helper.getUploader(config, data.build, data.build.live);

            var onUpload = function (err, res) {
                if (err) {
                    if (err.code === 'ENOENT' && !data.build.package.mediaSource.required) {
                        console.log('meida file is absent but it is not required');
                        ps.resume();
                        return callback(null, data);
                    }
                    return callback(err);
                }

                console.log(res || 'all files uploaded');
                ps.resume();
                callback(null, data);
            };

            console.log('Start uploading files from media by mask:', data.build.package.mediaSource);

            if (data.build.package.mediaFiles.length === 1) {
                var file = data.build.package.mediaFiles[0];
                return uploader.uploadFile(file.from, file.to, {}, onUpload);
            }

            async.map(data.build.package.mediaFiles, function (file, next) {
                if (fs.existsSync(file.from)) {
                    fs.stat(file.from, function (err, stat) {
                        if (err) {
                            return next(err);
                        }
                        file.size = stat.size;
                        next(null, file);
                    });
                } else if(file.require){
                    next(new Error('meida file is absent but it is required'));
                } else{
                    console.log('meida file is absent but it is not required');
                    next(null, null);
                }
            }, function (err, files) {
                if (err) {
                    return onUpload(err);
                }
                // filter all files that non exits
                files = files.filter(function(file){
                    return file !== null;
                });

                if(files.length){
                    var fileGroups = createFileGroupsBySize(files, 9500000);

                    async.each(fileGroups, function (fileGroup, cb) {
                        console.log('starting to upload new fileGroup with size', fileGroup.size);
                        helper.uploadArchive(fileGroup.files, data.build, function (err, res) {
                            if (err) {
                                return cb(err);
                            }
                            console.log(res);
                            cb();
                        });
                    }, onUpload);
                } else {
                    onUpload(null, null);
                }

            });
        });
    }
};
