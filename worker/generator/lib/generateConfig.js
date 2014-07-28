'use strict';
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var async = require('async');
var format = require('util').format;
var deepExtend = require('deep-extend');

var viewHelper = require("./view");


var initViewContainer = function (message, projectName) {
    var viewContainer = _.cloneDeep(viewHelper.helper);

    viewContainer.shtml = false;
    viewContainer.IS_WORKER = true;
    viewContainer.domain = message.domain;
    viewContainer.page = message.page;

    viewContainer.pagePath = format('%s/page/%s/%s/', projectName, message.basedomain, message.page);

    return viewContainer;
};

var isFileNotExist = function (err) {
    return err.code === 'ENOENT';
};

var obtainTemplate = function (msg, basePath, callback) {
    var domainPagePath = path.join(basePath, 'page', msg.basedomain, msg.page),
        defaultPagePath = path.join(basePath, 'page/default', msg.page),
        headLang = msg.locale.substr(0, 2),
        country = msg.locale.substr(-2);

    function tplPath(pagePath) {
        return path.join(pagePath, msg.page + '.html');
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

var extendWithDomainPage = function (config, basedomain) {
    var result = {};

    if (!config['domain-pages'] || !config['domain-pages'][basedomain]) {
        return config;
    }

    result = deepExtend(result, config, config['domain-pages'][basedomain]);
    delete result['domain-pages'][basedomain];
    return result;
};

var extendWithChildPage = function (config, childpage) {
    if (!childpage) {
        return config;
    }
    
    if (!config['child-pages'] || !config['child-pages'][childpage]) {
        throw new Error('Unknown child page: ' +  childpage);
    }
    
    return deepExtend({}, config, config['child-pages'][childpage]); 
};


module.exports = function (data, workerConfig, callback) {
    var message = data.message,
        localConfig = data.config,
//        exc = message.exc,
        projectName = data.basePath.split('/').reverse()[0],
        viewContainer = initViewContainer(message, projectName), // init view container
        pageWithoutPath = message.page.replace(/^.*\//, ""),
        domainPagePath = format("%s/page/%s/%s/", projectName, message.basedomain, message.page);

    async.waterfall([
        obtainTemplate.bind(null, message, data.basePath),
        function (result, next) {
            localConfig.template = result.content;
//            result.path = result.path.replace(data.basePath, '/' + projectName);

            localConfig.pagePath = path.join(result.path, '/');
            viewContainer.filename = path.join(result.path, pageWithoutPath + '.html');

            if (message.version) {
                return next();
            }
            fs.readFile(path.join(data.basePath, 'version.json'), next);
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

            localConfig = extendWithDomainPage(localConfig, message.basedomain);

            localConfig.predefined = generatePredefined(data);

            try {
                data.config = extendWithChildPage(localConfig, message.childpage);
            } catch (e) {
                return next(e);
            }

            next(null, data);
        }
    ], callback);

//    if (exc) {
//        localConfig["upload-worker"] = function (message) {
//            message.bucket = knoxConf.S3_BUCKET;
//            message.domain = domain;
//            message.deleteAfter = true;
//            console.log("Writing to upload queue", message.from);
//            exc.publish(amqpQueueUploder, JSON.stringify(message), { contentType: 'application/json'});
//        };
//    } else {
//        localConfig["upload-worker"] = false;
//    }
};
