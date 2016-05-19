!function (window) {

    /**
     *
     * @param controller
     * @returns {string}
     */
    var controllerToPath = function (controller) {
            return controller.toLowerCase().replace(/\./g, "/");
        },
        /**
         * will remove a jig when browser is not supported
         * if steal.config("isBuild") is true it will include all browser stuff and provide steal information to filter ist via build
         * @param jig
         * @returns {*}
         */
        browserSupport = function (jig, config) {
            if (jig && jig.browser) {
                var $browser = window.$ ? window.$.browser : steal.config("browser"),
                    versionconf,
                    k,
                    key,
                    version = $browser ? $browser.version : null,
                    browserconf = jig.browser;

                //noinspection JSLint
                for (k in browserconf) {
                    //noinspection JSLint
                    if (k && $browser && k in $browser && browserconf[k].version) {
                        versionconf = browserconf[k].version;
                        //noinspection JSLint
                        for (key in versionconf) {
                            if (version.search(versionconf[key]) !== -1) {
                                if (browserconf[k].controller && jig.path) {
                                    jig.path = controllerToPath(browserconf[k].controller)
                                } else {
                                    jig.disabled = true;
                                }
                                break;
                            }
                        }
                    }
                }
            }
            return jig;
        },
        /**
         * will include the browser stuff
         * if steal.config("isBuild") is true it will include all files and put also the browser property for the build
         * @param config
         */
        browserIncludes = function (config) {
            var key,
                browser = window.$ ? window.$.browser : steal.config("browser");
            if (config && browser && config.browserincludes) {
                for (key in config.browserincludes) {
                    for (var includeKey in config.browserincludes[key]) {
                        if (key in browser) {
                            config.includes.push({id: config.browserincludes[key][includeKey], browser: key});
                        }
                    }
                }
            }
        },
        /**
         * cross browser DOM ready function
         * @param win
         * @param fn
         */
        contentLoaded = function (win, fn) {
            var done = false, top = true,
                doc = win.document, root = doc.documentElement,
                add = doc.addEventListener ? 'addEventListener' : 'attachEvent',
                rem = doc.addEventListener ? 'removeEventListener' : 'detachEvent',
                pre = doc.addEventListener ? '' : 'on',
                init = function (e) {
                    if (e.type == 'readystatechange' && doc.readyState != 'complete') return;
                    (e.type == 'load' ? win : doc
                        )[rem](pre + e.type, init, false);
                    if (!done && (done = true
                        )) fn.call(win, e.type || e);
                },
                poll = function () {
                    try {
                        root.doScroll('left');
                    } catch (e) {
                        setTimeout(poll, 50);
                        return;
                    }
                    init('poll');
                };
            if (doc.readyState == 'complete') fn.call(win, 'lazy');
            else {
                if (doc.createEventObject && root.doScroll) {
                    try {
                        top = !win.frameElement;
                    } catch (e) {
                    }
                    if (top) poll();
                }
                doc[add](pre + 'DOMContentLoaded', init, false);
                doc[add](pre + 'readystatechange', init, false);
                win[add](pre + 'load', init, false);
            }
        },
        /**
         * check if jig config has render === false
         * if so only css/scss will include and JS is remove
         * checks also if includeController then jig will include js but is not alloc by conf
         * @param jig
         * @param section
         * @returns {*}
         */
        renderJig = function (jig, section, config) {
            if (jig && jig.render === false && section !== "head") {
                var path = controllerToPath(jig.controller);
                if (jig.css !== false) {
                    jig.css = path + "/css/" + path.split("/").pop(-1) + ".scss";
                }
                if (jig.includeController || !steal.config("isBuild")) {
                    config.includes.push(path);
                }
            } else if (jig) {
                jig.render = true;
            }
            return jig;
        },
        /**
         * do not include develop option in config
         * @param config
         * @returns {*}
         */
        removeDevelopOptionsFromConfig = function (config) {
            delete config.developConfig;
            return config;
        },
        /**
         * include the template of the jig
         * @param config
         */
        includeTemplate = function (config, jig) {
            if (jig.template) {
                if (typeof jig.template === "object") {
                    if (jig.template[config.locale]) {
                        jig.options.template = "//" + jig.template[config.locale];
                        config.includes.push({id: jig.options.template, jig: jig, locale: config.locale});
                    } else {
                        jig.options.template = "//" + jig.template[Object.keys(jig.template)[0]];
                        config.includes.push({id: jig.options.template, jig: jig, locale: Object.keys(jig.template)[0]});
                    }
                } else {
                    jig.options.template = "//" + jig.template;
                    config.includes.push(jig.options.template);
                }
            } else {
                console.warn("Missing template for Controller: ", jig.controller, " ", "//" + controllerToPath(jig.controller) + "/views/init.ejs");
            }
        },
        /**
         * prepare all jigs for final config
         * @param config
         */
        prepareJig = function (config, jigKey, jig) {

            //noinspection JSUnfilteredForInLoop
            //TODO replace all short written config controller because we do not now if it is ejs or mustache
            if (typeof (jig) === "string") {
                jig = config.jigs[jigKey] = {"controller": jig};
            }
            if (!jig.disabled) {
                if (!jig.path && jig.controller) {
                    jig.path = controllerToPath(jig.controller);
                }
                if (jig.sass) {
                    for (var i in jig.sass) {
                        if (jig.controller) {
                            config.sass[jig.controller.toLowerCase().replace(/\./g, "-") + "-" + i] = jig.sass[i];
                        }
                    }
                }
                jig.options = jig.options || {};

                includeTemplate(config, jig);

                if (jig.css) {
                    jig.options.css = "//" + jig.css;
                }
                browserSupport(jig, config);
                renderJig(jig, jigKey, config);

                /**
                 * check if jig has includes that are config special
                 */
                if (!jig.disabled) {
                    if (jig && jig.includes) {
                        if (typeof jig.includes === "string") {
                            config.includes.push(jig.includes);
                        } else if (jig.includes.length) {
                            config.includes = config.includes.concat(jig.includes);
                        }
                    }
                    // include css
                    if (jig && jig.css) {
                        config.includes.push(jig.css);
                    }

                    // include controller
                    if (jig && jig.render && jig.path) {
                        config.includes.push({id: jig.path});
                    }
                }
            }
        },
        /**
         * prepare domain and page config
         * @param config
         */
        prepareDomainAndPageConfig = function (config) {
            var key,
                pageconfig,
                domainconfig;
            if (config["domain-pages"] && config["domain-pages"][config["domain"]]) {
                domainconfig = config["domain-pages"][config["domain"]];
                if (domainconfig.includes && domainconfig.includes.length) {
                    if (config.includes && config.includes.length) {
                        config.includes = config.includes.concat(domainconfig.includes);
                    } else {
                        config.includes = domainconfig.includes;
                    }
                }
                if (domainconfig.jigs && !isEmptyObject(domainconfig)) {
                    if (config.jigs && !isEmptyObject(config.jigs)) {
                        for (key in domainconfig.jigs) {
                            if (config.jigs[key]) {
                                if (typeof (config.jigs[key]
                                    ) === "string") {
                                    config.jigs[key] = {"controller": config.jigs[key]};
                                }
                                if (typeof (domainconfig.jigs[key]
                                    ) === "string") {
                                    config.jigs[key].controller = domainconfig.jigs[key];
                                } else {
                                    config.jigs[key] = extend(config.jigs[key], domainconfig.jigs[key]);
                                }
                            } else {
                                config.jigs[key] = domainconfig.jigs[key];
                            }
                        }
                    } else {
                        config.jigs = domainconfig.jigs;
                    }
                }
            }
            if (config["init-page"] && config["child-pages"] && config["child-pages"][config["init-page"]]) {
                pageconfig = config["child-pages"][config["init-page"]];
                if (pageconfig.includes && pageconfig.includes.length) {
                    if (config.includes && config.includes.length) {
                        config.includes = config.includes.concat(pageconfig.includes);
                    } else {
                        config.includes = pageconfig.includes;
                    }
                }
                if (pageconfig["child-page-path"]) {
                    config["child-page-path"] = pageconfig["child-page-path"];
                }
                if (pageconfig.jigs && !isEmptyObject(pageconfig)) {
                    if (config.jigs && !isEmptyObject(config.jigs)) {
                        for (key in pageconfig.jigs) {
                            if (config.jigs[key]) {
                                if (typeof (config.jigs[key]) === "string") {
                                    config.jigs[key] = {"controller": config.jigs[key]};
                                }
                                if (typeof (pageconfig.jigs[key]) === "string") {
                                    config.jigs[key].controller = pageconfig.jigs[key];
                                } else {
                                    config.jigs[key] = extend(config.jigs[key], pageconfig.jigs[key]);
                                }
                            } else {
                                config.jigs[key] = pageconfig.jigs[key];
                            }
                        }
                    } else {
                        config.jigs = pageconfig.jigs;
                    }
                }
            }
        },
        /**
         * retruns the string to alloc a jig
         * @param key
         * @param jig
         * @returns {string}
         */
        allocateJig = function (key, jig) {
            return "\nnew " + jig.controller + "(\"" + key + "\", " + JSON.stringify(jig.options) + ");";
        },
        /**
         * Disabled jig is:
         * ---------------------------------------------
         * render === false && steal.config("isBuild")
         * disabled === true
         * controller === false
         * includeController === true && render === false
         * ----------------------------------------------
         * @param jig
         * @returns {boolean}
         */
        hasJigControllerAndIsNotDisabled = function (jig) {
            return !!(jig.controller && !jig.disabled && !(jig.includeController && !jig.render) && !(steal.config("isBuild") && !jig.render));
        },
        /**
         * This will set the current build version
         * @param config {object}
         * @returns config {object}
         */
        setAppVersion = function (config) {
          var version = steal.config("appVersion") || null;
          config.appVersion = version;
          return config;
        },
        /**
         * returns a string of all routes that must be include
         * @param config
         * @returns {string}
         */
        writeJigRoutes = function (config) {
            var key,
                routesKey,
                text = "";
            if (config.jigs && !isEmptyObject(config.jigs)) {
                for (key in config.jigs) {
                    if (config.jigs[key].options && config.jigs[key].options.routes) {
                        for (routesKey in config.jigs[key].options.routes) {
                            text += "\ncan.route('" + routesKey + "', " + JSON.stringify(config.jigs[key].options.routes[routesKey]) + ");";
                        }
                    }
                }
            }
            return text;
        },
        /**
         * only render template when this is no js build in live the worker has rendered the template
         * important can/view must be loaded before
         * @param config
         * @param cb -> fn callback
         */
        renderTemplatesFromNonControllerJigs = function (config, cb) {

            if (!steal.config("isBuild")) {
                var key,
                    text = "",
                    templatefn = function (key, jig) {
                        return  "document.querySelector('" + key + "').appendChild(can.view('" + jig.template + "', " + JSON.stringify(jig.options) + "));\n";
                    };
                for (key in config.jigs) {
                    // render jigs with important flag before other jigs
                    if (config.jigs[key].controller === false && config.jigs[key].template && config.jigs[key].important && !config.jigs[key].disabled) {
                        text += templatefn(key, config.jigs[key]);
                    }
                }
                for (key in config.jigs) {
                    // render jigs with non important flag after jigs with important
                    if (config.jigs[key].controller === false && config.jigs[key].template && !config.jigs[key].important && !config.jigs[key].disabled) {
                        text += templatefn(key, config.jigs[key]);
                    }
                }
                cb(text);
            } else {
                cb("");
            }
        },
        /**
         * check jig config for slot logic and execute it
         * eg.
         *  "slot" : {
         *
         *      "parent" : ".yd-parent",
         *      "insertAsChild": "prepend" || "append",
         *      "classes" : ["class"]
         *
         * }
         *
         * @param key
         * @param jig
         */
        executeJigSlotLogic = function (key, jig) {
            if (jig.slot && !steal.config("isBuild")) {
                var section = document.querySelector(key),
                    classWithoutDot = key.replace(/^\./, ""),
                    parent;
                jig.slot = jig.slot === true ? {} : jig.slot;
                jig.slot.classes = jig.slot.classes || [];
                if (jig.controller) {
                    jig.slot.classes.push(jig.controller.toLowerCase().replace(/\./g, "-"));
                }
                // add section
                if (jig.slot.parent) {
                    section = document.createElement("section");
                    if (jig.slot.classes.indexOf(classWithoutDot) === -1) {
                        jig.slot.classes.push(classWithoutDot);
                    }
                    section.className = jig.slot.classes.join(" ");
                    parent = document.querySelector(jig.slot.parent);
                    if (parent) {
                        if (jig.slot.insertAsChild === "prepend") {
                            parent.insertBefore(section, parent.firstChild);
                        } else {
                            parent.appendChild(section);
                        }
                    } else {
                        console.warn("Jig slot parent not found!");
                    }
                }
                // section exists but class will be add
                else if (section) {
                    section.className = section.className + " " + jig.slot.classes.join(" ");
                } else {
                    console.warn("Jig slot no parent or no section found!");
                }
            }
        },
        prepareNamespace = function (config, options) {
            var namespace = steal.config("namespace");

            steal.config(namespace, config);
            options.text = "if(typeof window === 'undefined'){ window = {};};\n" +
                "window." + namespace + " = window." + namespace + " || {};\n" +
                namespace + " = window." + namespace + ";\n" +
                "window." + namespace + ".predefined = window." + namespace + ".predefined || {};\n" +
                "window." + namespace + ".request = window." + namespace + ".request || {};\n" +
                "window." + namespace + ".config = " + JSON.stringify(config) + ";\n" +
                "steal.config('" + namespace + "', window." + namespace + ".config);\n";

        },
        setPageNum = function (config, options) {
            if (config["pagination-limit"]) {
                options.text += "window." + steal.config("namespace") + ".request['pageLimit'] = " + config['pagination-limit'] + ";\n";
            }
            if (!steal.config("isBuild")) {
                if (config["init-pagination-pageNum"]) {
                    options.text += "window." + steal.config("namespace") + ".request['pageNum'] = " + config["init-pagination-pageNum"] + ";\n";
                }
            }
        },
        /**
         * process a config
         * MAIN Function
         * @param options
         * @param config
         * @param success
         * @param error
         */
        processConfig = function (options, config, success, error) {

            var namespace = config.namespace ? config.namespace.charAt(0).toUpperCase() + config.namespace.slice(1) : "Jm";
            steal.config("namespace", namespace);

            // for js building
            options.putDependenciesAfterThisModuleForBuild = true;

            if (steal.config("isBuild")) {
                config = removeDevelopOptionsFromConfig(config);
            }


            prepareDomainAndPageConfig(config);


            // prepare all jigs
            if (config.jigs) {
                var jigsKeys = Object.keys(config.jigs);
                for (var i = 0; i < jigsKeys.length; i++) {
                    executeJigSlotLogic(jigsKeys[i], config.jigs[jigsKeys[i]]);
                    prepareJig(config, jigsKeys[i], config.jigs[jigsKeys[i]]);
                }
            }

            // include all browser specify stuff
            browserIncludes(config);

            // include main lib
            config.includes.unshift("lib/lib.js");

            setAppVersion(config);

            prepareNamespace(config, options);

            setPageNum(config, options);


            if (config.includes && config.includes.length) {

                options.text += "\nvar contentLoaded =" + contentLoaded.toString() + ";\n";
                //load PO file before js includes only for development ENV
                if (!steal.config("isBuild") && steal.config("domain") !== "default") {
                    steal(config.localePath, function () {
                        config = JSON.stringify(config)
                        config = JSON.parse(config.replace(/_\(([-a-z0-9]+)\)/gm, function (_match, msgid) {
                            return window._(msgid).replace('"', '\\"');
                        }));
                        steal.apply(steal, config.includes);
                   });
                } else {
                    steal.apply(steal, config.includes);
                }

                options.text += 'steal.config("namespace", "' + upperSizeFirstLetter(config.namespace) + '");';



                if ((config.jigs && !isEmptyObject(config.jigs))) {
                    options.text += "steal('can/route', 'can/view/modifiers', ";

                    // write all jig paths to steal that dependencies are loaded before alloc a jig
                    // eg. steal("yd/jig/bla/bla.js", function(){ .....
                    if (config.jigs && !isEmptyObject(config.jigs)) {
                        for (key in config.jigs) {
                            if (hasJigControllerAndIsNotDisabled(config.jigs[key])) {
                                options.text += "'" + config.jigs[key].path + "', ";
                            }
                        }
                    }
                    options.text += "function(){\n";


                    options.text += "\ncontentLoaded(window, function(){\n";
                    options.text += "\nvar routeInit = false;\n";
                    options.text += "\ndocument.body.className = document.body.className.replace(/\\b" + config.namespace + "-onload\\b/,'');\n";
                    options.text += "\ncan.support.cors = true;\n";
                    options.text += "\nif(routeInit){return false;} routeInit = true;\n";
                    // init all routes and trigger ready
                    options.text += "\ncan.route." + config.namespace + "Ready = can.Deferred();\n";


                    // write all routes that jigs have
                    options.text += writeJigRoutes(config);


                    // write jigs and steal dependencies
                    if (config.jigs && !isEmptyObject(config.jigs)) {
                        renderTemplatesFromNonControllerJigs(config, function (text) {
                            options.text += text;
                            for (key in config.jigs) {
                                // render jigs with important flag before other jigs
                                if (config.jigs[key].important && hasJigControllerAndIsNotDisabled(config.jigs[key])) {
                                    options.text += allocateJig(key, config.jigs[key]);
                                }
                            }
                            for (key in config.jigs) {
                                // only render jigs that have a controller and are not disabled and have not the important flag
                                if (hasJigControllerAndIsNotDisabled(config.jigs[key]) && !config.jigs[key].important) {
                                    options.text += allocateJig(key, config.jigs[key]);
                                }
                            }
                            options.text += "\ncan.route.ready();";
                            options.text += "\ncan.route." + config.namespace + "Ready.resolve();";
                        });
                    }
                    options.text += "\n});";
                    options.text += "});";
                }
                success();
            } else {
                error("No includes or jigs defined");
                console.warn("No includes or jigs defined");
            }
        },
        /**
         * merged all configs in 1
         * @param parseconfig
         * @param configs
         * @returns {{includes: Array}}
         */
        mergeConfigs = function (parseconfig, configs) {

            var config = {
                    includes: []
                },
                includes = [];


            for (var i = 0; i < configs.length; i++) {
                if (configs[i] && configs[i].includes && configs[i].includes.length) {
                    // check dublicate includes
                    for (var j = 0; j < configs[i].includes.length; j++) {
                        if (includes.indexOf(configs[i].includes[j]) === -1) {
                            includes.push(configs[i].includes[j]);
                        }
                    }
                }
                config = extend(config, configs[i]);
            }

            config.includes = includes;

            return config;
        },
        /**
         * get all config files
         * @param configs
         * @param done
         */
        getAllConfigs = function (configs, done) {
            var counter = 0,
                doneResult = [],
                factory = function (path, callback) {
                    if (steal.config("isBuild") && !steal.config("isTest")) {
                        var fs = require("fs");
                        try {
                            var content = fs.readFileSync(steal.config("root") + path, {encoding: "utf8"});
                        } catch (e) {
                            console.warn("No .conf file:", steal.config("root") + path);
                        }
                        callback(content);
                    } else {

                        steal.request({
                            src: path
                        }, function (data) {
                            callback(data)
                        }, function () {
                            callback(undefined);
                        });


                    }
                };
            if (configs && configs.length) {

                for (var index in configs) {
                    !function (i) {
                        factory(configs[i], function (result) {
                            counter++;
                            if (typeof result === "string") {
                                doneResult[i] = JSON.parse(result);
                            }
                            if (counter === configs.length) {
                                done(doneResult);
                            }
                        });
                    }(index);
                }
            } else {
                done(doneResult);
            }
        },
        /**
         * TODO: use node config merger to have the same codebase (middleware grunt server)
         * get all config paths
         * @param path
         * @returns {Array}
         */
        getConfigPaths = function (path) {
            var configs = [],
                namespace = getNamespace();
            // get all configs that are in folders - we can bubble up the path (default and domain)
            function setConfigs(path) {
                var dirs = path.split("/"),
                    confPath;
                for (var i = 0, dir = "", tempPath = "", len = dirs.length; i < len; i++, dir = dirs[i]) {
                    if (dir && dir.indexOf("html") === -1) {
                        tempPath += "/" + dir;
                        if (tempPath.indexOf("page") !== -1) {
                            confPath = tempPath + "/" + dir + ".conf";
                            if (dir !== namespace && configs.indexOf(confPath) === -1) {
                                configs.push(tempPath + "/" + dir + ".conf");
                            }
                        }

                    }
                }
            };
            var defaultPath = path.replace(/\/[^\/]*\.[a-z]{2,3}\/(?:[^\/]*\.[a-z]{2,3}\/)*/, "/default/");
            //if it is the satellite path replace second domain name and priority folder
            defaultPath = defaultPath.replace(/\/default(\/.*?)?\/[^\/]*\.[a-z]{2,5}\//, "/default/");
            setConfigs(defaultPath);
            setConfigs(path);
            setConfigs("/" + namespace.toLowerCase() + "/page/" + getDomain());
            return configs;
        },
        /**
         *  upper case the first letter of a string
         *
         * @param controller
         * @returns {string}
         */
        upperSizeFirstLetter = function (string) {
            return string.toString()[0].toUpperCase() + string.toString().slice(1)
        },
        /**
         * get path from page
         * @returns {*}
         */
        getNamespace = function () {
            var path = getPath(),
                namsepsace = path.replace(/^\//, "").split("/")[0];
            return upperSizeFirstLetter(namsepsace);
        },
        /**
         * get path from page
         * @returns {*}
         */
        getPath = function () {
            if (steal.config("pathToBuild")) {
                return steal.config("pathToBuild");
            } else if (window.location) {
                return window.location.pathname;
            } else {
                throw new Error("Conf type loader can´t get a location (url)");
                return null;
            }
        },
        /**
         * get current domain
         * @returns {string}
         */
        getDomain = function () {
            var domain = "",
                path = getPath(),
                match = path.match(/\/[^\/]*\/page\/([^\/]+)\//);
            if (match) {
                domain = match[1];
            } else if (steal.config("domain")) {
                domain = steal.config("domain");
            } else {
                domain = "default";
                console.warn("No domain in path / url - use default domain");
            }
            return domain;
        },
        /**
         * extend function
         * @returns {*}
         */
        extend = function (/*obj_1, [obj_2], [obj_N]*/) {
            if (arguments.length < 1 || typeof arguments[0] !== 'object') {
                return false;
            }

            if (arguments.length < 2) return arguments[0];

            var target = arguments[0];

            // convert arguments to array and cut off target object
            var args = Array.prototype.slice.call(arguments, 1);

            var key, val, src, clone;

            args.forEach(function (obj) {
                if (typeof obj !== 'object') return;

                for (key in obj) {
                    if (obj[key] !== void 0) {
                        src = target[key];
                        val = obj[key];

                        if (val === target) continue;

                        if (typeof val !== 'object' || val === null) {
                            target[key] = val;
                            continue;
                        }

                        if (typeof src !== 'object') {
                            clone = (Array.isArray(val)) ? [] : {};
                            target[key] = extend(clone, val);
                            continue;
                        }

                        if (Array.isArray(val)) {
                            clone = (Array.isArray(src)) ? src : [];
                        } else {
                            clone = (!Array.isArray(src)) ? src : {};
                        }

                        target[key] = extend(clone, val);
                    }
                }
            });

            return target;
        },
        /**
         * empty object check
         * @param obj
         * @returns {boolean}
         */
        isEmptyObject = function (obj) {
            var name;
            for (name in obj) {
                return false;
            }
            return true;
        },
        /**
         * read cookie
         * @param name
         * @returns {*}
         */
        readCookie = function (name) {
            var ck,
                cv,
                i;
            if (document.cookie) {
                ck = document.cookie.split('; ');
                for (i = ck.length - 1; i >= 0; i--) {
                    cv = ck[i].split('=');
                    if (cv[0] === name) {
                        return cv[1];
                    }
                }
            }
            return undefined;
        },
        /**
         * set sass variables (domain, locale) from config
         * @param conf
         * @returns {*}
         */
        setSassVariables = function (conf) {
            conf.sass = conf.sass || {};

            if (!conf.domain) {
                console.warn("Domain is not set in config (domain)");
            }
            if (!conf.locale) {
                console.warn("Locale is not set in config (locale)");
            }
            conf.namespace = conf.namespace || "Jm";
            conf.sass[conf.namespace + "-domain"] = conf.domain ? conf.domain.replace(/\./g, "_") : "default";
            conf.sass[conf.namespace + "-locale"] = conf.locale;
            return conf;
        },
        setIsTestConfigWhenFuncunitIsLoaded = function () {
            if (typeof ___FUNCUNIT_OPENED !== "undefined") {
                steal.config("isTest", true);
            }
        };

    /**
     *
     * Type definition of .conf files
     *
     */
    steal.type("conf js", function (options, success, error) {
        var domain,
            stealToUri,
            config = JSON.parse(options.text),
            configs;
        setIsTestConfigWhenFuncunitIsLoaded();
        if (!config) {
            error("Config can't be parsed");
        }
        // ignore this config to load in production
        //options.ignore = true;
        if (!config.includes) {
            config.includes = [];
        }
        // get temp domain from URL after we had a conf we use the domain from conf file
        domain = getDomain();
        if (domain) {
            // replace domain placeholder in paths
            stealToUri = steal.idToUri;
            steal.idToUri = function (id, noJoin) {
                id.path = id.path.replace(/%DOMAIN%/, domain);
                return stealToUri(id, noJoin);
            };
        }
        configs = getConfigPaths(getPath());
        getAllConfigs(configs, function (results) {
            var mergedConfig = mergeConfigs(config, results);

            if (!mergedConfig.domain) {
                mergedConfig.domain = domain;
            }
            mergedConfig.groupedDomain = domain;

            if (!mergedConfig.buildPath) {
                mergedConfig.buildPath = getPath();
            }

            // set local
            mergedConfig.locale = steal.config("init-locale") || steal.config().env === 'development' && !steal.config("isBuild") && readCookie("locale") || mergedConfig["init-locale"] || (mergedConfig.locales && mergedConfig.locales[0]) || "default";

            var messagePOFile = (mergedConfig.namespace || "") + "/locales/" + mergedConfig.domain + "/" + mergedConfig.locale + "/messages.po";
            mergedConfig.localePath = messagePOFile;
            if (steal.config("domain") !== "default") {
                mergedConfig.includes.unshift(messagePOFile);
            }


            mergedConfig = setSassVariables(mergedConfig);


            processConfig(options, mergedConfig, success, error);


        });
    });

    // node export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            setSassVariables: setSassVariables,
            controllerToPath: controllerToPath
        };
    }

}(this.window || {});
