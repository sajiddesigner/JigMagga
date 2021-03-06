var msieOld = typeof window !== "undefined" && window.navigator ? new RegExp("MSIE [789].0").test(navigator.userAgent) : false;
steal.config({
    jmENV : "development",
    map: {
        "*": {
            "jquery/jquery.js": (steal.config("browser") && steal.config("browser").msie && steal.config("browser").version < 10) || msieOld ? "bower_components/jquery-old/dist/jquery.min.js" :  "bower_components/jquery-new/dist/jquery.min.js",
            "jquery/jstorage": "bower_components/jstorage",
            "funcunit" : "bower_components/funcunit/dist/"
        }
    },
    paths: {
        "jquery/": "bower_components/jquerypp/",
        "jquerypp/": "bower_components/jquerypp/",
        "can/": "bower_components/canjs/steal/canjs/",
        "qunit/": "bower_components/qunit/qunit/",
        "qunit-tap/": "bower_components/qunit-tap/lib/"
    },
    shim: {
        jquery: {
            exports: "jQuery"
        },
        "qunit": {
            deps: ["jquery", "qunit/qunit.css"]
        },
        "jquery/jstorage": {
            deps: ["jquery"]
        },
        "funcunit": {
            deps: ["qunit"]
        },
        "lib/legacy.js" : {
            deps: ["jquery"]
        },
        "can/util/fixture/fixture.js" : {
            ignore : true
        },
        "steal-types/conf/conf.js" : {
            ignore : true
        },
        "steal-types/sass/sass.js" : {
            ignore : true
        },
        "steal-types/less/less.js" : {
            ignore : true
        },
        "steal-types/po/po.js" : {
            ignore : true
        }
    },
    ext: {
        scss: "steal-types/sass/sass.js",
        less: "steal-types/less/less.js",
        ejs: "can/view/ejs/ejs.js",
        mustache: "can/view/mustache/mustache.js",
        coffee: "steal/coffee/coffee.js",
        conf: "steal-types/conf/conf.js",
        po: "steal-types/po/po.js",
        json: "steal-types/json/json.js"
    }
});
