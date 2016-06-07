steal('core/control',
    'sw/media/css/sw-core.scss'
).then(
    './css/header.scss',
    function () {
    "use strict";

    /**
     * @class header
     */
    can.Control.extend('Sw.Jig.Header',
    /** @Static */
        {
            defaults : {
                template: "//sw/jig/header/views/init.mustache",
                message: "test message"
            }
        },
        /** @Prototype */
        {
            init : function () {
                var self = this;
                self.element.html(can.view(self.options.template, self.options));
            }
        });
});
