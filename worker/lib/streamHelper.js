'use strict';

var es = require('event-stream');
var hgl = require('highland');
var _ = require('lodash');


module.exports = {

    /**
     * create a duplex stream that obtain message and emit it to consumer
     * 
     * @return {Duplex}
     */
    duplex: function () {
        return es.through(
            function (data) {
                this.emit('data', data);
            },
            function () {
                this.emit('end');
            });
    },

    /**
     * returns stream that collect all messages in a buffer
     * and emit one accumulated message when the end event 
     * is fired 
     * 
     * @param  {Function} callback
     */
    accumulate: function (callback) {
        var buffers = [];

        return es.through(function write(data) {
            if (!Buffer.isBuffer(data)) {
                data = _.isString(data) ? data : JSON.stringify(data);
                data = new Buffer(data);
            }
            buffers.push(data);
        }, function end() {
            var result = Buffer.concat(buffers);
            buffers = [];
            var that = this;

            callback.call(that, null, result, function () {
                that.emit('end');
            });
        });
    },
    
    asyncThrough: function (fn, source) {
        source = source || hgl;

        return source.consume(function (err, data, push, next) {
            if (err) {
                // pass errors along the stream and consume next value
                push(err);
                next();
            }
            else if (data !== hgl.nil) {
                // pass nil (end event) along the stream
                //push(null, data);
                fn(data, push, next);
            }
        });
    },
    map: function (fn, source) {
        source = source ? hgl(source) : hgl;
        return source.flatMap(hgl.wrapCallback(fn));
    }
};