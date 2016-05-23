'use strict';

/**
 * Created by toni meuschke on 7/28/14.
 *
 *
 * example usage:
 *
 *  $ node build/index.js -p ".*" -d "lieferando.de" -n yd -v "2.7"
 *
 *
 *  -n is your project namespace eg. yd
 *  -v is the version number that will be used for the files when you do not specify this version it will create a file withoute like -> production-de_DE.js
 *
 */

var es = require('event-stream'),
    configMerger = require('./lib/configMerger.js'),
    helper = require('./lib/helper.js'),
    media = require('./lib/media'),
    steal = require('./lib/steal.js'),
    builder = require('./lib/builder.js'),
    program = require('commander'),
    fs = require('fs');

// TODO deprecated since webpack? remove entire build folder
program
    .version('1.0.1')
    .option('-v, --versionnumber [value]', 'specify build version as float')
    .option('-d, --basedomain [value]', 'specify the domain')
    .option('-p, --page [value]', 'define the template to be generated can be a regex')
    //TODO override locales from config
    //.option('-I, --locale [value]', 'use given locale')
    .option('-c, --cssgenerate [value]', 'generate only css', JSON.parse)
    .option('-j, --jsgenerate [value]', 'generate only js', JSON.parse)
    .option('-n, --namespace [value]', 'the namespace of your project')
    .option('-b, --basePath [value]', 'the basepath to your page directory')
    .option('-m, --minify [value]', 'minify css and js Default true', JSON.parse)
    .option('-u, --upload', 'if upload is not enabled it will save files to disk')
    .option('-x, --live [value]', 'will generate for live environment',  JSON.parse)
    .option('-B, --bucket [value]', 'will override the config bucket and upload to this bucket you parse as value')
    .option('-M, --uploadmedia [value]', 'Upload media files. Should not be used with css or js generate flags')
    .parse(process.argv);



if (program.uploadmedia) {
    var ps = es.pause();
    helper.createStreamWithSettings(program)
        .pipe(media.getMediaSources())
        .pipe(media.extractFilePaths())
        .pipe(ps)
        .pipe(media.upload(ps));
}

/**
 * Default Task without stream
 */

else  {

    helper.createStreamWithSettings(program)
        .pipe(configMerger.getConfig())
        .pipe(configMerger.getPagesThatMatchThePageParam())
        .pipe(configMerger.getAllMergedConfigsFromPages())
        .pipe(steal.getJSAndHTMLFilePath())
        .pipe(helper.splitPagesIntoSingleStreams())
        .pipe(helper.duplicatePagesForLocalesAndBrowsers())
        .pipe(helper.bufferAllPagesAndWaitingForDoneEvent())
        .pipe(steal.openPageAndGrepDependencies())
        .pipe(builder.view.compile())
        .pipe(steal.setCurrentSCSSVariables())
        .pipe(builder.css.compileSCSS())
        .pipe(builder.js.clean())
        .pipe(builder.js.translate())
        .pipe(builder.js.minify())
        .pipe(builder.css.minify())
        .pipe(builder.makePackage())
        .pipe(helper.triggerDonePageEvent())
        .pipe(helper.saveFileToDiskOrUpload())
        .on('error', function(err) {
            console.error("ERROR: ", err);
            process.exit(1);
        });

}


process.on('uncaughtException', function (err) {
    process.stdout.write('error :' + err + err.stack);
    process.kill();
});
