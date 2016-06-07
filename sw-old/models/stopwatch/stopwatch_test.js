steal('unit')
    .then("sw/fixture/fixtures.js")
    .then( "sw/models/stopwatch", function() {
        "use strict";
        
        module("Sw.Models.Stopwatch", {
            setup: function () {
            }
        });

        test("Stopwatch validity test", function () {
            // TODO: implement testacse for Sw.Model.Stopwatch
            ok(false, "no testcase")
        });
});
