'use strict';
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var async = require('async');
var format = require('util').format;

var viewHelper = require("./view");

/**
 * provide module that generating config
 * @module generateConfig
 */


/**
 * @name WorkerMessage
 * @type {object}
 * @property {string} locale
 * @property {string} page
 * @property {string} basedomain
 * @property {string} domain
 */


/**
 * init view container object
 *
 * @param  {WorkerMessage} message
 * @param  {string} projectName
 * @param {Object} config
 * @return {object}
 */
var initViewContainer = function (message, projectName, config) {
    var viewContainer = _.cloneDeep(viewHelper.getHelper(projectName, config));

    viewContainer.workerLocale = message.locale;
    viewContainer.shtml = false;
    viewContainer.IS_WORKER = true;
    viewContainer.domain = message.domain;
    viewContainer.page = message.page;

    viewContainer.pagePath = format('%s/page/%s/%s/', projectName, message.basedomain, message.page);

    return viewContainer;
};

/**
 * checks if error has code ENOENT that means that file not exists
 *
 * @param  {{code: string}}}  err - error object
 * @return {Boolean}
 */
var isFileNotExist = function (err) {
    return err.code === 'ENOENT';
};


/**
 * get template from domain folder or from default folder
 * replace include tags inside template
 *
 * @param  {WorkerMessage}   msg - message object
 * @param  {string}   basePath - path to folder that contains 'page' folder with configs
 * @param  {Function} callback
 */
var obtainTemplate = function (msg, basePath, callback) {
    var domainPagePath = path.join(basePath, 'page', msg.basedomain, msg.page),
        defaultPagePath = path.join(basePath, 'page/default', msg.page),
        headLang = msg.locale.substr(0, 2),
        country = msg.locale.substr(-2);


    function tplPath(pageFolderPath) {
        if (msg.origMessage.staticOld) {
            return pageFolderPath + '.html';
        }
        var page = msg.page;

        page = page.split('/').reverse()[0];

        return path.join(pageFolderPath, page + '.html');
    }

    function next(err, res) {
        if (err) {
            return callback(err);
        }
        res.content = res.content.toString('utf-8');
        res.content = res.content.replace(/<!--#include\s+virtual="(.*?)"\s*-->/g, function (_str, include) {
            return "<% include " + include + " %>";
        });

        if (res.path === defaultPagePath) {
            var htmlTag = format('<html lang="%s" id="%s"', headLang, country.toLowerCase());
            res.content = res.content.replace(/<html/g, htmlTag);
        }
        callback(null, res);
    }

    fs.readFile(tplPath(domainPagePath), function (err, res) {
        if (!err) {
            return next(null, {path: domainPagePath, content: res});
        } else if (err && !isFileNotExist(err)) {
            return next(err);
        }

        fs.readFile(tplPath(defaultPagePath), function (err, defaultRes) {
            if (err) {
                return next(err);
            }
            return next(null, {path: defaultPagePath, content: defaultRes});
        });
    });
};

/**
 * generate uploadUrl and uploadS3 flag
 *
 * @param  {{message: WorkerMessage, config: {pages: object[]}}} data
 * @return {{uploadUrl: string, uploadS3: boolean}}
 */
var generateUrls = function (data) {
    var result = {},
        url = data.message.url,
        locale = data.message.locale,
        pages = data.config.pages,
        page = data.message.page;
    result.url = url;

    if (!url) {
        url = page;
        result.uploadS3 = false;
        result.uploadUrl = url;
        return result;
    }

    if (pages[page] && pages[page][locale]) {
        result.uploadUrl = pages[page][locale].replace("{url}", url);
        if (result.uploadUrl.match(/\/$/)) {
            result.uploadUrl = result.uploadUrl + "index";
        }
        result.uploadUrl = result.uploadUrl.replace(/^\//, "");
    } else {
        result.uploadUrl = url;
    }
    result.uploadS3 = true;

    return result;
};

/**
 * generate predefined object that will be used in the template generation
 * @param  {{message: WorkerMessage, config: object}} data
 * @return {object}
 */
var generatePredefined = function (data) {
    var country = data.message.locale.substr(-2),
        headLang = data.message.locale.substr(0, 2),
        predefined = data.message.params || {};

    predefined.country = country;
    predefined.language = data.message.locale.replace('_', '-') + ',' + headLang + ';q=0.8,en-US;q=0.6,en;q=0.4';
    predefined.locale = data.message.locale;
    predefined.pageLimit = predefined.pageLimit || data.config['pagination-limit'] || 200;
    predefined.pageNum = 1;
    predefined.pageType = data.message.page;
    predefined.url = data.message.url;
    return predefined;
};



/**
 * extend config with child-pages if them exists
 *
 * @param  {object} config
 * @param  {string} childpage
 * @return {object}
 */
var extendWithChildPage = function (config, childpage) {
    if (!childpage) {
        return config;
    }

    if (!config['child-pages'] || !config['child-pages'][childpage]) {
        throw new Error('Unknown child page: ' +  childpage);
    }

    return _.merge(_.cloneDeep(config), config['child-pages'][childpage]);
};

/**
 * extends config with viewContainer, predefined object, domain page, child pages
 * and obtain a template
 *
 * @param  {{message: WorkerMessage, config: {locales: array}}}   data
 * @param  {object}   workerConfig
 * @param  {Function} callback
 */
module.exports = function (data, workerConfig, callback) {
    var message = data.message,
        isStaticOld = Boolean(data.message.origMessage.staticOld),
        localConfig = data.config,
        mainLocale = data.config['init-locale'] || data.config.locales[0],

        projectName = data.basePath.split('/').reverse()[0],

        pageWithoutPath = message.page.replace(/^.*\//, ""),
        domainPagePath;

    data.config.locale = data.message.locale;
    var viewContainer = initViewContainer(message, projectName, data.config); // init view container

    if (isStaticOld) {
        domainPagePath = path.join(projectName, 'page', message.basedomain, 'static-old/');
    } else {
        domainPagePath = format("%s/page/%s/%s/", projectName, message.basedomain, message.page);
    }

    data.locale =  data.message.locale;

    data.isMainLocale = data.locale === mainLocale;


    async.waterfall([
        function (next) {
            if (localConfig.uploadOnlyJson) {
                return next(null, null);
            }

            obtainTemplate(message, data.basePath, next);
        },
        function (result, next) {
            if (_.isPlainObject(result)) {
                localConfig.template = result.content;


                if (isStaticOld) {
                    result.path = path.join(result.path, '..');
                }

                localConfig.pagePath = path.join(result.path, '/');
                viewContainer.filename = path.join(result.path, pageWithoutPath + '.html');
            }
            if (message.version) {
                return next(null, null);
            }
            fs.readFile(path.join(data.basePath, 'package.json'), next);
        },
        function (result, next) {
            viewContainer.version = message.version || JSON.parse(result).version;

            localConfig = _.assign(localConfig, generateUrls(data));
            localConfig = _.assign(localConfig, {
                viewContainer: viewContainer,
                scriptName: format('%sproduction-%s-%s.js', domainPagePath, data.locale, viewContainer.version),
                apiConfig: workerConfig.api,
                domain: message.domain,
                locale: data.locale,
                jsonUrlPostfix: data.isMainLocale ? "" : "/" + data.locale
            });
            //localConfig = extendWithDomainPage(localConfig, message.basedomain);

            localConfig.predefined = generatePredefined(data);

            try {
                data.config = extendWithChildPage(localConfig, message.childpage);
            } catch (e) {
                return next(e);
            }

            next(null, data);
        }
    ], callback);
};
