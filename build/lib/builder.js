'use strict';
var fs = require('fs'),
    UglifyJS = require("uglify-js"),
    _ = require('lodash'),
    CleanCSS = require('clean-css'),
    es = require('event-stream'),
    sass = require('node-sass'),
    async = require('async'),
    stealLib = require('./steal.js'),
    canCompile = require('./can-compile/can-compile.js'),
    sassHelper = require('./../../steal-types/sass/sass-helper.js');


var builder = {
    makePackage: function () {
        return es.map(function (data, callback) {
            data.build.package = makeStealPackage(data.build.dependencies, null, null, data.build);
            // put steal.production into js
            var stealProduction = fs.readFileSync(data.build.jigMaggaPath + "/steal/steal.production.js", {encoding: "utf8"});
            var errorLogger = UglifyJS.minify(fs.readFileSync(data.build.jigMaggaPath + "/lib/error-logger.js", {encoding: "utf8"}), {fromString: true}).code;
            data.build.package.js = stealProduction + errorLogger + data.build.package.js;

            callback(null, data);
        });
    },
    view: {
        compile: function () {
            var internalCache = {};
            return es.map(function (data, callback) {
                if (data.build.jsgenerate) {
                    async.mapSeries(data.build.dependencies, function (item, cb) {
                        if (item.type === "mustache" || item.type === "ejs") {
                            if (internalCache[item.id.path] && internalCache[item.id.path].notcompiled === item.text) {
                                item.text = internalCache[item.id.path].compiled;
                                cb(null, item);
                            } else {
                                canCompile({
                                    filename: item.id.path,
                                    fileContent: item.text,
                                    version: "2.0.7"
                                }, function (error, output) {
                                    if (error) {
                                        cb(error, item);

                                    } else {
                                        internalCache[item.id.path] = {
                                            notcompiled: item.text,
                                            compiled: output
                                        };
                                        item.text = output;
                                        cb(null, item);
                                    }
                                });
                            }
                        } else {
                            cb(null, item);
                        }
                    }, function (err, results) {
                        if (err) {
                            throw new Error(err);
                        } else {
                            data.build.dependencies = results;
                            callback(null, data);
                        }
                    });
                } else {
                    callback(null, data);
                }
            });

        }
    },
    css: {
        minify: function (path, cb) {
            var internalCache = {};
            return es.map(function (data, callback) {
                if (data.build.minify && data.build.cssgenerate) {
                    async.mapSeries(data.build.dependencies, function (item, cb) {
                        if (item.buildType === "css") {
                            if (internalCache[item.id.path] && item.text === internalCache[item.id.path].notminify) {
                                item.text = internalCache[item.id.path].minify;
                            } else {
                                internalCache[item.id.path] = {
                                    notminify: item.text,
                                    minify: new CleanCSS({
                                        processImport: false
                                    }).minify(item.text)
                                };
                                item.text = internalCache[item.id.path].minify;
                            }
                        }
                        cb(null, item);
                    }, function (err, results) {
                        data.build.dependencies = results;
                        callback(null, data);
                    });
                } else {
                    callback(null, data);
                }
            });

        },
        compileSCSS: function () {
            var internalCache = {};
            return es.map(function (data, callback) {
                if (data.build.cssgenerate) {
                    async.mapSeries(data.build.dependencies, function (item, cb) {
                        if (item.type === "scss") {
                            var sassImport = sassHelper.sassImportFn(data.sass, false, [{'var': '$config-jigs', 'data': data.jigs}]);
                            if (internalCache[item.id.path] && internalCache[item.id.path].notcompiled === item.text && JSON.stringify(internalCache[item.id.path].sassImport) === JSON.stringify(sassImport)) {
                                item.text = internalCache[item.id.path].text;
                                cb(null, item);
                            } else {
                                sass.render({
                                    data: sassImport + "\n" + item.text,
                                    includePaths: [data.build.jigMaggaPath],
                                    outputStyle: 'nested'
                                  }, function(err, result) {
                                      if (err) {
                                         cb(new Error(err), null);
                                      } else {
                                        internalCache[item.id.path] = {};
                                        internalCache[item.id.path].notcompiled = item.text;
                                        internalCache[item.id.path].sassImport = sassImport;
                                        internalCache[item.id.path].text = item.text = result.css;
                                        cb(null, item);
                                      }
                                  });
                            }
                        } else {
                            cb(null, item);
                        }

                    }, function (err, results) {
                        if (err) {
                            return callback(err);
                        }

                        data.build.dependencies = results;
                        callback(null, data);
                    });
                } else {
                    callback(null, data);
                }
            });
        },
        makePackage: function (steals, where) {
            if (!steals || !steals.length) {
                return null;
            }

            var directory = steal.File(where).dir(),
                srcs = [], codez = [];

            steals.forEach(function (stealOpts) {
                codez.push(convert(stealOpts.text, stealOpts.id, directory));
                srcs.push(stealOpts.rootSrc + '');
            });

            return {
                srcs: srcs,
                code: codez.join('\n') //css.minify(codez.join('\n'))
            };
        }
    },

    js: {
        translate: function () {
            return es.map(function (data, callback) {
                if (data.build.jsgenerate) {
                    var namespace = data.build.stealConfig.namespace,
                        localePath = data.build.stealConfig[namespace].localePath;
                    stealLib.stealAFile(localePath, data, function (err, dataNew, window) {
                        async.mapSeries(data.build.dependencies, function (item, cb) {
                            if (item.buildType === "js" || item.buildType === "conf") {
                                window.gettext.textdomain(data.build.locale);
                                item.text = window.replaceGettextUnderscore(item.text);
                            }
                            cb(null, item);
                        }, function (err, results) {
                            data.build.dependencies = results;
                            callback(null, data);
                        });
                    });
                } else {
                    callback(null, data);
                }
            });
        },
        minify: function () {
            var internalCache = {};
            return es.map(function (data, callback) {
                if (data.build.minify && data.build.jsgenerate) {
                    var browser = data.build.stealConfig.browser;
                    async.mapSeries(data.build.dependencies, function (item, cb) {
                        if (item.buildType === "js") {
                            if (internalCache[item.id.path] && item.text === internalCache[item.id.path].notminify) {
                                item.text = internalCache[item.id.path].minify;
                            } else {
                                internalCache[item.id.path] = {
                                    notminify: item.text,
                                    minify: UglifyJS.minify(item.text, {fromString: true, screw_ie8: browser && browser.msie ? false : true }).code
                                };
                                item.text = internalCache[item.id.path].minify;
                            }
                        }
                        cb(null, item);
                    }, function (err, results) {
                        data.build.dependencies = results;
                        callback(null, data);
                    });
                } else {
                    callback(null, data);
                }
            });
        },
        clean: function () {
            return es.map(function (data, callback) {
                if (data.build.jsgenerate) {
                    async.mapSeries(data.build.dependencies, function (item, cb) {
                        if (item.buildType === "js") {
                            var fileString = item.text;
                            if (fileString) {
                                if (data.build.live) {
                                    fileString = fileString.replace(new RegExp('^\\s*\/\/!steal-remove-start(\\n|.)*?\/\/!steal-remove-end.*$', 'gm'), "");
                                    fileString = fileString.replace(new RegExp('^\\s*\/\/!steal-remove-on-live-start(\\n|.)*?\/\/!steal-remove-on-live-end.*$', 'gm'), "");
                                } else {
                                    fileString = fileString.replace(new RegExp('^\\s*\/\/!steal-remove-start(\\n|.)*?\/\/!steal-remove-end.*$', 'gm'), "");
                                }
                            }
                            item.text = fileString;
                        }
                        cb(null, item);
                    }, function (err, results) {
                        data.build.dependencies = results;
                        callback(null, data);
                    });
                } else {
                    callback(null, data);
                }
            });
        }

    }
};


/**
 * @function makePackage
 *
 * `steal.build.js.makePackage(moduleOptions, dependencies, cssPackage, buildOptions)`
 * creates JavaScript and CSS packages. For example:
 *
 *     steal.build.js.makePackage( [
 *        { buildType : "js", id : "a.js", text: "a" },
 *        { buildType : "js", id : "b.js", text: "b" },
 *        { buildType : "css", id : "c.css", text: "c" }
 *       ],
 *       { "package/1.js" : ["jquery/jquery.js"] },
 *       "package/css.css",
 *       {stealOwnModules: true}
 *     )
 *
 * ... produces an object with minified js that looks like the following
 * unminified source:
 *
 *     // indicates these modules are loading
 *     steal.has("a.js","b.js");
 *
 *     // steal any packages this package depends on
 *     // waits makes them wait until the prior steal has finished
 *     steal({id:"package/1.js",waits:true,has:["jquery/jquery.js"]});
 *     steal({id:"package/css.css",waits:true,has:["c.css"]});
 *
 *     // steal the modules required by production.js
 *     // so that it can be marked completed
 *     // at the right time
 *     steal("a.js","b.js");
 *
 *     // temporarily saves and empties the pending
 *     // queue because the content's of other files
 *     // will add to it and steal.excuted will clear it.
 *     steal.pushPending();
 *     // the files and executed contexts
 *     a;
 *     steal.executed("a.js");
 *     b;
 *     steal.executed("b.js");
 *
 *     // pop production.js's pending state back into
 *     // the pending queue.
 *     // When production.js is done loading, steal
 *     // will use pending as production.js's dependencies.
 *     steal.popPending();
 *
 *
 *
 * @param {Array} moduleOptions like:
 *
 *     [{id: "jquery/jquery.js", text: "var a;", baseType: "js"}]
 *
 * Each moduleOption should have:
 *
 * - id - the moduleId
 * - text - the JS or CSS text of the module
 * - baseType - either "css" or "js"
 *
 * @param {Object} dependencies An object of dependency moduleIds mapped
 * to the moduleIds of the modules they contain:
 *
 *      {"package/package.js": ['jquery/jquery.js']}
 *
 * The package being created will wait until all dependencies in this
 * object have been [steal.Module.states].
 *
 * @param {String} cssPackage the css package name, added as dependency if
 * there is css in files.
 *
 * @param {Array} buildOptions An object that indicates certain behavior
 * patterns.  For example:
 *
 *     {
	 *       exclude: ["jquery/jquery.js"],
	 *       stealOwnModules: true
	 *     }
 *
 * Supported options are:
 *
 *  - exclude - exclude these modules from any build
 *  - stealOwnModules - if the package should steal the modules it contains.
 *
 * @return {Object} an object with the css and js
 * code that make up this package unminified
 *
 *     {
	 *       js: "steal.has('plugin1','plugin2', ... )"+
	 *           "steal({src: 'package/package.js', has: ['jquery/jquery.js']})"+
	 *           "plugin1 content"+
	 *           "steal.executed('plugin1')",
	 *       css : "concated css content"
	 *     }
 *
 */
function makeStealPackage(moduleOptions, dependencies, cssPackage, buildOptions) {

// put it somewhere ...
    // add to dependencies ...
    // seperate out css and js
    buildOptions = buildOptions || {};
    var excludes = buildOptions.exclude || [];
    var jses = [],
        csses = [],
        lineMap = {},
        lineNum = 0,
        numLines = function (text) {
            var matches = text.match(/\n/g);
            return matches ? matches.length + 1 : 1
        };


    moduleOptions.forEach(function (file) {
        if (file.packaged === false) {
            console.log('   not packaging ' + file.id);
            return;
        }

        // ignore
        if (file.ignore) {
            console.log('ignoring: ' + file.id);
            return;
        }

        /**
         * Match the strings in the array and return result.
         */
        var matchStr = function (str) {
            var has = false;
            if (excludes.length) {
                for (var i = 0; i < excludes.length; i++) {
                    //- Match wildcard strings if they end in '/'
                    //- otherwise match the string exactly
                    //- Example `exclude: [ 'jquery/' ]` would exclude all of jquery++
                    //- however `exclude: [ 'jquery' ]` would only exclude the file
                    var exclude = excludes[i];
                    if ((exclude[exclude.length - 1] === "/" &&
                        str.indexOf(exclude) === 0
                        ) || str === exclude) {
                        has = true;
                        break;
                    }
                }
            }
            return has;
        };

        if (file.exclude || matchStr('' + file.id)) {
            console.log('   excluding ' + file.id);
            return;
        }

        if (file.buildType === 'js') {
            jses.push(file);
        } else if (file.buildType === 'css') {
            csses.push(file);
        }
    });
    // add to dependencies
    if (csses.length && dependencies) {
        dependencies[cssPackage] = csses.map(function (css) {
            return css.id;
        });
    }

    // this now needs to handle css and such
    var loadingCalls = jses.map(function (file) {
        return file.id;
    });
    // this now needs to handle css and such
    var loadingCallsCss = csses.map(function (file) {
        return file.id;
    });

    //create the dependencies ...
    var dependencyCalls = [];
    for (var key in dependencies) {
        dependencyCalls.push(
                "steal.has('" + dependencies[key].join("','") + "')"
        );
    }


    // make 'loading'

    var code = ["steal.has('" + loadingCalls.join("','") + "')"];

    // add dependencies
    code.push.apply(code, dependencyCalls);

    for (var key in loadingCallsCss) {
        code.push("steal.executed('" + loadingCallsCss[key].path + "')");
    }


    if (buildOptions.stealOwnModules) {
        // this makes production.js wait for these moduleOptions to complete
        // this was removing the rootSteal and causing problems

        // but having it might cause a circular dependency in
        // the apps scenario
        code.push("steal('" + loadingCalls.join("','") + "')");
    }

    code.push("steal.pushPending()");

    lineNum += code.length;
    // add js code
    jses.forEach(function (file) {

        code.push(file.text, "steal.executed('" + file.id.path + "')");
        lineMap[lineNum] = file.id + "";
        var linesCount = numLines(file.text) + 1;
        lineNum += linesCount;
    });

    var jsCode = code.join(";\n") + ";steal.popPending();";
    var stealConfig = fs.readFileSync(__dirname + '/../../stealconfig.js', 'utf8');


    var stealConfigProduction = '\nsteal.config({env: "production", jmENV: "' + (buildOptions.live ? "production" : "stage") + '", ext: {scss: null, conf: null} });';

    var minifyStealConfigCode = UglifyJS.minify(stealConfig + stealConfigProduction, {fromString: true}).code;

    jsCode = minifyStealConfigCode + '\n' + jsCode;

    var csspackage = builder.css.makePackage(csses, cssPackage);

    return {
        js: jsCode,
        css: csspackage && csspackage.code ? csspackage.code : ""
    };
}


//used to convert css referencs in one file so they will make sense from prodLocation
function convert(css, cssLocation, prodLocation) {
    //how do we go from prod to css
    var cssLoc = new steal.File(cssLocation).dir(),
        newCSS = css.replace(/url\(['"]?([^'"\)]*)['"]?\)/g, function (whole, part) {

            //check if url is relative
            if (isAbsoluteOrData(part)) {
                return whole;
            }
            //it's a relative path from cssLocation, need to convert to
            // prodLocation
            var rootImagePath = steal.URI(cssLoc).join(part),
                fin = steal.File(prodLocation).pathTo(rootImagePath);
            return "url(" + fin + ")";
        });
    return newCSS;
}
function isAbsoluteOrData(part) {
    return /^(data:|http:\/\/|https:\/\/|\/)/.test(part);
}


module.exports = builder;
