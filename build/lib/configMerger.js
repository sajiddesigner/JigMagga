'use strict';


var jmUtil = require('jmUtil'),
    es = require('event-stream'),
    _ = require('lodash'),
    path = require('path'),
    request = require('request'),
    konphyg = require('konphyg'),
    async = require('async'),
    util = require('util');


var isDomain = function (name) {
    var regex = /^([a-zA-Z0-9]+\.)?[a-zA-Z0-9][a-zA-Z0-9-]+\.[a-zA-Z]{2,6}?$/i;

    return regex.test(name);
};

var onEnoent = function (projectConfig, page, callback) {
    var configName = _.last(page.split('/')).replace(/\.conf$/, '');

    if(!isDomain(configName)) {
        return callback(null, {});
    }

    request.get(projectConfig.configStoreApiEndpoint, {
        json: true,
        qs: {url: configName}
    }, function (err, res) {
        if (err) {
            return callback(err);
        }
        if (!res.body[0]) {
            return callback("no config in DB for domain " + configName);
        }

        callback(null, res.body[0].config);
    });

};

function callPageConfigUtil(getProjectConfig) {

    return es.map(function (data, callback) {
        if (!data.build.basePath) {
            throw new Error("There is no basepath");
        }
        if (!data.build.domain) {
            throw new Error("There are no domain settings");
        }

        var onEnoentError = onEnoent.bind(null, getProjectConfig(data.build.namespace).main);

        jmUtil.configMerge.getPageConfig(data.build.basePath, data.build.domain, data.build.page, onEnoentError,
            function (err, result) {
                if (err) {
                    return callback(err);
                }
                data.data = result;
                callback(null, data);
            });
    });
}

function isExternal (link) {
    return link.indexOf('http://') === 0 ||
        link.indexOf('//') === 0 ||
        link.indexOf('https://') === 0;
}

var projectConfigStore = {};


module.exports = {


    /**
     *
     * @param basePath
     * @param domain
     * @returns {*}
     */
    getConfig: function () {
        return callPageConfigUtil(this.getProjectConfig);
    },

    /**
     *
     * @param basePath
     * @param domain
     * @returns {*}
     */
    getConfigFromPageItem: function (page, basePath, domain, namespace, cb) {

        var onEnoentError = onEnoent.bind(null, this.getProjectConfig(namespace).main);
        jmUtil.configMerge.getPageConfig(basePath, domain, page, onEnoentError, cb);

    },

    /**
     *
     * @param page
     * @returns {*}
     */
    getPagesThatMatchThePageParam: function () {
        return es.map(function (data, callback) {
            var regex = new RegExp("^" + data.build.page + "$");
            var locale = data.data.locales[0];
            var filteredPages = Object.keys(data.data.pages).filter(function (item) {
                if (item && item.search(regex) !== -1 && !isExternal(data.data.pages[item][locale])) {
                    return true;
                }
            });
            if (!filteredPages.length) {
                throw new Error("No page found with pattern: " + regex);
            }
            data.build.pages = filteredPages;
            data.build.pagesRegex = regex;
            callback(null, data);
        });
    },
    /**
     * this fn iterate over all build.pages in a stream and will return a stream that include an array with all pages configurations
     * @param basePath
     * @param domain
     */
    getAllMergedConfigsFromPages: function () {
        var self = this;
        return es.map(function (data, callback) {
            if (!data.build || !data.build.basePath || !data.build.domain) {
                throw new Error("Stream need build object with {basePath: \"\", domain: \"\"} ");
            }
            async.mapLimit(data.build.pages, 1, function (item, cb) {
                self.getConfigFromPageItem(item, data.build.basePath, data.build.domain, data.build.namespace, function (err, result) {
                    if (err) {
                        console.log(item);
                        throw err;
                    }
                    result.build = util._extend({}, data.build);
                    result.build.page = item;
                    cb(null, result);
                });
            }, function (err, results) {
                callback(err, results);
            });
        });
    },

    /**
     * obtains a project config by namespace and cash it in the scope
     *
     * @param {string} namespace
     * @return {object}
     */
    getProjectConfig: function (namespace) {
        if (projectConfigStore[namespace]) {
            return projectConfigStore[namespace];
        }
        var pathToConfig = path.join(__dirname, '../..', namespace, 'config');
        var config = konphyg(pathToConfig);

        projectConfigStore[namespace] = config.all();
        return projectConfigStore[namespace];
    }
};
