var compile = require("can-compile");


'use strict';

var fs = require('fs');
var jsdom = require("jsdom");
var path = require('path');
var async = require('async');
var Handlebars = require('handlebars');
var window = {};
var visit = function(version, callback) {
    if (!window[version]) {
        // TODO jQuery version mapping
        jsdom.env('<h1>can-compile</h1>',
            [ __dirname + "/../../../bower_components/jquery-new/dist/jquery.min.js",
                    __dirname + "/../../../bower_components/canjs/can.jquery.js",
                    __dirname + "/../../../bower_components/canjs/can.ejs.js" ],
            function(error, win) {
                if (error) {
                    return callback(error);
                }

                window[version] = win;
                callback(null, window[version]);
            }
        );
    } else {
        callback(null, window[version]);
    }
};
var noop = function() {};

var compiler = function(options, callback) {
    var filename = typeof options === 'string' ? options : options.filename;
    var fileContent = options.fileContent || null;
    var normalizer = options.normalizer || function(filename) {
        return filename;
    };

    if(!options.version) {
        return callback(new Error('A specific CanJS version number must be passed to compile views.'));
    }

    visit(options.version, function(error, win) {
        if (typeof options.log === 'function') {
            options.log('Compiling ' + filename);
        }

        if (error) {
            return callback(error);
        }

        var can = win.can;

        if (options.tags && options.tags.length) {
            for (var i = 0; i < options.tags.length; i++) {
                can.view.Scanner.tags[options.tags[i]] = noop;
            }
        }

        var type = filename.substring(filename.lastIndexOf('.') + 1, filename.length);
        var text = fileContent || fs.readFileSync(path.join(__dirname, '../../..', filename)).toString();
        // Create an id from the normalized filename
        var id = can.view.toId(normalizer(filename));
        // TODO throw error if type is not registered
        var script = can.view.types["." + type] ? can.view.types["." + type].script(id, text) : null;

        callback(null, script, {
            id: id,
            text: text,
            type: type
        });
    });
};


module.exports = function(configuration, callback, log) {
    // Normalize ids to filenames relative to the output file
    var normalizer = configuration.normalizer || function(filename) {
        return path.relative(path.dirname(configuration.out), filename);
    };
    var callbacks = [configuration].map(function(conf) {
        return function(callback) {
            compiler({
                filename: conf.filename,
                fileContent: conf.fileContent,
                normalizer: normalizer,
                log: log,
                tags: configuration.tags,
                version: configuration.version
            }, function(error, compiled, id) {
                if (error) {
                    return callback(error);
                }
                callback(null, compiled, id);
            });
        };
    });
    var renderer = Handlebars.compile(configuration.wrapper || 'steal("can/view/mustache/mustache.js", function(can) {\n {{{content}}} \n});');

    async.series(callbacks, function(errors, results) {
        if (errors) {
            return callback(errors);
        }
        var list = results.map(function(compiled) {
            var options = compiled[1];
            var method = configuration.version.indexOf('2.1') === 0 ? 'preloadStringRenderer' : 'preload';
            var output = compiled[0];

            if(output === null) {
                return "can." + options.type + "('" + options.id + "', " + JSON.stringify(options.text) + ");";
            }

            return "can.view." + method + "('" + options.id + "'," + output + ");";
        });
        var output = renderer({
            content: list.join('\n'),
            list: list
        });

        if (configuration.out) {
            fs.writeFile(configuration.out, output, function(err) {
                callback(err, output, configuration.out);
            });
        } else {
            callback(null, output);
        }
    });
};
module.exports.compile  = compiler;


