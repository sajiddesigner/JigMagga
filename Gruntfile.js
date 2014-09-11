"use strict";
var fs = require("fs"),
    path = require('path'),
    sass = require('node-sass'),
    ssInclude = new (require("ssi"));

var createWalker = require('./generate/walker');
var config = require('./grunt.config');

var walker = createWalker('.', {
    followLinks: false,
    filters: config.coreFolders
});

module.exports = function(grunt) {
    var namespace;


    grunt.initConfig({
        prompt: {
            generate: {
                options: {
                    questions: [
                        {
                            config: "generator.template",
                            type: "list",
                            message: "Please define the type to generate",
                            choices: ["jig", "model", "page", "domain", "locale", "project", "repository", "groupedDomain"],
                            default: "jig"
                        },
                        {
                            config: "generator.namespace",
                            type: "input",
                            message: "Please set the namespace of the project:",
                            filter: function (value) {
                                return value.toLowerCase();
                            },
                            validate: function (value) {
                                if (!value.match(/^[a-z][a-z0-9]*$/i)) {
                                    return "Please only use chars and numbers starting with a character";
                                } else {
                                    return true;
                                }
                            },
                            when: function (answers) {
                                return answers['generator.template'] === 'project';
                            }
                        },
                        {
                            config: "generator.namespace",
                            type: "list",
                            message: "Please set the namespace of the project:",
                            choices: function(answer) {
                                // step through all folders, searching for a folder with page/page.conf inside.
                                // this should be a json file and should contain value for "namespace".
                                // Give all namespaces you find as the list
                                return walker.getNamespaces();
                            },
                            filter: function (value) {
                                return value.toLowerCase();
                            },
                            validate: function (value) {
                                if (!value.match(/^[a-z][a-z0-9]*$/i)) {
                                    return "Please only use chars and numbers starting with a character";
                                } else {
                                    return true;
                                }
                            },
                            when: function (answers) {
                                return answers['generator.template'] !== 'project';
                            }
                        },
                        {
                            config: "generator.name",
                            type: "input",
                            message: "Please define the name:",
                            filter: function (value) {
                                return value.toLowerCase();
                            },
                            validate: function(value) {
                                if (!value.match(/^[a-z][\/a-z0-9.]*$/i)) {
                                    return "Please only use chars and numbers starting with a character";
                                } else {
                                    return true;
                                }
                            },
                            when: function (answers) {
                                return answers['generator.template'] !== 'page' &&
                                    answers['generator.template'] !== 'project' &&
                                    answers['generator.template'] !== 'locale' &&
                                    answers['generator.template'] !== 'repository';
                            }
                        },
                        {
                            config: "generator.name",
                            type: "input",
                            message: "Please define the name:",
                            filter: function (value) {
                                return value.toLowerCase();
                            },
                            validate: function(value) {
                                if (!value.match(/^[\/a-z0-9.]*$/i)) {
                                    return "Please only use chars or numbers";
                                } else {
                                    return true;
                                }
                            },
                            when: function (answers) {
                                return answers['generator.template'] === 'page';
                            }
                        },
                        {
                            config: "generator.name",
                            type: "input",
                            message: "Please define the locale:",
                            validate: function (value) {
                                if (!value.match(/^[a-z][a-z]_[A-Z][A-Z]$/i)) {
                                    return "Please choose a locale in the form 'xx_XX'";
                                } else {
                                    return true;
                                }
                            },
                            when: function (answers) {
                                return answers['generator.template'] === 'locale';
                            }
                        },
                        {
                            config: "generator.locale",
                            type: "input",
                            message: "Please define the locale:",
                            validate: function (value) {
                                if (!value.match(/^[a-z][a-z]_[A-Z][A-Z]$/i)) {
                                    return "Please choose a first locale in domain in the form 'xx_XX'";
                                } else {
                                    return true;
                                }
                            },
                            when: function (answers) {
                                return answers['generator.template'] === 'domain';
                            }
                        },
                        {
                            config: "generator.domain",
                            type: "list",
                            choices: function(answers) {
                                var result = walker.getAllPagesInDomains(answers['generator.namespace']);
                                // print out all domains and domains/pages in the current namespace/page (all with a conf-file inside)
                                result.unshift({name: "No page", value: "none"});
                                return result;
                            },
                            message: "In which page should the jig be rendered?",
                            filter: function (value) {
                                return value;
                            },
                            when: function (answers) {
                                return answers['generator.template'] === 'jig';
                            }
                        },
                        {
                            config: "generator.domain",
                            type: "list",
                            choices: function(answers) {
                                // print out all domains in the current namespace/page
                                var result = walker.getAllDomains(answers['generator.namespace']);

                                result.unshift('default');
                                return result;
                            },
                            message: "In which domain should the page be rendered?",
                            filter: function (value) {
                                return value;
                            },
                            when: function (answers) {
                                return answers['generator.template'] === 'page';
                            }
                        },
                        {
                            config: "generator.domain",
                            type: "list",
                            choices: function(answers) {
                                // print out all domains in the current namespace/page
                                var result = walker.getAllFirstLevelDomains(answers['generator.namespace']);

                                return result;
                            },
                            message: "In which domain should the groupedDomain be rendered?",
                            filter: function (value) {
                                return value.toLowerCase();
                            },
                            when: function (answers) {
                                return answers['generator.template'] === 'groupedDomain';
                            }
                        },
                        {
                            config: "generator.domain",
                            type: "list",
                            choices: function(answers) {
                                // print out the namespace"-domain" in all current namespace"/page/"domain/domain.conf
                                var result = walker.getAllNamespaceDomain(answers['generator.namespace']);
                                return result;
                            },
                            message: "For which domain is this locale?",
                            filter: function (value) {
                                return value;
                            },
                            when: function (answers) {
                                return answers['generator.template'] === 'locale';
                            }
                        },
                        {
                            config: "generator.parent",
                            type: "input",
                            message: "Slot system: Please define parent css class (optional):",
                            filter: function (value) {

                                value = value.trim().toLowerCase();

                                if (value !== '' && value.charAt(0) !== '.') {
                                    value = '.' + value;
                                }
                                return value;
                            },
                            when: function (answers) {
                                return answers['generator.template'] === 'jig';
                            }
                        }
                    ]
                }
            },
            build: {
                options: {
                    questions: [
                        {
                            config: "build.namespace",
                            type: "input",
                            message: "Which namespace you want to build:"
                        },
                        {
                            config: "build.domain",
                            type: "list",
                            choices: function(answers) {
                                // print out all domains in the current namespace/page
                                var result = walker.getAllDomains(answers['build.namespace']);

                                result.unshift('default');
                                return result;
                            },
                            message: "Which domain you want to build:",
                            filter: function (value) {
                                return value.toLowerCase();
                            }
                        },
                        {
                            config: "generator.pages",
                            type: "input",
                            message: "Which pages you want generate (you can use regex)"
                        }

                    ]

                }
            }
        },
        connect: {
            server: {
                options: {
                    keepalive : true,
                    open: true,
                    middleware:  function (connect, options, middlewares) {

                        // inject a custom middleware into the array of default middlewares
                        middlewares.unshift(function (req, res, next) {
                            if (req.url === "/") {
                                // if there is a namespace with a index page, jump to the index page in the first domain or in default
                                var deafultIndex = walker.getIndexPage(grunt.option('namespace'));
                                if (deafultIndex) {
                                    res.writeHead(301, {Location: deafultIndex, Expires: new Date().toGMTString()});
                                } else {
                                    // if no index file is generated yet, print out the README.md
                                    require('marked')(fs.readFileSync("./README.md", {encoding: "utf8"}), function (err, html) {
                                        if (err) {
                                            grunt.log.error("README.md can't be rendered");
                                        } else {
                                            res.end(html);
                                        }
                                    });
                                }
                                res.end();
                            }
                            // compile scsss file on server side (testing phantom)
                            else if (req.url.indexOf("/sass/compile") !== -1) {
                                sass.render({
                                    data: req.body.scss,
                                    success: function(css){
                                        res.end(css);
                                    },
                                     error: function(error) {
                                        console.log(error);
                                        res.end("");
                                    }
                                });
                            }
                            // check default directory for html file
                            else if (req.url && req.url.search(/\.[s]{0,1}html/) !== -1) {
                                var cwd = options.base[0] + "/",
                                    filename = req.url,
                                    filenameSHTML = cwd + filename.replace(/\.html/, ".shtml"),
                                    defaultBase = cwd + filename.replace(/\/[^\/]*\.[a-z]{2,3}\//, "/default/"),
                                    defaultBaseSHTML = cwd + filename.replace(/\/[^\/]*\.[a-z]{2,3}\//, "/default/").replace(/\.html/, ".shtml");
                                if (fs.existsSync(filename)) {
                                    res.end(ssInclude.parse(filename, fs.readFileSync(filename, {
                                        encoding: "utf8"
                                    })).contents);
                                } else if (fs.existsSync(cwd + filename)) {
                                    res.end(ssInclude.parse(cwd + filename, fs.readFileSync(cwd + filename, {
                                        encoding: "utf8"
                                    })).contents);
                                } else if (fs.existsSync(filenameSHTML)) {

                                    res.end(ssInclude.parse(filenameSHTML, fs.readFileSync(filenameSHTML, {
                                        encoding: "utf8"
                                    })).contents);
                                } else if (fs.existsSync(defaultBase)) {
                                    res.end(ssInclude.parse(defaultBase, fs.readFileSync(defaultBase, {
                                        encoding: "utf8"
                                    })).contents);
                                } else if (fs.existsSync(defaultBaseSHTML)) {
                                    res.end(ssInclude.parse(defaultBaseSHTML, fs.readFileSync(defaultBaseSHTML, {
                                        encoding: "utf8"
                                    })).contents);
                                } else {
                                    next();

                                }
                            }
                            else {
                                next();
                            }
                        });
                        middlewares.unshift(connect.bodyParser());
                        return middlewares;
                    }
                }
            }
        },
        qunit: {
            options: {
                timeout: 10000,
                httpBase : "http://localhost:8000"
            },
            all: ['**/funcunit.html', '!bower_components/**', '!steal/**']
        }
    });

    grunt.loadNpmTasks('grunt-contrib-connect');
    grunt.loadNpmTasks('grunt-prompt');
    grunt.loadTasks('tasks');


    grunt.registerTask('generate',
        [
            'prompt:generate',
            'generator'
        ]);

    grunt.registerTask('build',
        [
            'prompt:build'
        ]);


    /**
     * This is the grunt task for open a grunt connect an test all funcunit suites against this server
     *
     * --tap will ouput the result in tap format as a file ./tap.log
     *
     */
    grunt.registerTask('test', "test all funcunit.html suites with phantomjs", function() {
         grunt.config("connect.server.options.keepalive", false);
         grunt.config("connect.server.options.open", false);
         grunt.task.run(["connect", "qunit:all"]);
    });


    grunt.registerTask("generator", "Project structure generator", function() {
        var generate = require(__dirname + "/generate/generate"),
            config = {
                namespace: grunt.config("generator.namespace"),
                name: grunt.config("generator.name"),
                domain: grunt.config("generator.domain"),
                locale: grunt.config("generator.locale"),
                slotParent: grunt.config("generator.parent")
            };

        generate[grunt.config("generator.template")].create.call(this, config);
    });

    /**
     *
     */

    grunt.registerTask("build", "Will build css and js production files", function() {

    });

};
