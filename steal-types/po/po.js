steal({id: './gettext.js', ignore: true}, "./sprintf.js",
    function (can) {
        "use strict";
        var replaceGettextUnderscore = {
            isResolved: false,
            callbacks: [],
            done: function (fn) {
                if (!this.isResolved) {
                    this.callbacks.push(fn);
                } else {
                    fn();
                }
            },
            resolve: function () {
                this.isResolved = true;
                for (var i = 0, len = this.callbacks.length; i < len; i++) {
                    this.callbacks[i]();
                }
            }
        };

        window.gettext = new Gettext();

        steal.type("po fn", function (options, success) {

            var win = window,
                rv = {},
                parsed,
                domain,
                quoteRegex = {
                    "'": new RegExp("['\"]", "g"),
                    '"': new RegExp('["\']', "g")
                };


            parsed = win.gettext.parse_po(options.text);
            // munge domain into/outof header
            if (parsed) {
                if (!parsed[""]) {
                    parsed[""] = {};
                }
                if (parsed[""].language) {
                    parsed[""].domain = parsed[""].language;
                }
                if (!parsed[""].domain) {
                    parsed[""].domain = "";
                }
                domain = parsed[""].domain;
                rv[domain] = parsed;
                win.gettext.parse_locale_data(rv);
                win._ = function (string, v) {
                    return win.gettext.gettext(string).replace("%s", v);
                };
                win._n = function (string, string2, n) {
                    return win.gettext.gettext(n == 1 ? string : string2).replace("%s", n);
                };

                win.replaceGettextUnderscore = function (string) {
                    return string
                        .replace(/can\.Mustache\.txt\(\n\{scope:scope,options:options\},\nnull,\{get:"_"\},"([^"]+)"\)/mg, function (_match, msgid, quote) {
                            return '"' + win.gettext.gettext(msgid).replace('"', '\\"') + '"';
                        })
                        .replace(/_\(\s*['"]([^'"]+)(['"])\s*\)/gm, function (_match, msgid, quote) {
                            return quote + win.gettext.gettext(msgid).replace(quoteRegex[quote], "\\'") + quote;
                        })
                        //// new
                        .replace(/_\(([-a-z0-9]+)\)/gm, function (_match, msgid) {
                            return win.gettext.gettext(msgid).replace('"', '\\"');
                        })
                        .replace(/_\(\s*['"]([^'"]+)(['"])\s*,/gm, function (_match, msgid, quote, vars) {
                            return " sprintf(" + quote + win.gettext.gettext(msgid).replace(quoteRegex[quote], "\\'") + quote + ", ";
                        })
                        .replace(/_n\(\s*['"]([^'"]+)(['"])\s*,\s*['"]([^'"]+)(['"])\s*,\s*([^,\}\n;]+),/g, function (_match, msgid1, quote1, msgid2, quote2, n, vars) {
                            return " sprintf(((" + n + " == 1 ? " + quote1 + win.gettext.gettext(msgid1).replace(quoteRegex[quote1], "\\'") + quote1 + " : " + quote2 + win.gettext.gettext(msgid2).replace(quoteRegex[quote2], "\\'") + quote2 + "), " + n + ", ";
                        })
                        .replace(/([(]+)\s*_n\(\s*['"]([^'"]+)(['"])\s*,\s*['"]([^'"]+)(['"])\s*,\s*([^,\}\n;]+)/g, function (_match, brak, msgid1, quote1, msgid2, quote2, n, vars) {
                            return brak + "sprintf((((" + n + " == 1 ? " + quote1 + win.gettext.gettext(msgid1).replace(quoteRegex[quote1], "\\'") + quote1 + " : " + quote2 + win.gettext.gettext(msgid2).replace(quoteRegex[quote2], "\\'") + quote2 + "), " + n;
                        })
                        .replace(/_n\(\s*['"]([^'"]+)(['"])\s*,\s*['"]([^'"]+)(['"])\s*,\s*([^,\}\n;]+)/g, function (_match, msgid1, quote1, msgid2, quote2, n, vars) {
                            return " sprintf(((" + n + " == 1 ? " + quote1 + win.gettext.gettext(msgid1).replace(quoteRegex[quote1], "\\'") + quote1 + " : " + quote2 + win.gettext.gettext(msgid2).replace(quoteRegex[quote2], "\\'") + quote2 + "), " + n;
                        });
                };
                replaceGettextUnderscore.resolve(true);
            }

            options.text = "";

            options.fn = function () {
            };
            success();
        });

        var replacePoInJs = function (jsOptions, text, jsSuccess, jsError) {
            jsOptions.text = window.replaceGettextUnderscore(text);
            jsOptions.text += "\n//@ sourceURL=" + jsOptions.src;
            steal().config().types.jsOld.require(jsOptions, jsSuccess, jsError);
        };


        if (!steal.config("isBuild")) {
            steal().config().types.jsOld = steal().config().types.js;
            steal.type("js", function (jsOptions, jsSuccess, jsError) {
                if (jsOptions && jsOptions.id && jsOptions.id.path) {
                    replaceGettextUnderscore.done(function () {
                        if (jsOptions.text === undefined) {
                            steal().config().types.text.require(jsOptions, function (text) {
                                replacePoInJs(jsOptions, text, jsSuccess, jsError);
                            }, jsError);
                        } else {
                            replacePoInJs(jsOptions, jsOptions.text, jsSuccess, jsError);
                        }
                    });
                } else {
                    if (jsOptions.text) {
                        jsOptions.text += "\n//@ sourceURL=" + jsOptions.src;
                    }
                    steal().config().types.jsOld.require(jsOptions, jsSuccess, jsError);
                }

            });
        }

        return can;
    });
