/**
 * Resize detection strategy that injects divs to elements in order to detect resize events on scroll events.
 * Heavily inspired by: https://github.com/marcj/css-element-queries/blob/master/src/ResizeSensor.js
 */

"use strict";

var forEach = require("../collection-utils").forEach;
var browserDetector = require("../browser-detector");

module.exports = function(options) {
    options             = options || {};
    var idHandler       = options.idHandler;
    var reporter        = options.reporter;
    var batchUpdater    = options.batchUpdater;

    if(!idHandler) {
        throw new Error("Missing required dependency: idHandler.");
    }

    if(!reporter) {
        throw new Error("Missing required dependency: reporter.");
    }

    /**
     * Adds a resize event listener to the element.
     * @public
     * @param {element} element The element that should have the listener added.
     * @param {function} listener The listener callback to be called for each resize event of the element. The element will be given as a parameter to the listener callback.
     */
    function addListener(element, listener) {
        var expand = element.resizeSensor.childNodes[0];
        var expandChild = expand.childNodes[0];
        var shrink = element.resizeSensor.childNodes[1];
        var shrinkChild = shrink.childNodes[0];

        var lastWidth, lastHeight;

        var reset = function() {
            expandChild.style.width = expand.offsetWidth + 10 + 'px';
            expandChild.style.height = expand.offsetHeight + 10 + 'px';
            expand.scrollLeft = expand.scrollWidth;
            expand.scrollTop = expand.scrollHeight;
            shrink.scrollLeft = shrink.scrollWidth;
            shrink.scrollTop = shrink.scrollHeight;
            lastWidth = element.offsetWidth;
            lastHeight = element.offsetHeight;
        };

        reset();

        var changed = function() {
            listener(element);
        };

        var addEvent = function(el, name, cb) {
            if (el.attachEvent) {
                el.attachEvent('on' + name, cb);
            } else {
                el.addEventListener(name, cb);
            }
        };

        addEvent(expand, 'scroll', function() {
            if (element.offsetWidth > lastWidth || element.offsetHeight > lastHeight) {
                changed();
            }
            reset();
        });

        addEvent(shrink, 'scroll',function() {
            if (element.offsetWidth < lastWidth || element.offsetHeight < lastHeight) {
                changed();
            }
            reset();
        });
    }

    /**
     * Makes an element detectable and ready to be listened for resize events. Will call the callback when the element is ready to be listened for resize changes.
     * @private
     * @param {element} element The element to make detectable
     * @param {function} callback The callback to be called when the element is ready to be listened for resize changes. Will be called with the element as first parameter.
     */
    function makeDetectable(element, callback) {
        element.resizeSensor = document.createElement('div');
        element.resizeSensor.className = 'resize-sensor';
        var style = 'position: absolute; left: 0; top: 0; right: 0; bottom: 0; overflow: scroll; z-index: -1; visibility: hidden;';
        var styleChild = 'position: absolute; left: 0; top: 0;';

        element.resizeSensor.style.cssText = style;
        element.resizeSensor.innerHTML =
            '<div class="resize-sensor-expand" style="' + style + '">' +
                '<div style="' + styleChild + '"></div>' +
            '</div>' +
            '<div class="resize-sensor-shrink" style="' + style + '">' +
                '<div style="' + styleChild + ' width: 200%; height: 200%"></div>' +
            '</div>';
        element.appendChild(element.resizeSensor);

        var position = getComputedStyle(element).position;

        function mutateDom() {
            if(position === "static") {
                element.style.position = 'relative';

                var removeRelativeStyles = function(reporter, element, style, property) {
                    function getNumericalValue(value) {
                        return value.replace(/[^-\d\.]/g, "");
                    }

                    var value = style[property];

                    if(value !== "auto" && getNumericalValue(value) !== "0") {
                        reporter.warn("An element that is positioned static has style." + property + "=" + value + " which is ignored due to the static positioning. The element will need to be positioned relative, so the style." + property + " will be set to 0. Element: ", element);
                        element.style[property] = 0;
                    }
                };

                //Check so that there are no accidental styles that will make the element styled differently now that is is relative.
                //If there are any, set them to 0 (this should be okay with the user since the style properties did nothing before [since the element was positioned static] anyway).
                removeRelativeStyles(reporter, element, style, "top");
                removeRelativeStyles(reporter, element, style, "right");
                removeRelativeStyles(reporter, element, style, "bottom");
                removeRelativeStyles(reporter, element, style, "left");
            }
        }

        mutateDom();


        callback(element);
    }

    return {
        makeDetectable: makeDetectable,
        addListener: addListener
    };
};
