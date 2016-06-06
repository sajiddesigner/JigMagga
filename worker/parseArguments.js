'use strict';

var program = require('commander');

var args = null;

module.exports = function (processArgs) {

    if (args) {
        return args;
    }

    args = program
        .option('-j, --values [values]', 'specify values as JSON')
        .option('-v, --verbose', 'whether to print to output all log information')
        .option('-b, --versionnumber [value]', 'specify build version as float')
        .option('-q, --queue', 'start program to listen on queue')
        .option('-e, --errorqueue', 'use error queue')
        .option('-E, --errorerrorqueue', 'use errorerror queue')
        .option('-y, --staticold', 'generate all old static pages (sem)')
        .option('-d, --basedomain [value]', 'specify the domain')
        .option('-p, --page [value]', 'define the template to be generated')
        .option('-k, --childpage [value]', 'define a child page that should overwrite the parent element')
        .option('-x, --live', 'use live db and queue - normally staging is used')
        .option('-X, --liveuncached', 'use live db and uncache queue')
        .option('-D, --deployuncached [value]', 'send uncache messages to the deploy queue')
        .option('-u, --url [value]', 'define the url to be generated')
        .option('-H, --highprio', 'use the high priority queue')
        .option('-M, --mediumprio', 'use the high priority queue')
        .option('-L, --lowprio', 'use the high priority queue')
        .option('-V, --postfix', 'use this version postfix queue')
        .option('-I, --locale <n>', 'use given locale')
        .option('-n, --namespace <n>', 'relative path from current dir to target project or just nane of project')
        .option('-f, --fixtures', 'use fixtures from project folder instead of making an api call')
        .option('-w, --write', 'write to disk the archive with generated files instead of upload them, path should be provided')
        .option('-B, --bucket [value]', 'will override the config bucket and upload to this bucket you parse as value')
        .option('-P, --prefetch <n>', 'amount of prefetched messages from queue, makes sens only wirh -q', Number)
        .option('--longjohn', 'enable longjohn module for stack traces')
        .option('--tag [value]', 'allows to filter logs from current worker')
        .option('--clean', 'Removes yd/build directory before starting')
        .parse(processArgs);

    return args;
};
