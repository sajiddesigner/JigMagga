steal('core/model', function () {

    /**
     * @class stopwatch
     * @parent core/model
     * @inherits can.Model
     * Wraps sw backend services.
     */
    can.Model.extend("Sw.Models.Stopwatch",
        /* @Static */
        {

        },
        /* @Prototype */
        {
            init: function () {
                console.log("model - init");
                this.attr("counter", 0);
                this.store();
            },
            start: function (){
                var self = this;
                self.startTime = Date.now();
                self.interval = setInterval(function(){self.update();}, self.refreshInterval);

            },
            update: function (){
                console.log("model - update");
            },
            reset: function () {
                console.log("model - reset");
            },
            lap: function () {
                console.log("model - lap");
            }
        });

});
