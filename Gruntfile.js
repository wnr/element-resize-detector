/* global process:false */

"use strict";

var _ = require("lodash");
var sauceConnectLauncher = require("sauce-connect-launcher");

function registerSauceBrowsers(config, sauceBrowsers, configFile) {
    function capitalize(string) {
        if(!string.charAt) {
            return string;
        }

        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    var karma = config.karma;

    var tasks = [];

    var formatName = function(result, part) {
        return result + capitalize(part);
    };

    for(var key in sauceBrowsers) {
        if(sauceBrowsers.hasOwnProperty(key)) {
            var parts = key.toLowerCase().split("_");
            var name = _.reduce(parts, formatName, "sauce");

            var configObject = {
                configFile: configFile,
                options: {
                    browsers: sauceBrowsers[key]
                }
            };

            karma[name] = configObject;

            tasks.push("karma:" + name);
        }
    }

    return tasks;
}

module.exports = function(grunt) {
    require("load-grunt-tasks")(grunt);

    var config = {
        pkg: grunt.file.readJSON("package.json"),
        banner: "/*!\n" +
                " * element-resize-detector <%= pkg.version %> (<%= grunt.template.today('yyyy-mm-dd, HH:MM') %>)\n" +
                " * <%= pkg.homepage %>\n" +
                " * Licensed under <%= pkg.license %>\n" +
                " */\n",
        jshint: {
            src: {
                src: ["src/**/*.js", "*.js"]
            },
            test: {
                src: "test/**/*.js"
            },
            options: {
                jshintrc: true
            }
        },
        browserify: {
            dev: {
                src: ["src/element-resize-detector.js"],
                dest: "build/element-resize-detector.js",
                options: {
                    browserifyOptions: {
                        standalone: "elementResizeDetectorMaker",
                        debug: true
                    }
                }
            },
            dist: {
                src: ["src/element-resize-detector.js"],
                dest: "dist/element-resize-detector.js",
                options: {
                    browserifyOptions: {
                        standalone: "elementResizeDetectorMaker"
                    }
                }
            }
        },
        usebanner: {
            dist: {
                options: {
                    position: "top",
                    banner: "<%= banner %>"
                },
                files: {
                    src: "dist/**/*"
                }
            }
        },
        uglify: {
            dist: {
                files: {
                    "dist/element-resize-detector.min.js": "dist/element-resize-detector.js"
                }
            }
        },
        karma: {
            local: {
                configFile: "karma.conf.js",
                options: {
                    browsers: ["Chrome", "Safari", "Firefox"],
                    singleRun: true
                }
            }
        },
        "sauce_connect": {
           options: {
               username: process.env.SAUCE_USERNAME,
               accessKey: process.env.SAUCE_ACCESS_KEY,
               verbose: true
           },
           tunnel: {}
       }
    };

    var sauceBrowsers = {
        "CHROME_LATEST_1": ["SL_CHROME_LATEST_OSX", "SL_CHROME_LATEST_WINDOWS"],
        //"CHROME_LATEST_2": ["SL_CHROME_LATEST_LINUX"],
        "FIREFOX_LATEST_1": ["SL_FIREFOX_LATEST_OSX", "SL_FIREFOX_LATEST_WINDOWS"],
        //"FIREFOX_LATEST_2": ["SL_FIREFOX_LATEST_LINUX"],
        "SAFARI_LATEST": ["SL_SAFARI_LATEST_OSX", "SL_SAFARI_LATEST_WINDOWS"],
        "OPERA_LATEST": ["SL_OPERA_LATEST_WINDOWS", "SL_OPERA_LATEST_LINUX"],
        "IE_LATEST": ["SL_IE_LATEST_WINDOWS"],
        "IE_10": ["SL_IE_10_WINDOWS"],
        "IE_9": ["SL_IE_9_WINDOWS"],
        "IE_8": ["SL_IE_8_WINDOWS"],
        "IOS_LATEST": ["SL_IOS_LATEST_IPHONE", "SL_IOS_LATEST_IPAD"],
        "IOS_7": ["SL_IOS_7_IPHONE", "SL_IOS_7_IPAD"]
    };

    var sauceBrowserTasks = registerSauceBrowsers(config, sauceBrowsers, "karma.sauce.conf.js");

    grunt.initConfig(config);

    grunt.registerTask("build:dev", ["browserify:dev"]);
    grunt.registerTask("build:dist", ["browserify:dist"]);

    grunt.registerTask("build", ["build:dev"]);
    grunt.registerTask("dist", ["build:dist", "uglify:dist", "usebanner:dist"]);

    grunt.registerTask("test:style", ["jshint"]);
    grunt.registerTask("test:sauce", ["build"].concat(sauceBrowserTasks));
    grunt.registerTask("test", ["test:style", "build:dev", "karma:local"]);

    grunt.registerTask("ci", ["test:style", "sauceConnectTunnel", "test:sauce"]);

    grunt.registerTask("default", ["test"]);

    var sauceConnectTunnel = {};

    grunt.registerTask("sauceConnectTunnel", "Starts a sauce connect tunnel", function(keepAlive) {
        if(!process.env.SAUCE_USERNAME) {
            grunt.log.error("env SAUCE_USERNAME needs to be set.");
            return false;
        }

        if(!process.env.SAUCE_ACCESS_KEY) {
            grunt.log.error("env SAUCE_ACCESS_KEY needs to be set.");
            return false;
        }

        var done = this.async();

        sauceConnectLauncher({
            username: process.env.SAUCE_USERNAME,
            accessKey: process.env.SAUCE_ACCESS_KEY,
            logger: grunt.log.writeln,
            verbose: true,
            logfile: "sauce-connect.log"
        }, function (err, sauceConnectProcess) {
            function stop() {
                grunt.log.writeln("Stopping...");
                sauceConnectTunnel.process.close(function() {
                    grunt.log.writeln("Closed Sauce Connect process");
                    done();
                });
            }

            if (err) {
                grunt.log.error(err.message);
                done(false);
            }

            sauceConnectTunnel.process = sauceConnectProcess;

            grunt.log.success("Sauce Connect ready!");

            if(keepAlive) {
                grunt.log.writeln("The tunnel will be kept alive. Stop it by terminating this process with SIGINT (Ctrl-C).");

                process.on("SIGINT", function() {
                    grunt.log.writeln();
                    stop();
                });
            } else {
                grunt.log.writeln("Closing tunnel since the :keepAlive argument is not present...");
                done();
            }
        });
    });
};
