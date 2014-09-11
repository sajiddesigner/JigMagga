/*
 * grunt-contrib-qunit
 * http://gruntjs.com/
 *
 * Copyright (c) 2013 "Cowboy" Ben Alman, contributors
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function (grunt) {

    // Nodejs libs.
    var path = require('path');

    // fs node lib
    var fs = require('fs');

    // External lib.
    var phantomjs = require('grunt-lib-phantomjs').init(grunt);

    // Keep track of the last-started module, test and status.
    var options, currentModule, currentTest, status;
    // Keep track of the last-started test(s).
    var unfinished = {};
    // save the tap log
    var tapLog = [];

    // save the instrument log
    var instrumentLog = [];

    // Get an asset file, local to the root of the project.
    var asset = path.join.bind(null, __dirname, '..');

    // calc and save code coverage
    var saveCodeCoverage = function () {
        var stats = {
            files: {},
            total: {}
        };
        for (var i = 0; i < instrumentLog.length; i++) {
            for (var file in instrumentLog[i].files) {
                if (stats.files[file]) {
                    stats.files[file].blockCoverage = (stats.files[file].blockCoverage + instrumentLog[i].files[file].blockCoverage) / 2;
                    stats.files[file].lineCoverage = (stats.files[file].lineCoverage + instrumentLog[i].files[file].lineCoverage) / 2;
                    for (var line in stats.files[file].linesUsed) {
                        if (stats.files[file].linesUsed[line] === 0 && instrumentLog[i].files[file].linesUsed[line] === 1) {
                            stats.files[file].linesUsed[line] = 1;
                        }
                    }
                } else {
                    stats.files[file] = instrumentLog[i].files[file];
                }
            }
        }
        var totalLines = 0,
            totalLinesHit = 0,
            totalBlocks = 0,
            totalBlocksHit = 0;
        for (var fileName in stats.files) {
            totalLines += stats.files[fileName].lines;
            totalBlocks += stats.files[fileName].blocks;
            totalLinesHit += stats.files[fileName].lines * stats.files[fileName].lineCoverage;
            totalBlocksHit += stats.files[fileName].blocks * stats.files[fileName].blockCoverage;
        }
        var totalLineCoverage = 0,
            totalBlockCoverage = 0;

        if (totalLines) {
            totalLineCoverage = totalLinesHit / totalLines;
        }
        if (totalBlocks) {
            totalBlockCoverage = totalBlocksHit / totalBlocks;
        }

        var total = {
            lineCoverage: totalLineCoverage,
            blockCoverage: totalBlockCoverage,
            lines: totalLines,
            blocks: totalBlocks
        };
        stats.total = total;
        fs.writeFileSync("code-coverage-report.html", fs.readFileSync(__dirname + "/qunit/code-coverage-template.html", {encoding: "utf8"}).replace("/*---COVERAGE_RESULT---*/", JSON.stringify(stats)))
    };

    // Allow an error message to retain its color when split across multiple lines.
    var formatMessage = function (str) {
        return String(str).split('\n').map(function (s) {
            return s.magenta;
        }).join('\n');
    };

    // If options.force then log an error, otherwise exit with a warning
    var warnUnlessForced = function (message) {
        if (options && options.force) {
            grunt.log.error(message);
        } else {
            grunt.warn(message);
        }
    };

    // Keep track of failed assertions for pretty-printing.
    var failedAssertions = [];
    var logFailedAssertions = function () {
        var assertion;
        // Print each assertion error.
        while (assertion = failedAssertions.shift()) {
            grunt.verbose.or.error(assertion.testName);
            grunt.log.error('Message: ' + formatMessage(assertion.message));
            if (assertion.actual !== assertion.expected) {
                grunt.log.error('Actual: ' + formatMessage(assertion.actual));
                grunt.log.error('Expected: ' + formatMessage(assertion.expected));
            }
            if (assertion.source) {
                grunt.log.error(assertion.source.replace(/ {4}(at)/g, '  $1'));
            }
            grunt.log.writeln();
        }
    };

    // QUnit hooks.
    phantomjs.on('qunit.moduleStart', function (name) {
        unfinished[name] = true;
        currentModule = name;
    });

    phantomjs.on('qunit.moduleDone', function (name/*, failed, passed, total*/) {
        delete unfinished[name];
    });

    phantomjs.on('qunit.log', function (result, actual, expected, message, source) {
        if (!result) {
            failedAssertions.push({
                actual: actual, expected: expected, message: message, source: source,
                testName: currentTest
            });
        }
    });

    phantomjs.on('qunit.testStart', function (name) {
        currentTest = (currentModule ? currentModule + ' - ' : '') + name;
        grunt.verbose.write(currentTest + '...');
    });

    phantomjs.on('qunit.testDone', function (name, failed/*, passed, total*/) {
        // Log errors if necessary, otherwise success.
        if (failed > 0) {
            // list assertions
            if (grunt.option('verbose')) {
                grunt.log.error();
                logFailedAssertions();
            } else {
                grunt.log.write('F'.red);
            }
        } else {
            grunt.verbose.ok().or.write('.');
        }
    });

    phantomjs.on('qunit.done', function (failed, passed, total, duration) {
        phantomjs.halt();
        status.failed += failed;
        status.passed += passed;
        status.total += total;
        status.duration += duration;
        // Print assertion errors here, if verbose mode is disabled.
        if (!grunt.option('verbose')) {
            if (failed > 0) {
                grunt.log.writeln();
                logFailedAssertions();
            } else if (total === 0) {
                warnUnlessForced('0/0 assertions ran (' + duration + 'ms)');
            } else {
                grunt.log.ok();
            }
        }
    });

    phantomjs.on('qunit.instrument', function (stats) {
        instrumentLog.push(stats);
    });

    // Re-broadcast qunit events on grunt.event.
    phantomjs.on('qunit.*', function () {
        var args = [this.event].concat(grunt.util.toArray(arguments));
        grunt.event.emit.apply(grunt.event, args);
    });


    phantomjs.on('qunit.tap', function (msg) {
        tapLog.push(msg);
    });


    // Built-in error handlers.
    phantomjs.on('fail.load', function (url) {
        phantomjs.halt();
        grunt.verbose.write('...');
        grunt.event.emit('qunit.fail.load', url);
        grunt.log.error('PhantomJS unable to load "' + url + '" URI.');
        status.failed += 1;
        status.total += 1;
    });

    phantomjs.on('fail.timeout', function () {
        phantomjs.halt();
        grunt.log.writeln();
        grunt.event.emit('qunit.fail.timeout');
        grunt.log.error('PhantomJS timed out, possibly due to a missing QUnit start() call.');
        status.failed += 1;
        status.total += 1;
    });

    phantomjs.on('error.onError', function (msg, stackTrace) {
        grunt.event.emit('qunit.error.onError', msg, stackTrace);
    });

    grunt.registerMultiTask('qunit', 'Run QUnit unit tests in a headless PhantomJS instance.', function () {
        // Merge task-specific and/or target-specific options with these defaults.
        options = this.options({
            // Default PhantomJS timeout.
            timeout: 5000,
            // QUnit-PhantomJS bridge file to be injected.
            inject: asset('qunit/inject.js'),
            // Explicit non-file URLs to test.
            urls: [],
            force: false,
            // Connect phantomjs console output to grunt output
            console: true,
            // Do not use an HTTP base by default
            httpBase: false,
            // output as tap
            tap: !!this.options("tap"),
            // save code coverage
            coverage: !!this.options("coverage")
        });

        var urls;

        if (options.httpBase) {
            //If URLs are explicitly referenced, use them still
            urls = options.urls;
            // Then create URLs for the src files
            this.filesSrc.forEach(function (testFile) {
                urls.push(options.httpBase + '/' + testFile);
            });
        } else {
            // Combine any specified URLs with src files.
            urls = options.urls.concat(this.filesSrc);
        }

        // This task is asynchronous.
        var done = this.async();

        // Reset status.
        status = {failed: 0, passed: 0, total: 0, duration: 0};

        // Pass-through console.log statements.
        if (options.console) {
            phantomjs.on('console', console.log.bind(console));
        }

        // Process each filepath in-order.
        grunt.util.async.forEachSeries(urls, function (url, next) {
                grunt.verbose.subhead('Testing ' + url + ' ').or.write('Testing ' + url + ' ');

                // Reset current module.
                currentModule = null;

                // Launch PhantomJS.
                grunt.event.emit('qunit.spawn', url);
                phantomjs.spawn(url, {
                    // Additional PhantomJS options.
                    options: options,
                    // Do stuff when done.
                    done: function (err) {
                        if (err) {
                            // If there was an error, abort the series.
                            done();
                        } else {
                            // Otherwise, process next url.
                            next();
                        }
                    }
                });
            },
            // All tests have been run.
            function () {
                if (options.tap) {
                    fs.writeFileSync("tap.log", tapLog.join("\n"));
                    tapLog = [];
                }
                if (options.coverage) {
                    saveCodeCoverage();
                }

                // Log results.
                if (status.failed > 0) {
                    warnUnlessForced(status.failed + '/' + status.total +
                        ' assertions failed (' + status.duration + 'ms)');
                } else if (status.total === 0) {
                    warnUnlessForced('0/0 assertions ran (' + status.duration + 'ms)');
                } else {
                    grunt.verbose.writeln();
                    grunt.log.ok(status.total + ' assertions passed (' + status.duration + 'ms)');
                }
                // All done!
                done();
            });
    });

};