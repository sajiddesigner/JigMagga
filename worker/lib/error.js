'use strict';
var inherits = require('util').inherits;

var WorkerError = function (message, originalMessage, messageKey) {
    this.name = 'WorkerError';  

    this.originalMessage = originalMessage;
    this.messageKey = messageKey;
    this.message = message;
    Error.call(this, message);
};

inherits(WorkerError, Error);

exports.WorkerError = WorkerError;

/**
 * Handle errors
 * @param  {[type]}   log      [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
exports.getErrorHandler = function (log, callback) {
    return function (err) {

        if (!(err instanceof WorkerError)) {
            log('error', 'Fatal error. process will be terminated %s, %s', err.message, err.stack, {uncaughtException: true});
            return process.kill();
        }
        callback(err);
    };
};