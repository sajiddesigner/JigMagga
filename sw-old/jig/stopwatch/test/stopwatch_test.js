steal('test', function () {
    "use strict";

    module("Sw.Jig.Stopwatch", {
        setup: function () {
            F.open("/sw/jig/stopwatch/test/stopwatch.html", function(){
                stop()
                F.win.steal.config("domain", "default");
                F.win.steal("sw/jig/stopwatch/test/stopwatch.conf", function(){
                start();
                });
            });
        }
    });

    test("visible Test", function () {
        //TODO implement testacse for Sw.Jig.Stopwatch
        ok(false, "no testcase")
    });
});
