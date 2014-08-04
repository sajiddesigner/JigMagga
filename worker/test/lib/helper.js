/*global describe, it, beforeEach, afterEach, before, after: true*/

'use strict';

var es = require('event-stream');
var expect = require('chai').expect;
var sinon = require('sinon');
var helper = require('../../lib/helper');

var konphyg = require('konphyg')(__dirname + '/../../config');

var baseConfig = konphyg.all();

describe('helper', function () {


    describe('#getQueNames', function () {
        var config;

        beforeEach(function () {
            config = {
                basedomain: 'foo'
            };
        });

        it('should provide correct names if priority is high', function () {
            config.highprio = true;

            var high = helper.getQueNames(config, baseConfig.amqp);
            expect(high.amqpQueue).to.be.eql('pages.generate.foo.high');
            expect(high.amqpErrorQueue).to.be.eql('pages.generate.foo.error.high');
        });

        it('should provide correct names if priority is medium', function () {
            config.mediumprio = true;

            var medium = helper.getQueNames(config, baseConfig.amqp);
            expect(medium.amqpQueue).to.be.eql('pages.generate.foo.medium');
            expect(medium.amqpErrorQueue).to.be.eql('pages.generate.foo.error.medium');
        });

        it('should provide correct names if priority is low', function () {
            config.lowprio = true;

            var low = helper.getQueNames(config, baseConfig.amqp);
            expect(low.amqpQueue).to.be.eql('pages.generate.foo.low');
            expect(low.amqpErrorQueue).to.be.eql('pages.generate.foo.error.low');
        });

        it('should provide correct names if the priority is not set', function () {
            var deploy = helper.getQueNames(config, baseConfig.amqp);
            expect(deploy.amqpQueue).to.be.eql('pages.generate.foo.deploy');
            expect(deploy.amqpErrorQueue).to.be.eql('pages.generate.foo.error.deploy');
        });

        it('should provide correct names with postfix if it set', function () {
            config.postfix = 'bar';
            var deploy = helper.getQueNames(config, baseConfig.amqp);
            expect(deploy.amqpQueue).to.be.eql('pages.generate.foo.deploy.bar');
            expect(deploy.amqpErrorQueue).to.be.eql('pages.generate.foo.error.deploy');
        });
    });



    describe('#createSubProcess', function () {
        var child;
        before(function () {
            child = helper.createSubProcess(__dirname + '/../../testData/simpleProcess.js');
        });

        after(function () {
            child.kill();
        });

        it('should create a process with ipc', function (done) {
            expect(child.send).to.be.a('function');
            expect(child.on).to.be.a('function');
            var message = {msg: 'message'};
            child.on('message', function (data) {
                expect(data).to.eql(message);
                done();
            });

            child.send(message);
        });

        it('should create a process with pipe', function () {
            expect(child.stdio[3]).to.be.an('object');
            expect(child.stdio[3].on).to.be.a('function');
        });

        it('should create a process in async way', function (done) {
            helper.createSubProcess(__dirname + '/../../testData/asyncProcess.js', function (err, child) {
                expect(err).to.eql(null);
                expect(child.send).to.be.a('function');
                expect(child.on).to.be.a('function');
                child.kill();
                done();
            });
        });

        it('should send an error if process will not send a message in 500 msec', function (done) {
            var clock = sinon.useFakeTimers();
            helper.createSubProcess(__dirname + '/../../testData/asyncProcess.js', function (err) {
                expect(err).to.be.a('string');
                expect(err).to.eql('child process did not send a ready message');
                clock.restore();
                done();
            });
            clock.tick(600);

        });

    });
});
