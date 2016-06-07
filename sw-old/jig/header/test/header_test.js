steal('test', function () {
    "use strict";

    module("Sw.Jig.Header", {
        setup: function () {
            F.open("/sw/jig/header/test/header.html", function(){
                stop()
                F.win.steal.config("domain", "default");
                F.win.steal("sw/jig/header/test/header.conf", function(){
                start();
                });
            });
        }
    });

    test("visible Test", function () {
        //TODO implement testacse for Sw.Jig.Header
        ok(false, "no testcase")
    });
});
