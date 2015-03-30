var stealBuild = require("steal"),
    es = require('event-stream'),
    path = require('path'),
    helper = require('./helper.js'),
    async = require('async'),
    util = require("util"),
    fs = require('fs');

/**
 *
 * @param steal
 * @param item
 */

function setupStealconfig(steal, item, cb) {
    var loadFile = function (options) {
        var src = typeof options.src === "string" ? options.src : options.src.path;
        var rootPath = path.join(__dirname, '../..');

        if (src.indexOf(rootPath) < 0 && src.indexOf(path.join(rootPath, '..')) >= 0) {
            src = src.replace(path.join(rootPath, '..'), rootPath);
        } else {
            src = (src.indexOf(rootPath) >= 0) ? src : path.join(rootPath, src);
        }

        return fs.readFileSync(src, {
            encoding: "utf8"
        });
    };

    global.window = {};
    global.window = global;
    steal.config({
        namespace: item.namespace,
        root: item.build.jigMaggaPath,
        pathToBuild: "/" + helper.getRelativePathFromStealRootPath(item.build.pageHTMLPath, item.build.jigMaggaPath),
        isBuild: true,
        appVersion: item.build.versionnumber,
        "init-locale": item.build.locale,
        browser: item.build.browser,
        types: {
            text: function (options, success) {
                options.text = loadFile(options);
                success()
            },
            "ejs js": function (options, success) {
                options.text = loadFile(options);
                success();
            },
            js: function (options, success) {
                if (!options.text) {
                    options.text = loadFile(options);
                }
                var stealInFile = /steal\(/.test(options.text);
                if (stealInFile || options.id.path.indexOf("steal-types") !== -1) {
                    try {
                        eval(options.text);
                    } catch (e) {
                        console.error(e);
                        console.log(options);
                    }
                }
                success();
            },
            "scss css": function (options, success) {
                options.text = loadFile(options);
                success();
            },
            css: function (options, success) {
                if (!options.text) {
                    options.text = loadFile(options);
                }
                success();
            },
            "mustache js": function (options, success) {
                options.text = loadFile(options);
                success();
            },
            "fn": function (options, success) {
                if (options.id.path.indexOf("steal-types") !== -1) {
                    options.fn();

                }
                success();
            }
        }
    });
    steal.one("end", function (rootsteal) {
        eval(steal.resources["stealconfig.js"].options.text);
        cb();
    });
}

/**
 * returns all dependencies as an array
 * @param steals
 * @returns {Array}
 */
function getAllDependencies(steals) {
    var module = {},
        modules = [];

    !function test(dependencies) {
        for (var key in dependencies) {
            if (dependencies[key]) {
                dependencies[key].options.src = typeof dependencies[key].options.src === "string" ? {path: dependencies[key].options.src} : dependencies[key].options.src;
                if (!dependencies[key].options.putDependenciesAfterThisModuleForBuild) {
                    if (dependencies[key] && dependencies[key].dependencies.length) {
                        test(dependencies[key].dependencies)
                    }
                    if (dependencies[key] && dependencies[key].needsDependencies.length) {
                        test(dependencies[key].needsDependencies)
                    }
                }

                if ((dependencies[key].options.src && dependencies[key].options.src.path) && !module[dependencies[key].options.src.path]) {
                    module[dependencies[key] && dependencies[key].options.src && dependencies[key].options.src.path] = true;
                    if (!dependencies[key].options.text) {
                        console.log("NO TEXT: ", dependencies[key].options.src.path);
                        dependencies[key].options.text = "";
                    }
                    modules.push(dependencies[key].options);
                }

                if (dependencies[key].options.putDependenciesAfterThisModuleForBuild) {

                    if (dependencies[key].dependencies.length) {
                        test(dependencies[key].dependencies)
                    }
                    if (dependencies[key].needsDependencies.length) {
                        test(dependencies[key].needsDependencies)
                    }
                }
            }
        }
    }(steals);
    return modules;
}


module.exports = {

    /**
     *
     * @returns {*}
     */
    getJSAndHTMLFilePath: function () {
        var defaultPathJSFile,
            domainPathJSFile;
        return es.map(function (data, callback) {
            if (!data.length) {
                throw Error("Stream is not an array of pages conf");
            }
            async.map(data, function (item, cb) {
                if (!item.build || !item.build.defaultPath || !item.build.basePath) {
                    throw Error("Stream need build object with {defaultPath: \"\", basePath: \"\"} ")
                }
                domainPathJSFile = helper.getFileFromPath(item.build.basePath + "/" + item.build.domain + "/" + item.build.page, "js");
                defaultPathJSFile = helper.getFileFromPath(item.build.defaultPath + "/" + item.build.page, "js");
                item.build.pageHTMLPath = helper.getFileFromPath(item.build.basePath + "/" + item.build.domain + "/" + item.build.page, "html");
                if (fs.existsSync(domainPathJSFile)) {
                    item.build.pageJSPath = domainPathJSFile;
                } else if (fs.existsSync(defaultPathJSFile)) {
                    item.build.pageJSPath = defaultPathJSFile;
                } else {
                    throw Error("No js file for page found " + domainPathJSFile);
                }
                cb(null, item);
            }, function (err, result) {
                callback(null, result);
            })
        })
    },
    /**
     *
     * @returns {*}
     */
    openPageAndGrepDependencies: function () {
        return es.map(function (data, callback) {
            steal.one("done", function () {
                if (!data.build || !data.build.pageJSPath) {
                    throw Error("Stream need build object with {pageJSPath: \"\"} ")
                }
                var openerSteal = steal.clone();
                setupStealconfig(openerSteal, data, function () {
                    openerSteal.one("end", function (rootsteal) {
                        var config =  openerSteal.config();
                        // remove circular structure to use JSON.stringify
                        config.win = null;
                        data.build.stealConfig = openerSteal.config();
                        data.build.dependencies = getAllDependencies(rootsteal.dependencies);
                        callback(null, data);
                    });
                    var page = helper.getRelativePathFromStealRootPath(data.build.pageJSPath, data.build.jigMaggaPath);
                    console.log("\nOpen page: ", page, " with Browser: ", data.build.browser, " and locale: ", data.build.locale, "\n");
                    openerSteal(page);
                });
            })
        })
    },
    /**
     * get current view for locale
     * @returns {*}
     */
    setCurrentSCSSVariables: function () {
        return es.map(function (data, callback) {
            if (data.build.cssgenerate) {
                var config = data.build.stealConfig;
                var sass = config[config.namespace].sass;
                sass[data.namespace + "-locale"] = data.build.locale;
                sass = util._extend(data.sass, sass);
                data.sass = sass;
            }
            callback(null, data);
        })
    },
    stealAFile: function (page, data, cb) {
        steal.one("done", function () {
            if (!data.build) {
                throw Error("Stream need build object")
            }
            var openerSteal = steal.clone();
            setupStealconfig(openerSteal, data, function () {
                openerSteal.one("end", function (rootsteal) {
                    cb(null, data, window);
                });
                openerSteal(page);
            });
        })
    }
};
