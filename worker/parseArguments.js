'use strict';

var program = require('commander');
var _ = require('lodash');
var args = null;

/**
 * @name WorkerArguments
 * @type {object}
 * @property {string} values
 * @property {string} verbose
 * @property {string} versionnumber
 * @property {boolean} queue
 * @property {boolean} errorqueue
 * @property {boolean} errorerrorqueue
 * @property {boolean} staticold
 * @property {string} basedomain
 * @property {string} page
 * @property {string} childpage
 * @property {boolean} live
 * @property {boolean} liveuncached
 * @property {string} deployuncached
 * @property {string} url
 * @property {boolean} highprio
 * @property {boolean} mediumprio
 * @property {boolean} lowprio
 * @property {string} postfix
 * @property {string} locale
 * @property {string} namespace
 * @property {boolean} fixtures
 * @property {boolean} write
 * @property {string} bucket
 * @property {number} prefetch
 * @property {boolean} longjohn
 * @property {string} tag
 */


/**
 * returns parsed worker arguments from
 * @param {object} processArgs
 * @return {WorkerArguments}
 */
module.exports = function (processArgs) {

    if (args) {
        return args;
    }
    var env = process.env;

    args = program
        .option('-j, --values [values]', 'specify values as JSON', env.NODE_WORKER_VALUES)
        .option('-v, --verbose', 'whether to print to output all log information')
        .option('-b, --versionnumber [value]', 'specify build version as float', env.NODE_WORKER_VERSION_NUMBER)
        .option('-q, --queue', 'start program to listen on queue')
        .option('-e, --errorqueue', 'use error queue')
        .option('-E, --errorerrorqueue', 'use errorerror queue')
        .option('-y, --staticold', 'generate all old static pages (sem)')
        .option('-d, --basedomain [value]', 'specify the domain', env.NODE_WORKER_BASE_DOMAIN)
        .option('-p, --page [value]', 'define the template to be generated', env.NODE_WORKER_PAGE)
        .option('-k, --childpage [value]', 'define a child page that should overwrite the parent element', env.NODE_WORKER_CHILD_PAGE)
        .option('-x, --live', 'use live db and queue - normally staging is used')
        .option('-X, --liveuncached', 'use live db and uncache queue')
        .option('-D, --deployuncached [value]', 'send uncache messages to the deploy queue', env.NODE_WORKER_DEPLOY_UNCACHED)
        .option('-u, --url [value]', 'define the url to be generated', env.NODE_WORKER_URL)
        .option('-H, --highprio', 'use the high priority queue')
        .option('-M, --mediumprio', 'use the high priority queue')
        .option('-L, --lowprio', 'use the high priority queue')
        .option('-V, --postfix', 'use this version postfix queue')
        .option('-I, --locale <n>', 'use given locale', env.NODE_WORKER_LOCALE)
        .option('-n, --namespace <n>', 'relative path from current dir to target project or just nane of project', env.NODE_WORKER_NAMESPACE)
        .option('-f, --fixtures', 'use fixtures from project folder instead of making an api call')
        .option('-w, --write', 'write to disk the archive with generated files instead of upload them, path should be provided')
        .option('-B, --bucket [value]', 'will override the config bucket and upload to this bucket you parse as value', env.NODE_WORKER_BUCKET)
        .option('-P, --prefetch <n>', 'amount of prefetched messages from queue, makes sens only wirh -q', Number, Number(env.NODE_WORKER_PREFETCH) || 50)
        .option('--longjohn', 'enable longjohn module for stack traces')
        .option('--tag [value]', 'allows to filter logs from current worker', env.NODE_WORKER_TAG)
        .parse(processArgs);


    args = _.merge({}, args, {
        verbose: env.NODE_WORKER_VERBOSE,
        errorqueue: env.NODE_WORKER_ERROR,
        errorerrorqueue: env.NODE_WORKER_ERROR_ERROR,
        live: env.NODE_WORKER_LIVE,
        liveuncached: env.NODE_WORKER_LIVE_UNCACHED,
        highprio: env.NODE_WORKER_HIGHPRIO,
        mediumprio: env.NODE_WORKER_MEDIUMPRIO,
        lowprio: env.NODE_WORKER_LOWPRIO,
        postfix: env.NODE_WORKER_POSTFIX,
        fixtures: env.NODE_WORKER_FIXTURES,
        write: env.NODE_WORKER_WRITE,
        longjohn: env.NODE_WORKER_LONGJOHN,
        queue: env.NODE_WORKER_QUEUE
    });


    return args;
};
