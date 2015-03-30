'use strict';

var Brod = require('brod-caster'),
    Protobuf = require('node-protobuf'),
    fs = require('fs');

var envelopeProto = new Protobuf(fs.readFileSync(__dirname + '/../messages/envelope.desc')),
    messagesProto = new Protobuf(fs.readFileSync(__dirname + '/../messages/page.desc'));

process.env.NODE_PROJECT_NAME = 'yd';

console.log(envelopeProto);

var brod = new Brod({
    "connectionString": "localhost:2181/",
    "zkOptions": {},
    "clientId": "html-worker",
    "topics": [{
        "topic": "service-broadcast"
    }],
    "origin": "html-worker",
    "adaptor": {
        "type": "protocolBuffer",
        "package": "com.takeaway.events.cdn.page",
        "envelope": envelopeProto,
        "messages": messagesProto
    }
});


brod.on('html-worker', 'new', function () {
    console.log(arguments);
})