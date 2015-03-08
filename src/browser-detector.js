"use strict";

var detector = module.exports = {};

detector.isIE = function() {
    var agent = navigator.userAgent.toLowerCase();
    return agent.indexOf("msie") !== -1 || agent.indexOf("trident") !== -1;
};
