/**
 * Created with JetBrains WebStorm.
 * User: ydadmin
 * Date: 04.02.13
 * Time: 18:39
 * To change this template use File | Settings | File Templates.
 */
var deepExtend = require("deep-extend");
var _ = require("lodash");

var deepReplace = function (obj, search, replace) {
    if (typeof obj === "object" && obj !== null && obj.constructor !== Array) {
        for (var key in obj) {
            if (obj.hasOwnProperty(key) && key !== "pages") { // don't replace placeholders in first level pages list to avoid replacing {url} here
                obj[key] = deepReplace(obj[key], search, replace);
            }
        }
    }
    else if (obj && obj.constructor === Array) {
        for (var i = 0; i < obj.length; i++) {
            obj[i] = deepReplace(obj[i], search, replace);
        }
    } else if (typeof obj === "string" && obj.indexOf(search) > -1) {
        obj = obj.replace(search, replace);
    }
    return obj;
};

var getConfigPlaceholders = function (obj, params, matches) {
    var newMatches, match, trimmedMatch;
    if (typeof obj === "object" && obj !== null && obj.constructor !== Array && (typeof obj.predefined === "undefined" || obj.predefined !== false)) {
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (matches) {
                    matches = deepExtend(matches, getConfigPlaceholders(obj[key], params, matches));
                } else {
                    matches = getConfigPlaceholders(obj[key], params, matches);
                }
            }
        }
    }
    else if (obj && obj.constructor === Array) {
        for (var i = 0; i < obj.length; i++) {
            if (matches) {
                matches = deepExtend(matches, getConfigPlaceholders(obj[i], params, matches));
            } else {
                matches = getConfigPlaceholders(obj[i], params, matches);
            }
        }
    } else if (typeof obj === "string" && obj.indexOf("{") > -1) {
        newMatches = obj.match(/\{.*?\}/g);
        if (newMatches) {
            newMatches.forEach(function (match) {
                trimmedMatch = match.substr(1, match.length - 2);
                if (!matches || !matches[trimmedMatch]) {
                    matches = matches || {};
                    matches[trimmedMatch] = getParamByString(trimmedMatch, params);
                }
            });
        }
    }
    return matches;
};

var getParamByString = function (string, params) {
    if (string.indexOf(".") > -1) {
        var arr = string.split("."),
            first = arr.shift();
        if (typeof params === "object" && params !== null && (params.constructor !== Array || first.search(/^\d/) === 0)) {
            if (params[first]) {
                return getParamByString(arr.join("."), params[first]);
            }
        } else if (params.constructor === Array) {
            var paramArr = [];
            for (var i = 0, l = params.length; i < l; i++) {
                if (params[i][first]) {
                    paramArr.push(getParamByString(arr.join("."), params[i][first]));
                }
            }
            return paramArr;
        }
    } else if (params && params.constructor === Array) {
        var paramArr = [];
        for (var i = 0, l = params.length; i < l; i++) {
            if (params[i][string] !== undefined) {
                paramArr.push(params[i][string]);
            }
        }
        return paramArr;
    } else {
        return params[string];
    }
    return undefined;
};

var replaceConfigPlaceholders = function (config, placeholders) {
    var placeholderValues = [],
        placeholderKeys = [],
        placeholder;

    for (placeholder in placeholders) {
        if (placeholders.hasOwnProperty(placeholder)) {
            placeholderValues.push(placeholders[placeholder]);
            placeholderKeys.push(placeholder);
        }
    }
    return replaceConfigPlaceholdersByArrays([config], placeholderKeys, placeholderValues);
};

var replaceConfigPlaceholdersByArrays = function (configs, placeholderKeys, placeholderValues, lastPlaceholderObject) {
    var placeholderKey = placeholderKeys.shift(),
        placeholderObject = placeholderKey && placeholderKey.indexOf(".") > -1 ? placeholderKey.split(".")[0] : lastPlaceholderObject,
        placeholderValue = placeholderValues.shift(),
        newConfigs = [];


    configs.forEach(function (config, i) {
        if (placeholderValue !== undefined) {
            if (placeholderValue.constructor === Array && placeholderObject === lastPlaceholderObject) {
                newConfigs = newConfigs.concat(replaceConfigPlaceholder(config, placeholderKey, placeholderValue[i]));
            } else {
                newConfigs = newConfigs.concat(replaceConfigPlaceholder(config, placeholderKey, placeholderValue));
            }
        } else {
            newConfigs = newConfigs.concat(config);
        }
    });

    if (placeholderKeys.length) {
        newConfigs = replaceConfigPlaceholdersByArrays(newConfigs, placeholderKeys, placeholderValues, placeholderObject);
    }
    return newConfigs;
};

var replaceConfigPlaceholder = function (config, placeholder, value) {
    var configs = [];
    if (!value || !value.constructor || value.constructor !== Array) {
        configs.push(deepReplace(deepExtend({}, config), "{" + placeholder + "}", value));
    } else {
        value.forEach(function (v) {
            configs.push(deepReplace(deepExtend({}, config), "{" + placeholder + "}", v));
        });
    }
    return configs;
};

exports.replaceConfigPlaceholders = replaceConfigPlaceholders;
exports.getConfigPlaceholders = getConfigPlaceholders;

exports.getParamByString = getParamByString;
exports.deepReplace = deepReplace;

exports.simpleReplace = function(string, params) {
    if (string.indexOf("{") < 0) {
        return string;
    }

    _.each(params, function(value, key) {
        string = string.replace("{" + key + "}", value);
        if (string.indexOf("{") < 0) {
            return false;
        }
    });

    return string;
}
