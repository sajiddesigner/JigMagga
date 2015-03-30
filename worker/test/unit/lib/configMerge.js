/*global describe, it, before, beforeEach: true*/

'use strict';

var expect = require('chai').expect;
var hgl = require('highland');
var format = require('util').format;
var sinon = require('sinon');
var rewire = require('rewire');

var WorkerError = require('../../../lib/error').WorkerError;

var message = require('../../../testData/message.json'); 

var configMerge =rewire('../../../lib/configMerge');

describe('configMerge', function () {
    describe('onEnoent', function () {
        var onEnoent;
        var domainName = 'dziurawy-kociol-krakow.pl';
        var pageNameTpl = '/dsad/asdad/%s/%s.conf';

        beforeEach(function () {
            onEnoent = configMerge.__get__('onEnoent');
        });

        it('should get config from mongo db if page is domain config', function (done) {
            var pageName = format(pageNameTpl, domainName, domainName);

            onEnoent(pageName, function (err, config) {
                expect(err).to.eql(null);
                expect(config).to.be.an('object').and.include.keys('satelliteOptions', 'sass', 'jigs');
                done();
            });
        });


    });

    describe('#getConfigStream', function () {
        var configMergeStub = {};
        var basePath = '/foo/bat/qaz';

        var data;
        var config = {foo: 1};

        beforeEach(function () {
            data = {
                message: message,
                basePath: basePath
            };
            configMergeStub.getPageConfig = sinon.stub();

            configMerge.__set__('configMerge', configMergeStub);
        });

        it('should create config if there is no isPageConfigLoaded flag and set this flag is there is page property in message', function (done) {
            configMergeStub.getPageConfig.callsArgWithAsync(4, null, config);

            var stream = hgl();
            var through = hgl.pipeline(configMerge.getConfigStream());

            stream.pipe(through).on('data', function (res) {
                expect(res).to.include.keys('message', 'config', 'isPageConfigLoaded', 'basePath');
                expect(configMergeStub.getPageConfig.called).to.eql(true);
                var getPageConfig = configMergeStub.getPageConfig.getCall(0);

                expect(getPageConfig.args).to.contain(basePath + '/page', message.basedomain, message.page);
                done();
            });

            stream.write(data);
        });

        it('should not call getPageConfig if page config already loaded', function (done) {
            data.isPageConfigLoaded = true;
            var stream = hgl();
            var through = hgl.pipeline(configMerge.getConfigStream());
            
            stream.pipe(through).on('data', function (res) {
                expect(res).to.include.keys('message', 'isPageConfigLoaded', 'basePath');
                expect(configMergeStub.getPageConfig.called).to.eql(false);
                done();
            });

            stream.write(data);
        });

        it('should should emit err message with WorkerError if error in getPageConfig happened', function (done) {
            configMergeStub.getPageConfig.callsArgWithAsync(4, 'some error');

            configMerge.__set__('configMerge', configMergeStub);

            var stream = hgl();
            var through = hgl.pipeline(configMerge.getConfigStream());
            stream.pipe(through)
                .on('data', function (res) {
                    console.log(res);
                })
                .on('error', function (err) {
                    expect(err).to.be.an.instanceOf(WorkerError);
                    expect(err.originalMessage).to.eql(message);
                    done();
                });

            stream.write(data);
        });
    });
});