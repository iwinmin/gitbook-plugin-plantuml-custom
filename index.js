var mkdirp = require('mkdirp');
var spawn = require('child_process').spawn;
var fs = require('fs');
var crypto = require('crypto');
var path = require('path');

function parseUml(page) {
    uml = page.content.match(/^```uml((.*\n)+?)?```$/igm);
    return uml && uml.toString();
}

function execFile(command, args, callback) {
    var prc = spawn(command, args);

    prc.on('error', err => {
        this.log.error.ln('cannot spawn java');
    });

    prc.stdout.on('data', function(data) {
        this.log.info.ln(data.toString());
    });

    prc.stderr.on('data', function(data) {
        console.log(data.toString());
    });

    prc.on('close', function(code) {
        if ("function" === typeof callback) callback(!!code);
    });
};

function getConfig(context, property, defaultValue) {
    var config = context.config ? /* 3.x */ context.config : /* 2.x */ context.book.config;
    return config.get('pluginsConfig.plantuml-custom.'+property, defaultValue);
}

module.exports = {
    hooks: {
        // For all the hooks, this represent the current generator

        // This is called before the book is generated
        "init": function() {
            this.log.info("init gitbook-plugin-plantuml-custom!");
        },

        // This is called after the book generation
        "finish": function() {
            this.log.info("finish gitbook-plugin-plantuml-custom!");
        },

        // Before parsing markdown
        "page:before": async function(page) {
            // page.path is the path to the file
            // page.content is a string with the file markdown content
            var uml_text = parseUml(page);
            if (!uml_text) { return page; }

            var outputType = (this.output && this.output.name) || (book.options && book.options.generator);

            var configType = getConfig(this, 'type', 'png');
            var configPath = getConfig(this, 'path', 'assets/images/uml/');
            var configCache = getConfig(this, 'cache', './_plantuml/');
            var jarFilePath = getConfig(this, 'jar', './plantuml.jar');

            // force output type set to png if output to ebook
            if (outputType === 'ebook') {
                configType = 'png';
            }

            var basePath = path.dirname(page.path);
            var baseName = path.basename(page.path).replace(/\.[^.]+$/, '');
            var outputPath = path.join(configCache, basePath) + '/';
            var umlPath = outputPath + baseName + '.uml';
            var sumPath = outputPath + baseName + '.' + configType + '.sha1';

            var relativePath = path.relative(basePath, configPath);

            this.log.info.ln('processing uml... %j', page.path);

            var lastsum = ''
            var sum = crypto.createHash('sha1').update(uml_text).digest('hex');

            try {
                lastsum = fs.readFileSync(sumPath);
            } catch (e) { }

            var isUpdateImageRequired = (lastsum != sum);

            if (!isUpdateImageRequired) {
                if (!fs.existsSync(outputPath + baseName + '.' + configType)) {
                    isUpdateImageRequired = true;
                }
            }

            //UML
            if (isUpdateImageRequired) {
                this.log.info.ln('generate new plantuml image..');
                mkdirp.sync(path.dirname(umlPath));
                fs.writeFileSync(umlPath, uml_text);
                fs.writeFileSync(sumPath, sum);

                try {
                    await new Promise(done => {
                        execFile.call(this, 'java', [
                            '-Dapple.awt.UIElement=true',
                            '-jar',
                            jarFilePath,
                            '-nbthread auto',
                            '-nometadata',
                            '-t' + configType,
                            umlPath,
                        ], done);
                    });
                } catch (e) {};
            }

            // replace markdown code
            var lines = uml_text.split('```,');
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (i < (lines.length-1)) {
                    line += '```';
                }

                var filename = '';
                if (i == 0) {
                    filename = `${baseName}.${configType}`;
                }
                else {
                    filename = `${baseName}_${('000' + i).slice(-3)}.${configType}`;
                }
                page.content = page.content.replace(line, `![](${path.join(relativePath, basePath, filename)})`);

                await this.output.copyFile(
                    outputPath + filename,
                    path.join(configPath, basePath, filename)
                );
            };
            return page;
        }
    }
};
