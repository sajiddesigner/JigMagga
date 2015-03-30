'use strict';
var HttpHealthCheck = require('http-health-endpoint');


module.exports = function (config) {
    var healthCheckFn = function(cb) {
        process.nextTick(cb.bind(null, null, {
            ok: true,
            no: 'problems to report'
        }));
    };

    var health = new HttpHealthCheck(
        {port: config.port},
        healthCheckFn
    );

    health.createServer();
};

