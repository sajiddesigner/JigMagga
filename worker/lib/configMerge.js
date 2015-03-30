'use strict';

var hgl = require('highland'),
    STATUS_CODES = require('./error').STATUS_CODES,
    WorkerError = require('./error').WorkerError,
    _ = require('lodash'),
    configMerge = require('jmUtil').configMerge,
    path = require('path'),
    request = require('request'),
    mainConfig = require('../config').main;

/**
 * @module configMerge
 */

/**
 * @name WorkerMessage
 * @type {object}
 * @property {string} locale
 * @property {string} page
 * @property {string} basedomain
 * @property {string} domain
 */

var isDomain = function (name) {
    var regex = /^([a-zA-Z0-9]+\.)?[a-zA-Z0-9][a-zA-Z0-9-]+\.[a-zA-Z]{2,6}?$/i;

    return regex.test(name);
};


var onEnoent = function (page, callback) {
    var configName = _.last(page.split('/')).replace(/\.conf$/, '');

    if(!isDomain(configName)) {
        return callback(null, {});
    }

    request.get(mainConfig.configStoreApiEndpoint, {
        json: true,
        qs: {url: configName}
    }, function (err, res) {
        if (err) {
            return callback(err);
        }
        if (!res.body[0]) {
            return callback({name: 'NoConfigInDB', message: 'no config in DB for domain ' + configName});
        }

        callback(null, res.body[0].config);
    });

};

module.exports = {
    /**
     * returns configMerge stream
     * @return {Transform}
     */
    getConfigStream: function () {

        return hgl.flatMap(hgl.wrapCallback(this.getConfig));
    },


    /**
     * stream that create config using getPageConfig function for each message
     * if there is the page config was loaded it sets isPageConfigLoaded to true
     * in order to prevent this message from second config load
     *
     * @param  {{message: WorkerMessage, basePath: string, isPageConfigLoaded: boolean}}   data
     * @param  {Function} callback
     */
    getConfig: function (data, callback) {

        var message = data.message,
            basePath = data.basePath;

        if (data.isPageConfigLoaded) {
            return callback(null, data);
        }

        basePath = path.join(basePath, 'page');

        configMerge.getPageConfig(basePath, message.basedomain, message.page, onEnoent, function (err, config) {
            if (err) {
                if (_.isFunction(data.queueShift)) {
                    data.queueShift();
                }
                if (err.name === 'NoConfigInDB') {
                    return callback(new WorkerError(err.message || err, data.message, data.key, STATUS_CODES.NO_SUCH_DOMAIN));
                }

                return callback(new WorkerError(err.message || err, data.message, data.key));
            }

            var result = data;
            result.config = config;
            result.isPageConfigLoaded = (message.page) ? true : false;
            callback(null, result);

        });
    }
};
