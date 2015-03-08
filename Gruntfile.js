"use strict";

var _ = require("lodash");

function registerSauceBrowsers(config, sauceBrowsers, configFile) {
    function capitalize(string) {
        if(!string.charAt) {
            return string;
        }

        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    var karma = config.karma;

    var tasks = [];

    for(var key in sauceBrowsers) {
        if(sauceBrowsers.hasOwnProperty(key)) {
            var parts = key.toLowerCase().split("_");
            var name = _.reduce(parts, function(result, part) {
                return result + capitalize(part);
            }, "sauce");

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
                    browsers: ["Chrome"],
                    singleRun: true
                }
            }
        },
        "sauce_connect": {
           options: {
               username: process.env.SAUCE_USERNAME,
               accessKey: process.env.SAUCE_ACCESS_KEY,
               identifier: process.env.SAUCE_TUNNEL_ID,
               verbose: true
           },
           tunnel: {}
       }
    };

    var sauceBrowsers = {
        "CHROME_LATEST_1": ["SL_CHROME_LATEST_OSX", "SL_CHROME_LATEST_WINDOWS"],
        "CHROME_LATEST_2": ["SL_CHROME_LATEST_LINUX"],
        "FIREFOX_LATEST_1": ["SL_FIREFOX_LATEST_OSX", "SL_FIREFOX_LATEST_WINDOWS"],
        "FIREFOX_LATEST_2": ["SL_FIREFOX_LATEST_LINUX"],
        "SAFARI_LATEST": ["SL_SAFARI_LATEST_OSX", "SL_SAFARI_LATEST_WINDOWS"],
        "OPERA_LATEST": ["SL_OPERA_LATEST_WINDOWS", "SL_OPERA_LATEST_LINUX"],
        "IE_LATEST": ["SL_IE_LATEST_WINDOWS"]
    };

    var sauceBrowserTasks = registerSauceBrowsers(config, sauceBrowsers, "karma.sauce.conf.js");

    grunt.initConfig(config);

    grunt.registerTask("sauceConnect:start", ["checkSauceConnectEnv", "sauce_connect"]);
    grunt.registerTask("sauceConnect:stop", ["sauce-connect-close"]);

    grunt.registerTask("build:dev", ["browserify:dev"]);
    grunt.registerTask("build:dist", ["browserify:dist"]);

    grunt.registerTask("build", ["build:dev"]);
    grunt.registerTask("dist", ["build:dist", "uglify:dist", "usebanner:dist"]);

    grunt.registerTask("test:style", ["jshint"]);
    grunt.registerTask("test:sauce", ["build"].concat(sauceBrowserTasks));
    grunt.registerTask("test", ["test:style", "build:dev", "karma:local"]);

    grunt.registerTask("default", ["test"]);

    grunt.registerTask("checkSauceConnectEnv", "Checks so all env variables are set for sauce connect.", function() {
        if(!process.env.SAUCE_USERNAME) {
            grunt.log.error("env SAUCE_USERNAME needs to be set.");
            return false;
        }

        if(!process.env.SAUCE_ACCESS_KEY) {
            grunt.log.error("env SAUCE_ACCESS_KEY needs to be set.");
            return false;
        }

        if(!process.env.SAUCE_TUNNEL_ID) {
            grunt.log.writeln("env SAUCE_TUNNEL_ID needs to be set.");
            return false;
        }
    });
};
