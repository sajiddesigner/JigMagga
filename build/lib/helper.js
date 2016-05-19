'use strict';


var path = require('path'),
    async = require('async'),
    es = require('event-stream'),
    extend = require('deep-extend'),
    archiver = require('archiver'),
    Uploader = require('jmUtil').ydUploader,
    configMerger = require('./configMerger'),
    originalFs = require('fs'),
    fs = require('fs-extra');

/**
 * create a stream that archives all files in list
 * if there is a from field in file entity file should be added via readStream from disk
 * in other case content filed should be present
 *
 * @param {Array<{content: ?string, from: ?string, to:string}>} fileList
 * @return {*}
 */
var getArchiveStream = function (fileList) {
    var archive = archiver('zip');

    fileList.forEach(function (item) {
        var extension = item.to.substr(-4);
        var store = (extension === '.jpg' || extension === '.png' || extension === '.pdf');
        var source;
        if (item.from) {
            source = originalFs.createReadStream(item.from);
        } else if (item.content) {
            source = Buffer.isBuffer(item.content) ? item.content : new Buffer(item.content);
        } else {
            throw new Error('can not add item to archive without from or content field');
        }

        archive.append(source, {name: item.to, store: store});
    });

    archive.finalize();
    return archive;
};

/**
 * create stream tha store file as a zip archive to the disk
 * and after it upload this file
 *
 * @param uploader
 * @param buildOptions
 * @param callback
 * @return {*}
 */
var uploaderStream = function (uploader, buildOptions, callback) {
    var random = Math.round(Math.random() * 1000);

    var zipName = 'zip' + Date.now() + '_' + random + '.zip';
    var pathToTmp = path.join(buildOptions.jigMaggaPath, 'tmp');
    var pathToZip = path.join(pathToTmp, zipName);

    fs.ensureDirSync(pathToTmp);


    var stream = fs.createWriteStream(pathToZip);

    stream.on('finish', function () {
        console.log('File generated', pathToZip);


        uploader.uploadFile(pathToZip, zipName, {deleteAfter: true}, callback);
    });

    return stream;
};

/**
 * list of pages with files that should be uploaded
 * @type {Object<string, array>}
 */
var uploadList = {};

var addToUploadList = function (item, page) {
    if (!uploadList[page]) {
        uploadList[page] = [];
    }

    uploadList[page].push(item);
};


var uploaderInstance;

module.exports = {

    /**
     * return an instance of uploader
     *
     * @param {object} config
     * @param {string} domain
     * @param {boolean} isLive
     * @return {Uploader}
     */
    getUploader: function (config, buildOptions, isLive) {
        var env = isLive ? 'live': 'stage',
            domain = buildOptions.domain;

        if (uploaderInstance) {
            return uploaderInstance;
        }

        var knoxOptions = config.main.knox;

        // you can set a --bucket argument
        if(buildOptions.bucket){
            knoxOptions.S3_BUCKET = buildOptions.bucket;
        }


        if (!knoxOptions.S3_BUCKET) {
            var predefinedDomainBucket = knoxOptions.buckets[env][domain];

            if (!predefinedDomainBucket) {
                knoxOptions.S3_BUCKET = (isLive ? 'www' : 'stage') + '.' + domain;
            } else {
                knoxOptions.S3_BUCKET = predefinedDomainBucket;
            }
        }

        uploaderInstance = new Uploader(knoxOptions);
        return uploaderInstance;
    },


/**
     * prepare a build stream which include all informations about the build
     * @param program
     * @returns {*}
     */
    createStreamWithSettings: function (program) {
        var self = this;
        return es.readable(function (count, callback) {
            var options = {};
            if (program.uploadmedia) {
                program.jsgenerate = false;
                program.cssgenerate = false;
                options.uploadmedia = program.uploadmedia;
            }

            options.namespace = program.namespace || "yd";
            options.namespacePath = path.normalize(__dirname + "/../../" + options.namespace);
            options.jigMaggaPath = path.normalize(__dirname + "/../..");
            options.basePath = self.getBasePath(options.namespace, program.basepath);
            options.defaultPath = options.basePath + "/default";
            options.domain = program.basedomain;
            options.jsgenerate = program.jsgenerate || program.jsgenerate === undefined ? true : false;
            options.cssgenerate = program.cssgenerate || program.cssgenerate === undefined ? true : false;
            options.minify = program.minify || program.minify === undefined ? true : false;
            options.page = program.page;
            options.versionnumber = program.versionnumber;
            options.live = program.live;
            options.upload = program.upload;
            options.bucket = program.bucket;
            if (!options.domain) {
                throw new Error("no domain");
            }
            if (!options.page && !options.uploadmedia) {
                throw new Error("no page");
            }
            var data = {
                build: options
            };
            this.emit('data', data);
            this.emit('end');
            callback();
        });
    },
    /**
     *
     * @param namespace
     * @param basepath
     * @returns {string}
     */
    getBasePath: function (namespace, basepath) {
        namespace = namespace || "yd";
        basepath = basepath || "page";
        var basePath = path.normalize(__dirname + "/../../" + namespace + "/" + basepath);
        if (!fs.existsSync(basePath)) {
            throw new Error("Basepath not exists: " + basePath);
        }
        return basePath;
    },
    /**
     * get a real file from path use also default
     * @param path
     * @param fileextension
     * @returns {*}
     */
    getFileFromPath: function (path, fileextension) {
        fileextension = fileextension || "js";
        path = path || "";
        return path.replace(/\/([^/]*)$/, "/$1/$1." + fileextension);
    },
    /**
     *
     * @param namespace
     * @returns {*}
     */
    setNameSpacePath: function (namespace) {
        namespace = namespace || "yd";
        return es.map(function (data, callback) {
            data.build = data.build || {};
            data.build.namespacePath = path.normalize(__dirname + "/../../" + namespace);
            callback(null, data);
        });
    },
    /**
     *
     * @param path
     * @param root
     * @returns {*}
     */
    getRelativePathFromStealRootPath: function (path, root) {
        return path.replace(root, "").replace(/^\//, "");
    },
    /**
     * split all pages that are in the stream array in single streams and parse them into the flow
     * @returns {*}
     */
    splitPagesIntoSingleStreams: function () {
        return es.through(function write(data) {
            for (var i = 0; i < data.length; i++) {
                var dataCopy = extend({}, data[i]);
                this.emit('data', dataCopy);
            }
        });

    },
    /**
     * join all pages to one single array stream
     * @returns {*}
     */
    joinPagesIntoSingleStreams: function () {
        var arry = [];
        return es.through(function (data) {
                arry.push(data);
            },
            function () {
                this.emit('data', arry);
                this.emit('end');
            });
    },
    /**
     * dublicat one page object into many browser and locales
     * need a stream with a single page object
     * @returns {*}
     */
    duplicatePagesForLocalesAndBrowsers: function () {
        return es.through(function write(data) {
            data.locales = data.locales || [];
            data.browsers = data.browsers || [];
            for (var i = 0; i < data.locales.length; i++) {
                for (var y = -1; y < data.browsers.length; y++) {
                    data.build.browser = data.browsers[y] || null;
                    data.build.locale = data.locales[i];
                    this.emit('data', extend({}, data));
                }
            }
        });
    },
    /**
     *
     * @returns {*}
     */
    bufferAllPagesAndWaitingForDoneEvent: function () {
        var selfHelper = this,
            buffer = [];
        return es.through(function write(data) {
                buffer.push(data);
            },
            function end() { //optional
                var self = this;
                var timer = setInterval(function () {
                    if (buffer.length && !selfHelper.inProgress) {
                        selfHelper.inProgress = true;
                        self.emit('data', buffer.pop());
                    } else if (!buffer.length) {
                        clearInterval(timer);
                        self.emit('end');
                    }
                }, 100);
            }
        );
    },
    triggerDonePageEvent: function () {
        var selfHelper = this;
        return es.map(function (data, callback) {
            console.log("DONE : ", data.build.page);
            selfHelper.inProgress = false;
            callback(null, data);
        });
    },
    loadFileFromStealOptions: function (options) {
        var src = typeof options.src === "string" ? options.src : options.src.path;
        return fs.readFileSync(src, {
            encoding: "utf8"
        });
    },

    uploadArchive: function (fileList, buildOptions, callback) {
        var config = configMerger.getProjectConfig(buildOptions.namespace);
        var uploader = this.getUploader(config, buildOptions, buildOptions.live);

        getArchiveStream(fileList)
            .pipe(uploaderStream(uploader, buildOptions, callback));
    },


    /**
     * upload content to cdn
     *
     * @param {string} fileContent
     * @param {string} uploadPath
     * @param {string} extension
     * @param {{namespace: string, domain: string, live: boolean, jsgenerate: boolean}} buildOptions
     */
    uploadContent: function (fileContent, uploadPath, extension, buildOptions, callback) {
        var config = configMerger.getProjectConfig(buildOptions.namespace);
        var uploader = this.getUploader(config, buildOptions, buildOptions.live);

        var contentType = extension === 'js' ? 'application/javascript' : 'text/css';

        uploadPath += '.' + extension;

        uploader.uploadContent(fileContent, uploadPath, {type: contentType}, function (err, res) {
            if (err) {
                return callback(err);
            }
            callback(null, res);
        });
    },

    uploadFiles: function (uploadList, buildOptions, callback) {
        var onUpload = function (err, res) {
            if (err) {
                callback(err);
                return process.stdout.write('Error while uploading: ' + err + '\n');
            }
            process.stdout.write(res + '\n');
            callback();
        };

        if (uploadList.length === 1) {
            var file = uploadList[0];
            process.stdout.write('Start uploading  of single file to: ' + file.to + '\n');
            return this.uploadContent(file.content, file.to, file.ext, buildOptions, onUpload);
        }

        uploadList = uploadList.map(function (file) {
            file.to = file.to + '.' + file.ext;
            process.stdout.write('Start adding to archive and uploading to: ' + file.to + '\n');
            return file;
        });

        this.uploadArchive(uploadList, buildOptions, onUpload);

    },
    /**
     * TODO the data stream is no array anymore rewrite that to use single object.
     * @returns {*}
     */
    saveFileToDiskOrUpload: function () {
        var that = this;
        return es.map(function (data, callback) {
            if(!Array.isArray(data)){
                data = [data];
            }
            var fullPath,
                browser,
                buildOptions = data[0].build,
                uploadPath,
                name;

            uploadList = {};

            data.forEach(function (item) {
                browser = item.build.browser ? Object.keys(item.build.browser).filter(function (a) {
                    return a !== "version";
                }).join() + item.build.browser.version : null;
                name = [];
                browser && name.push(browser);
                item.build.locale && name.push(item.build.locale);
                item.build.versionnumber && name.push(item.build.versionnumber);
                fullPath = item.build.pageHTMLPath.replace(/[^/]*$/, "") + "production-" + name.join("-");
                if (!item.build.upload) {
                    if(item.build.jsgenerate) {
                        fs.outputFileSync(fullPath + ".js", item.build.package.js);
                    }
                    if(item.build.cssgenerate) {
                        fs.outputFileSync(fullPath + ".css", item.build.package.css);
                    }

                    return process.stdout.write("Save Files to: " + fullPath + "\n");
                }

                uploadPath = fullPath.replace(item.build.jigMaggaPath + '/', '');


                if (item.build.jsgenerate) {
                    //that.uploadContent(item.build.package.js, uploadPath, 'js', item.build);
                    addToUploadList({content: item.build.package.js, to:uploadPath, ext: 'js'}, item.build.page);
                }
                if (item.build.cssgenerate) {
                    addToUploadList({content: item.build.package.css, to:uploadPath, ext: 'css'}, item.build.page);
                }
            });

            if (!Object.keys(uploadList).length) {
                return;
            }
            async.eachSeries(Object.keys(uploadList), function (page, next) {
                process.stdout.write('Start archiving and uploading items for page: ' + page + '\n');
                that.uploadFiles(uploadList[page], buildOptions, next);
            }, function(err){
                callback(err, data[0]);
            });

        });
    },
    stdoutSingleObjectWithBumper: function () {
        return es.map(function (data, callback) {
            if (typeof data !== "string") {
                data = JSON.stringify(data);
            }
            process.stdout.write("\n-||JSON||-\n");
            process.stdout.write(data);
            process.stdout.write("\n-||JSON||-\n");
            callback(null, data);
        });
    },
    bufferStringifyStreamWithBumperAndParseSingleObject: function () {
        var buffer = [],
            split,
            join;
        return es.through(function write(data) {
            split = data.split("\n-||JSON||-\n");
            if (split.length > 1) {
                for (var i = 0; i < split.length; i++) {
                    buffer.push(split[i]);
                    if (i !== (split.length - 1)) {
                        join = buffer.join("");
                        buffer = [];
                        if (join.length) {
                            var a = JSON.parse(join);
                            this.emit("data", a);
                        }
                    }
                }
            } else {
                buffer.push(split.join(""));
            }

        });
    }
};