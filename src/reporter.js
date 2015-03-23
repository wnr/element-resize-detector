"use strict";

/* global console: false */

/**
 * Reporter that handles the reporting of logs, warnings and errors.
 * @public
 * @param {boolean} quiet Tells if the reporter should be quiet or not.
 */
module.exports = function(quiet) {
    var noop = function () {
        //Does nothing.
    };

    var reporter = {
        log: noop,
        warn: noop,
        error: noop
    };

    if(!quiet && window.console) {
        reporter.log = console.log;
        reporter.warn = console.warn;
        reporter.error = console.error;
    }

    return reporter;
};