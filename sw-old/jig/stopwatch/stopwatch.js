steal('core/control',
    'can/view/bindings', // ?
    'can/map/delegate', // ?
    'sw/media/css/sw-core.scss',
    'sw/models/stopwatch'
).then(
    './css/stopwatch.scss',
    function () {
        "use strict";

        /**
              * @class stopwatch
              */
        can.Control.extend('Sw.Jig.Stopwatch',
            /** @Static */
            {
                defaults: {
                    template: "//sw/jig/stopwatch/views/init.mustache",
                    message: "test message"
                }
            },
            /** @Prototype */
            {
                init: function () {
                    var self = this;

                    console.log("controller - init");

                    Sw.Models.Stopwatch.getCurrent(function (stopwatch) {
                        self.options.stopwatch = stopwatch;
                        self.element.html(can.view(self.options.template, {
                            stopwatch: self.options.stopwatch
                        }));
                    });
                   // this.element.find(".sw-jig-stopwatch-watch-stop").addClass( self.interval);
                },
                ".sw-jig-stopwatch-watch-start click": function(){
                    console.log("controller -start");
                    this.options.stopwatch.start();
                },
                ".sw-jig-stopwatch-watch-stop click": function(){
                    Sw.Models.Stopwatch.reset;
                    console.log("controller -stop");
                },
                ".sw-jig-stopwatch-watch-reset click": function(){
                    Sw.Models.Stopwatch.reset;

                    console.log("controller -reset");
                }
            });
    });
