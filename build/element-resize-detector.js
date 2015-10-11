(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.elementResizeDetectorMaker = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var utils = require("./utils");

module.exports = function batchProcessorMaker(options) {
    options             = options || {};
    var reporter        = options.reporter;
    var asyncProcess    = utils.getOption(options, "async", true);
    var autoProcess     = utils.getOption(options, "auto", true);

    if(autoProcess && !asyncProcess) {
        reporter && reporter.warn("Invalid options combination. auto=true and async=false is invalid. Setting async=true.");
        asyncProcess = true;
    }

    var batch;
    var batchSize;
    var topLevel;
    var bottomLevel;

    clearBatch();

    var asyncFrameHandler;

    function addFunction(level, fn) {
        if(!fn) {
            fn = level;
            level = 0;
        }

        if(level > topLevel) {
            topLevel = level;
        } else if(level < bottomLevel) {
            bottomLevel = level;
        }

        if(!batch[level]) {
            batch[level] = [];
        }

        if(autoProcess && asyncProcess && batchSize === 0) {
            processBatchAsync();
        }

        batch[level].push(fn);
        batchSize++;
    }

    function forceProcessBatch(localAsyncProcess) {
        if(localAsyncProcess === undefined) {
            localAsyncProcess = asyncProcess;
        }

        if(asyncFrameHandler) {
            cancelFrame(asyncFrameHandler);
            asyncFrameHandler = null;
        }

        if(localAsyncProcess) {
            processBatchAsync();
        } else {
            processBatch();
        }
    }

    function processBatch() {
        for(var level = bottomLevel; level <= topLevel; level++) {
            var fns = batch[level];

            for(var i = 0; i < fns.length; i++) {
                var fn = fns[i];
                fn();
            }
        }
        clearBatch();
    }

    function processBatchAsync() {
        asyncFrameHandler = requestFrame(processBatch);
    }

    function clearBatch() {
        batch           = {};
        batchSize       = 0;
        topLevel        = 0;
        bottomLevel     = 0;
    }

    function cancelFrame(listener) {
        // var cancel = window.cancelAnimationFrame || window.mozCancelAnimationFrame || window.webkitCancelAnimationFrame || window.clearTimeout;
        var cancel = window.clearTimeout;
        return cancel(listener);
    }

    function requestFrame(callback) {
        // var raf = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || function(fn) { return window.setTimeout(fn, 20); };
        var raf = function(fn) { return window.setTimeout(fn, 0); };
        return raf(callback);
    }

    return {
        add: addFunction,
        force: forceProcessBatch
    };
};
},{"./utils":2}],2:[function(require,module,exports){
"use strict";

var utils = module.exports = {};

utils.getOption = getOption;

function getOption(options, name, defaultValue) {
    var value = options[name];

    if((value === undefined || value === null) && defaultValue !== undefined) {
        return defaultValue;
    }

    return value;
}

},{}],3:[function(require,module,exports){
"use strict";

var detector = module.exports = {};

detector.isIE = function(version) {
    function isAnyIeVersion() {
        var agent = navigator.userAgent.toLowerCase();
        return agent.indexOf("msie") !== -1 || agent.indexOf("trident") !== -1 || agent.indexOf(" edge/") !== -1;
    }

    if(!isAnyIeVersion()) {
        return false;
    }

    if(!version) {
        return true;
    }

    //Shamelessly stolen from https://gist.github.com/padolsey/527683
    var ieVersion = (function(){
        var undef,
            v = 3,
            div = document.createElement("div"),
            all = div.getElementsByTagName("i");

        do {
            div.innerHTML = "<!--[if gt IE " + (++v) + "]><i></i><![endif]-->";
        }
        while (all[0]);

        return v > 4 ? v : undef;
    }());

    return version === ieVersion;
};

detector.isLegacyOpera = function() {
    return !!window.opera;
};

},{}],4:[function(require,module,exports){
"use strict";

var utils = module.exports = {};

/**
 * Loops through the collection and calls the callback for each element. if the callback returns truthy, the loop is broken and returns the same value.
 * @public
 * @param {*} collection The collection to loop through. Needs to have a length property set and have indices set from 0 to length - 1.
 * @param {function} callback The callback to be called for each element. The element will be given as a parameter to the callback. If this callback returns truthy, the loop is broken and the same value is returned.
 * @returns {*} The value that a callback has returned (if truthy). Otherwise nothing.
 */
utils.forEach = function(collection, callback) {
    for(var i = 0; i < collection.length; i++) {
        var result = callback(collection[i]);
        if(result) {
            return result;
        }
    }
};

},{}],5:[function(require,module,exports){
/**
 * Resize detection strategy that injects objects to elements in order to detect resize events.
 * Heavily inspired by: http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/
 */

"use strict";

var browserDetector = require("../browser-detector");

module.exports = function(options) {
    options             = options || {};
    var reporter        = options.reporter;
    var batchProcessor  = options.batchProcessor;
    var getState        = options.stateHandler.getState;

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
        if(!getObject(element)) {
            throw new Error("Element is not detectable by this strategy.");
        }

        function listenerProxy() {
            listener(element);
        }

        if(browserDetector.isIE(8)) {
            //IE 8 does not support object, but supports the resize event directly on elements.
            element.attachEvent("onresize", listenerProxy);
        } else {
            var object = getObject(element);
            object.contentDocument.defaultView.addEventListener("resize", listenerProxy);
        }
    }

    /**
     * Makes an element detectable and ready to be listened for resize events. Will call the callback when the element is ready to be listened for resize changes.
     * @private
     * @param {element} element The element to make detectable
     * @param {function} callback The callback to be called when the element is ready to be listened for resize changes. Will be called with the element as first parameter.
     */
    function makeDetectable(element, callback) {
        function injectObject(element, callback) {
            var OBJECT_STYLE = "display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; padding: 0; margin: 0; opacity: 0; z-index: -1000; pointer-events: none;";

            function onObjectLoad() {
                /*jshint validthis: true */

                function getDocument(element, callback) {
                    //Opera 12 seem to call the object.onload before the actual document has been created.
                    //So if it is not present, poll it with an timeout until it is present.
                    //TODO: Could maybe be handled better with object.onreadystatechange or similar.
                    if(!element.contentDocument) {
                        setTimeout(function checkForObjectDocument() {
                            getDocument(element, callback);
                        }, 100);

                        return;
                    }

                    callback(element.contentDocument);
                }

                //Mutating the object element here seems to fire another load event.
                //Mutating the inner document of the object element is fine though.
                var objectElement = this;

                //Create the style element to be added to the object.
                getDocument(objectElement, function onObjectDocumentReady(objectDocument) {
                    //Notify that the element is ready to be listened to.
                    callback(element);
                });
            }

            //The target element needs to be positioned (everything except static) so the absolute positioned object will be positioned relative to the target element.
            var style = getComputedStyle(element);
            var position = style.position;

            function mutateDom() {
                if(position === "static") {
                    element.style.position = "relative";

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

                //Add an object element as a child to the target element that will be listened to for resize events.
                var object = document.createElement("object");
                object.style.cssText = OBJECT_STYLE;
                object.type = "text/html";
                object.onload = onObjectLoad;

                //Safari: This must occur before adding the object to the DOM.
                //IE: Does not like that this happens before, even if it is also added after.
                if(!browserDetector.isIE()) {
                    object.data = "about:blank";
                }

                element.appendChild(object);
                getState(element).object = object;

                //IE: This must occur after adding the object to the DOM.
                if(browserDetector.isIE()) {
                    object.data = "about:blank";
                }
            }

            if(batchProcessor) {
                batchProcessor.add(mutateDom);
            } else {
                mutateDom();
            }
        }

        if(browserDetector.isIE(8)) {
            //IE 8 does not support objects properly. Luckily they do support the resize event.
            //So do not inject the object and notify that the element is already ready to be listened to.
            //The event handler for the resize event is attached in the utils.addListener instead.
            callback(element);
        } else {
            injectObject(element, callback);
        }
    }

    /**
     * Returns the child object of the target element.
     * @private
     * @param {element} element The target element.
     * @returns The object element of the target.
     */
    function getObject(element) {
        return getState(element).object;
    }

    return {
        makeDetectable: makeDetectable,
        addListener: addListener
    };
};

},{"../browser-detector":3}],6:[function(require,module,exports){
/**
 * Resize detection strategy that injects divs to elements in order to detect resize events on scroll events.
 * Heavily inspired by: https://github.com/marcj/css-element-queries/blob/master/src/ResizeSensor.js
 */

"use strict";

module.exports = function(options) {
    options             = options || {};
    var reporter        = options.reporter;
    var batchProcessor  = options.batchProcessor;
    var getState        = options.stateHandler.getState;

    if(!reporter) {
        throw new Error("Missing required dependency: reporter.");
    }

    //TODO: Could this perhaps be done at installation time?
    var scrollbarSizes = getScrollbarSizes();

    /**
     * Adds a resize event listener to the element.
     * @public
     * @param {element} element The element that should have the listener added.
     * @param {function} listener The listener callback to be called for each resize event of the element. The element will be given as a parameter to the listener callback.
     */
    function addListener(element, listener) {
        var changed = function() {
            var elementStyle    = getComputedStyle(element);
            var width           = parseSize(elementStyle.width);
            var height          = parseSize(elementStyle.height);

            // Store the size of the element sync here, so that multiple scroll events may be ignored in the event listeners.
            // Otherwise the if-check in handleScroll is useless.
            storeCurrentSize(element, width, height);

            batchProcessor.add(function updateDetectorElements() {
                updateChildSizes(element, width, height);
            });

            batchProcessor.add(1, function updateScrollbars() {
                positionScrollbars(element, width, height);
                listener(element);
            });
        };

        function handleScroll() {
            var style = getComputedStyle(element);
            var width = parseSize(style.width);
            var height = parseSize(style.height);

            if (width !== element.lastWidth || height !== element.lastHeight) {
                changed();
            }
        }

        var expand = getExpandElement(element);
        var shrink = getShrinkElement(element);

        addEvent(expand, "scroll", handleScroll);
        addEvent(shrink, "scroll", handleScroll);
    }

    /**
     * Makes an element detectable and ready to be listened for resize events. Will call the callback when the element is ready to be listened for resize changes.
     * @private
     * @param {element} element The element to make detectable
     * @param {function} callback The callback to be called when the element is ready to be listened for resize changes. Will be called with the element as first parameter.
     */
    function makeDetectable(element, callback) {
        // Reading properties of elementStyle will result in a forced getComputedStyle for some browsers, so read all values and store them as primitives here.
        var elementStyle        = getComputedStyle(element);
        var position            = elementStyle.position;
        var width               = parseSize(elementStyle.width);
        var height              = parseSize(elementStyle.height);
        var top                 = elementStyle.top;
        var right               = elementStyle.right;
        var bottom              = elementStyle.bottom;
        var left                = elementStyle.left;
        var readyExpandScroll   = false;
        var readyShrinkScroll   = false;
        var readyOverall        = false;

        function ready() {
            if(readyExpandScroll && readyShrinkScroll && readyOverall) {
                callback(element);
            }
        }

        function mutateDom() {
            if(position === "static") {
                element.style.position = "relative";

                var removeRelativeStyles = function(reporter, element, value, property) {
                    function getNumericalValue(value) {
                        return value.replace(/[^-\d\.]/g, "");
                    }

                    if(value !== "auto" && getNumericalValue(value) !== "0") {
                        reporter.warn("An element that is positioned static has style." + property + "=" + value + " which is ignored due to the static positioning. The element will need to be positioned relative, so the style." + property + " will be set to 0. Element: ", element);
                        element.style[property] = 0;
                    }
                };

                //Check so that there are no accidental styles that will make the element styled differently now that is is relative.
                //If there are any, set them to 0 (this should be okay with the user since the style properties did nothing before [since the element was positioned static] anyway).
                removeRelativeStyles(reporter, element, top, "top");
                removeRelativeStyles(reporter, element, right, "right");
                removeRelativeStyles(reporter, element, bottom, "bottom");
                removeRelativeStyles(reporter, element, left, "left");
            }

            function getContainerCssText(left, top, bottom, right) {
                left = (!left ? "0" : (left + "px"));
                top = (!top ? "0" : (top + "px"));
                bottom = (!bottom ? "0" : (bottom + "px"));
                right = (!right ? "0" : (right + "px"));

                return "position: absolute; left: " + left + "; top: " + top + "; right: " + right + "; bottom: " + bottom + "; overflow: scroll; z-index: -1; visibility: hidden;";
            }

            var scrollbarWidth          = scrollbarSizes.width;
            var scrollbarHeight         = scrollbarSizes.height;
            var containerStyle          = getContainerCssText(-1, -1, -scrollbarHeight, -scrollbarWidth);
            var shrinkExpandstyle       = getContainerCssText(0, 0, -scrollbarHeight, -scrollbarWidth);
            var shrinkExpandChildStyle  = "position: absolute; left: 0; top: 0;";

            var container               = document.createElement("div");
            var expand                  = document.createElement("div");
            var expandChild             = document.createElement("div");
            var shrink                  = document.createElement("div");
            var shrinkChild             = document.createElement("div");

            container.style.cssText     = containerStyle;
            expand.style.cssText        = shrinkExpandstyle;
            expandChild.style.cssText   = shrinkExpandChildStyle;
            shrink.style.cssText        = shrinkExpandstyle;
            shrinkChild.style.cssText   = shrinkExpandChildStyle + " width: 200%; height: 200%;";

            expand.appendChild(expandChild);
            shrink.appendChild(shrinkChild);
            container.appendChild(expand);
            container.appendChild(shrink);
            element.appendChild(container);
            getState(element).element = container;

            addEvent(expand, "scroll", function onFirstExpandScroll() {
                removeEvent(expand, "scroll", onFirstExpandScroll);
                readyExpandScroll = true;
                ready();
            });

            addEvent(shrink, "scroll", function onFirstShrinkScroll() {
                removeEvent(shrink, "scroll", onFirstShrinkScroll);
                readyShrinkScroll = true;
                ready();
            });

            updateChildSizes(element, width, height);
        }

        function finalizeDomMutation() {
            storeCurrentSize(element, width, height);
            positionScrollbars(element, width, height);
            readyOverall = true;
            ready();
        }

        if(batchProcessor) {
            batchProcessor.add(mutateDom);
            batchProcessor.add(1, finalizeDomMutation);
        } else {
            mutateDom();
            finalizeDomMutation();
        }
    }

    function getExpandElement(element) {
        return getState(element).element.childNodes[0];
    }

    function getExpandChildElement(element) {
        return getExpandElement(element).childNodes[0];
    }

    function getShrinkElement(element) {
        return getState(element).element.childNodes[1];
    }

    function getExpandSize(size) {
        return size + 10;
    }

    function getShrinkSize(size) {
        return size * 2;
    }

    function updateChildSizes(element, width, height) {
        var expandChild             = getExpandChildElement(element);
        var expandWidth             = getExpandSize(width);
        var expandHeight            = getExpandSize(height);
        expandChild.style.width     = expandWidth + "px";
        expandChild.style.height    = expandHeight + "px";
    }

    function storeCurrentSize(element, width, height) {
        element.lastWidth   = width;
        element.lastHeight  = height;
    }

    function positionScrollbars(element, width, height) {
        var expand          = getExpandElement(element);
        var shrink          = getShrinkElement(element);
        var expandWidth     = getExpandSize(width);
        var expandHeight    = getExpandSize(height);
        var shrinkWidth     = getShrinkSize(width);
        var shrinkHeight    = getShrinkSize(height);
        expand.scrollLeft   = expandWidth;
        expand.scrollTop    = expandHeight;
        shrink.scrollLeft   = shrinkWidth;
        shrink.scrollTop    = shrinkHeight;
    }

    function addEvent(el, name, cb) {
        if (el.attachEvent) {
            el.attachEvent("on" + name, cb);
        } else {
            el.addEventListener(name, cb);
        }
    }

    function removeEvent(el, name, cb) {
        if(el.attachEvent) {
            el.detachEvent("on" + name, cb);
        } else {
            el.removeEventListener(name, cb);
        }
    }

    function parseSize(size) {
        return parseFloat(size.replace(/px/, ""));
    }

    function getScrollbarSizes() {
        var width = 500;
        var height = 500;

        var child = document.createElement("div");
        child.style.cssText = "position: absolute; width: " + width*2 + "px; height: " + height*2 + "px; visibility: hidden;";

        var container = document.createElement("div");
        container.style.cssText = "position: absolute; width: " + width + "px; height: " + height + "px; overflow: scroll; visibility: none; top: " + -width*3 + "px; left: " + -height*3 + "px; visibility: hidden;";

        container.appendChild(child);

        document.body.insertBefore(container, document.body.firstChild);

        var widthSize = width - container.clientWidth;
        var heightSize = height - container.clientHeight;

        document.body.removeChild(container);

        return {
            width: widthSize,
            height: heightSize
        };
    }

    return {
        makeDetectable: makeDetectable,
        addListener: addListener
    };
};

},{}],7:[function(require,module,exports){
"use strict";

var forEach                 = require("./collection-utils").forEach;
var elementUtilsMaker       = require("./element-utils");
var listenerHandlerMaker    = require("./listener-handler");
var idGeneratorMaker        = require("./id-generator");
var idHandlerMaker          = require("./id-handler");
var reporterMaker           = require("./reporter");
var browserDetector         = require("./browser-detector");
var batchProcessorMaker     = require("batch-processor");
var stateHandler            = require("./state-handler");

//Detection strategies.
var objectStrategyMaker     = require("./detection-strategy/object.js");
var scrollStrategyMaker     = require("./detection-strategy/scroll.js");

/**
 * @typedef idHandler
 * @type {object}
 * @property {function} get Gets the resize detector id of the element.
 * @property {function} set Generate and sets the resize detector id of the element.
 */

/**
 * @typedef Options
 * @type {object}
 * @property {boolean} callOnAdd    Determines if listeners should be called when they are getting added.
                                    Default is true. If true, the listener is guaranteed to be called when it has been added.
                                    If false, the listener will not be guarenteed to be called when it has been added (does not prevent it from being called).
 * @property {idHandler} idHandler  A custom id handler that is responsible for generating, setting and retrieving id's for elements.
                                    If not provided, a default id handler will be used.
 * @property {reporter} reporter    A custom reporter that handles reporting logs, warnings and errors.
                                    If not provided, a default id handler will be used.
                                    If set to false, then nothing will be reported.
 */

/**
 * Creates an element resize detector instance.
 * @public
 * @param {Options?} options Optional global options object that will decide how this instance will work.
 */
module.exports = function(options) {
    options = options || {};

    //idHandler is currently not an option to the listenTo function, so it should not be added to globalOptions.
    var idHandler = options.idHandler;

    if(!idHandler) {
        var idGenerator = idGeneratorMaker();
        var defaultIdHandler = idHandlerMaker(idGenerator);
        idHandler = defaultIdHandler;
    }

    //reporter is currently not an option to the listenTo function, so it should not be added to globalOptions.
    var reporter = options.reporter;

    if(!reporter) {
        //If options.reporter is false, then the reporter should be quiet.
        var quiet = reporter === false;
        reporter = reporterMaker(quiet);
    }

    //batchProcessor is currently not an option to the listenTo function, so it should not be added to globalOptions.
    var batchProcessor = getOption(options, "batchProcessor", batchProcessorMaker({ reporter: reporter }));

    //Options to be used as default for the listenTo function.
    var globalOptions = {};
    globalOptions.callOnAdd     = !!getOption(options, "callOnAdd", true);

    var eventListenerHandler    = listenerHandlerMaker(idHandler);
    var elementUtils            = elementUtilsMaker({
        stateHandler: stateHandler
    });

    //The detection strategy to be used.
    var detectionStrategy;
    var desiredStrategy = getOption(options, "strategy", "object");
    var strategyOptions = {
        reporter: reporter,
        batchProcessor: batchProcessor,
        stateHandler: stateHandler
    };

    if(desiredStrategy === "scroll" && browserDetector.isLegacyOpera()) {
        reporter.warn("Scroll strategy is not supported on legacy Opera. Changing to object strategy.");
        desiredStrategy = "object";
    }

    if(desiredStrategy === "scroll") {
        detectionStrategy = scrollStrategyMaker(strategyOptions);
    } else if(desiredStrategy === "object") {
        detectionStrategy = objectStrategyMaker(strategyOptions);
    } else {
        throw new Error("Invalid strategy name: " + desiredStrategy);
    }

    //Calls can be made to listenTo with elements that are still are being installed.
    //Also, same elements can occur in the elements list in the listenTo function.
    //With this map, the ready callbacks can be synchronized between the calls
    //so that the ready callback can always be called when an element is ready - even if
    //it wasn't installed from the function intself.
    var onReadyCallbacks = {};

    /**
     * Makes the given elements resize-detectable and starts listening to resize events on the elements. Calls the event callback for each event for each element.
     * @public
     * @param {Options?} options Optional options object. These options will override the global options. Some options may not be overriden, such as idHandler.
     * @param {element[]|element} elements The given array of elements to detect resize events of. Single element is also valid.
     * @param {function} listener The callback to be executed for each resize event for each element.
     */
    function listenTo(options, elements, listener) {
        function onResizeCallback(element) {
            var listeners = eventListenerHandler.get(element);

            forEach(listeners, function callListenerProxy(listener) {
                listener(element);
            });
        }

        function addListener(callOnAdd, element, listener) {
            eventListenerHandler.add(element, listener);

            if(callOnAdd) {
                listener(element);
            }
        }

        //Options object may be omitted.
        if(!listener) {
            listener = elements;
            elements = options;
            options = {};
        }

        if(!elements) {
            throw new Error("At least one element required.");
        }

        if(!listener) {
            throw new Error("Listener required.");
        }

        if(elements.length === undefined) {
            elements = [elements];
        }

        var elementsReady = 0;

        var callOnAdd = getOption(options, "callOnAdd", globalOptions.callOnAdd);
        var onReadyCallback = getOption(options, "onReady", function noop() {});

        forEach(elements, function attachListenerToElement(element) {
            var id = idHandler.get(element);

            if(!elementUtils.isDetectable(element)) {
                if(elementUtils.isBusy(element)) {
                    //The element is being prepared to be detectable. Do not make it detectable.
                    //Just add the listener, because the element will soon be detectable.
                    addListener(callOnAdd, element, listener);
                    onReadyCallbacks[id] = onReadyCallbacks[id] || [];
                    onReadyCallbacks[id].push(function onReady() {
                        elementsReady++;

                        if(elementsReady === elements.length) {
                            onReadyCallback();
                        }
                    });
                    return;
                }

                //The element is not prepared to be detectable, so do prepare it and add a listener to it.
                elementUtils.markBusy(element, true);
                return detectionStrategy.makeDetectable(element, function onElementDetectable(element) {
                    elementUtils.markAsDetectable(element);
                    elementUtils.markBusy(element, false);
                    detectionStrategy.addListener(element, onResizeCallback);
                    addListener(callOnAdd, element, listener);

                    elementsReady++;
                    if(elementsReady === elements.length) {
                        onReadyCallback();
                    }

                    if(onReadyCallbacks[id]) {
                        forEach(onReadyCallbacks[id], function(callback) {
                            callback();
                        });
                        delete onReadyCallbacks[id];
                    }
                });
            }

            //The element has been prepared to be detectable and is ready to be listened to.
            addListener(callOnAdd, element, listener);
            elementsReady++;
        });

        if(elementsReady === elements.length) {
            onReadyCallback();
        }
    }

    return {
        listenTo: listenTo
    };
};

function getOption(options, name, defaultValue) {
    var value = options[name];

    if((value === undefined || value === null) && defaultValue !== undefined) {
        return defaultValue;
    }

    return value;
}

},{"./browser-detector":3,"./collection-utils":4,"./detection-strategy/object.js":5,"./detection-strategy/scroll.js":6,"./element-utils":8,"./id-generator":9,"./id-handler":10,"./listener-handler":11,"./reporter":12,"./state-handler":13,"batch-processor":1}],8:[function(require,module,exports){
"use strict";

module.exports = function(options) {
    var getState = options.stateHandler.getState;

    /**
     * Tells if the element has been made detectable and ready to be listened for resize events.
     * @public
     * @param {element} The element to check.
     * @returns {boolean} True or false depending on if the element is detectable or not.
     */
    function isDetectable(element) {
        return !!getState(element).isDetectable;
    }

    /**
     * Marks the element that it has been made detectable and ready to be listened for resize events.
     * @public
     * @param {element} The element to mark.
     */
    function markAsDetectable(element) {
        getState(element).isDetectable = true;
    }

    /**
     * Tells if the element is busy or not.
     * @public
     * @param {element} The element to check.
     * @returns {boolean} True or false depending on if the element is busy or not.
     */
    function isBusy(element) {
        return !!getState(element).busy;
    }

    /**
     * Marks the object is busy and should not be made detectable.
     * @public
     * @param {element} element The element to mark.
     * @param {boolean} busy If the element is busy or not.
     */
    function markBusy(element, busy) {
        getState(element).busy = !!busy;
    }

    return {
        isDetectable: isDetectable,
        markAsDetectable: markAsDetectable,
        isBusy: isBusy,
        markBusy: markBusy
    };
};

},{}],9:[function(require,module,exports){
"use strict";

module.exports = function() {
    var idCount = 1;

    /**
     * Generates a new unique id in the context.
     * @public
     * @returns {number} A unique id in the context.
     */
    function generate() {
        return idCount++;
    }

    return {
        generate: generate
    };
};

},{}],10:[function(require,module,exports){
"use strict";

module.exports = function(idGenerator) {
    var ID_PROP_NAME = "_erdTargetId";

    /**
     * Gets the resize detector id of the element. If the element does not have an id, one will be assigned to the element.
     * @public
     * @param {element} element The target element to get the id of.
     * @param {boolean?} readonly An id will not be assigned to the element if the readonly parameter is true. Default is false.
     * @returns {string|number} The id of the element.
     */
    function getId(element, readonly) {
        if(!readonly && !hasId(element)) {
            setId(element);
        }

        return element[ID_PROP_NAME];
    }

    function setId(element) {
        var id = idGenerator.generate();

        element[ID_PROP_NAME] = id;

        return id;
    }

    function hasId(element) {
        return element[ID_PROP_NAME] !== undefined;
    }

    return {
        get: getId
    };
};

},{}],11:[function(require,module,exports){
"use strict";

module.exports = function(idHandler) {
    var eventListeners = {};

    /**
     * Gets all listeners for the given element.
     * @public
     * @param {element} element The element to get all listeners for.
     * @returns All listeners for the given element.
     */
    function getListeners(element) {
        return eventListeners[idHandler.get(element)];
    }

    /**
     * Stores the given listener for the given element. Will not actually add the listener to the element.
     * @public
     * @param {element} element The element that should have the listener added.
     * @param {function} listener The callback that the element has added.
     */
    function addListener(element, listener) {
        var id = idHandler.get(element);

        if(!eventListeners[id]) {
            eventListeners[id] = [];
        }

        eventListeners[id].push(listener);
    }

    return {
        get: getListeners,
        add: addListener
    };
};

},{}],12:[function(require,module,exports){
"use strict";

/* global console: false */

/**
 * Reporter that handles the reporting of logs, warnings and errors.
 * @public
 * @param {boolean} quiet Tells if the reporter should be quiet or not.
 */
module.exports = function(quiet) {
    function noop() {
        //Does nothing.
    }

    var reporter = {
        log: noop,
        warn: noop,
        error: noop
    };

    if(!quiet && window.console) {
        var attachFunction = function(reporter, name) {
            //The proxy is needed to be able to call the method with the console context,
            //since we cannot use bind.
            reporter[name] = function reporterProxy() {
                console[name].apply(console, arguments);
            };
        };

        attachFunction(reporter, "log");
        attachFunction(reporter, "warn");
        attachFunction(reporter, "error");
    }

    return reporter;
};
},{}],13:[function(require,module,exports){
"use strict";

var prop = "_erd";

function initState(element) {
    element[prop] = {};
    return getState(element);
}

function getState(element) {
    return element[prop] || initState(element);
}

function cleanState(element) {
    delete element[prop];
}

module.exports = {
  initState: initState,
  getState: getState,
  cleanState: cleanState
};

},{}]},{},[7])(7)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuLi9iYXRjaC1wcm9jZXNzb3Ivc3JjL2JhdGNoLXByb2Nlc3Nvci5qcyIsIi4uL2JhdGNoLXByb2Nlc3Nvci9zcmMvdXRpbHMuanMiLCJzcmMvYnJvd3Nlci1kZXRlY3Rvci5qcyIsInNyYy9jb2xsZWN0aW9uLXV0aWxzLmpzIiwic3JjL2RldGVjdGlvbi1zdHJhdGVneS9vYmplY3QuanMiLCJzcmMvZGV0ZWN0aW9uLXN0cmF0ZWd5L3Njcm9sbC5qcyIsInNyYy9lbGVtZW50LXJlc2l6ZS1kZXRlY3Rvci5qcyIsInNyYy9lbGVtZW50LXV0aWxzLmpzIiwic3JjL2lkLWdlbmVyYXRvci5qcyIsInNyYy9pZC1oYW5kbGVyLmpzIiwic3JjL2xpc3RlbmVyLWhhbmRsZXIuanMiLCJzcmMvcmVwb3J0ZXIuanMiLCJzcmMvc3RhdGUtaGFuZGxlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDalJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBiYXRjaFByb2Nlc3Nvck1ha2VyKG9wdGlvbnMpIHtcbiAgICBvcHRpb25zICAgICAgICAgICAgID0gb3B0aW9ucyB8fCB7fTtcbiAgICB2YXIgcmVwb3J0ZXIgICAgICAgID0gb3B0aW9ucy5yZXBvcnRlcjtcbiAgICB2YXIgYXN5bmNQcm9jZXNzICAgID0gdXRpbHMuZ2V0T3B0aW9uKG9wdGlvbnMsIFwiYXN5bmNcIiwgdHJ1ZSk7XG4gICAgdmFyIGF1dG9Qcm9jZXNzICAgICA9IHV0aWxzLmdldE9wdGlvbihvcHRpb25zLCBcImF1dG9cIiwgdHJ1ZSk7XG5cbiAgICBpZihhdXRvUHJvY2VzcyAmJiAhYXN5bmNQcm9jZXNzKSB7XG4gICAgICAgIHJlcG9ydGVyICYmIHJlcG9ydGVyLndhcm4oXCJJbnZhbGlkIG9wdGlvbnMgY29tYmluYXRpb24uIGF1dG89dHJ1ZSBhbmQgYXN5bmM9ZmFsc2UgaXMgaW52YWxpZC4gU2V0dGluZyBhc3luYz10cnVlLlwiKTtcbiAgICAgICAgYXN5bmNQcm9jZXNzID0gdHJ1ZTtcbiAgICB9XG5cbiAgICB2YXIgYmF0Y2g7XG4gICAgdmFyIGJhdGNoU2l6ZTtcbiAgICB2YXIgdG9wTGV2ZWw7XG4gICAgdmFyIGJvdHRvbUxldmVsO1xuXG4gICAgY2xlYXJCYXRjaCgpO1xuXG4gICAgdmFyIGFzeW5jRnJhbWVIYW5kbGVyO1xuXG4gICAgZnVuY3Rpb24gYWRkRnVuY3Rpb24obGV2ZWwsIGZuKSB7XG4gICAgICAgIGlmKCFmbikge1xuICAgICAgICAgICAgZm4gPSBsZXZlbDtcbiAgICAgICAgICAgIGxldmVsID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGxldmVsID4gdG9wTGV2ZWwpIHtcbiAgICAgICAgICAgIHRvcExldmVsID0gbGV2ZWw7XG4gICAgICAgIH0gZWxzZSBpZihsZXZlbCA8IGJvdHRvbUxldmVsKSB7XG4gICAgICAgICAgICBib3R0b21MZXZlbCA9IGxldmVsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIWJhdGNoW2xldmVsXSkge1xuICAgICAgICAgICAgYmF0Y2hbbGV2ZWxdID0gW107XG4gICAgICAgIH1cblxuICAgICAgICBpZihhdXRvUHJvY2VzcyAmJiBhc3luY1Byb2Nlc3MgJiYgYmF0Y2hTaXplID09PSAwKSB7XG4gICAgICAgICAgICBwcm9jZXNzQmF0Y2hBc3luYygpO1xuICAgICAgICB9XG5cbiAgICAgICAgYmF0Y2hbbGV2ZWxdLnB1c2goZm4pO1xuICAgICAgICBiYXRjaFNpemUrKztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmb3JjZVByb2Nlc3NCYXRjaChsb2NhbEFzeW5jUHJvY2Vzcykge1xuICAgICAgICBpZihsb2NhbEFzeW5jUHJvY2VzcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBsb2NhbEFzeW5jUHJvY2VzcyA9IGFzeW5jUHJvY2VzcztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGFzeW5jRnJhbWVIYW5kbGVyKSB7XG4gICAgICAgICAgICBjYW5jZWxGcmFtZShhc3luY0ZyYW1lSGFuZGxlcik7XG4gICAgICAgICAgICBhc3luY0ZyYW1lSGFuZGxlciA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZihsb2NhbEFzeW5jUHJvY2Vzcykge1xuICAgICAgICAgICAgcHJvY2Vzc0JhdGNoQXN5bmMoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb2Nlc3NCYXRjaCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcHJvY2Vzc0JhdGNoKCkge1xuICAgICAgICBmb3IodmFyIGxldmVsID0gYm90dG9tTGV2ZWw7IGxldmVsIDw9IHRvcExldmVsOyBsZXZlbCsrKSB7XG4gICAgICAgICAgICB2YXIgZm5zID0gYmF0Y2hbbGV2ZWxdO1xuXG4gICAgICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgZm5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGZuID0gZm5zW2ldO1xuICAgICAgICAgICAgICAgIGZuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY2xlYXJCYXRjaCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHByb2Nlc3NCYXRjaEFzeW5jKCkge1xuICAgICAgICBhc3luY0ZyYW1lSGFuZGxlciA9IHJlcXVlc3RGcmFtZShwcm9jZXNzQmF0Y2gpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNsZWFyQmF0Y2goKSB7XG4gICAgICAgIGJhdGNoICAgICAgICAgICA9IHt9O1xuICAgICAgICBiYXRjaFNpemUgICAgICAgPSAwO1xuICAgICAgICB0b3BMZXZlbCAgICAgICAgPSAwO1xuICAgICAgICBib3R0b21MZXZlbCAgICAgPSAwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNhbmNlbEZyYW1lKGxpc3RlbmVyKSB7XG4gICAgICAgIC8vIHZhciBjYW5jZWwgPSB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUgfHwgd2luZG93Lm1vekNhbmNlbEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy53ZWJraXRDYW5jZWxBbmltYXRpb25GcmFtZSB8fCB3aW5kb3cuY2xlYXJUaW1lb3V0O1xuICAgICAgICB2YXIgY2FuY2VsID0gd2luZG93LmNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNhbmNlbChsaXN0ZW5lcik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVxdWVzdEZyYW1lKGNhbGxiYWNrKSB7XG4gICAgICAgIC8vIHZhciByYWYgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHwgd2luZG93LndlYmtpdFJlcXVlc3RBbmltYXRpb25GcmFtZSB8fCBmdW5jdGlvbihmbikgeyByZXR1cm4gd2luZG93LnNldFRpbWVvdXQoZm4sIDIwKTsgfTtcbiAgICAgICAgdmFyIHJhZiA9IGZ1bmN0aW9uKGZuKSB7IHJldHVybiB3aW5kb3cuc2V0VGltZW91dChmbiwgMCk7IH07XG4gICAgICAgIHJldHVybiByYWYoY2FsbGJhY2spO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGFkZDogYWRkRnVuY3Rpb24sXG4gICAgICAgIGZvcmNlOiBmb3JjZVByb2Nlc3NCYXRjaFxuICAgIH07XG59OyIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG51dGlscy5nZXRPcHRpb24gPSBnZXRPcHRpb247XG5cbmZ1bmN0aW9uIGdldE9wdGlvbihvcHRpb25zLCBuYW1lLCBkZWZhdWx0VmFsdWUpIHtcbiAgICB2YXIgdmFsdWUgPSBvcHRpb25zW25hbWVdO1xuXG4gICAgaWYoKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpICYmIGRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0VmFsdWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHZhbHVlO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkZXRlY3RvciA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbmRldGVjdG9yLmlzSUUgPSBmdW5jdGlvbih2ZXJzaW9uKSB7XG4gICAgZnVuY3Rpb24gaXNBbnlJZVZlcnNpb24oKSB7XG4gICAgICAgIHZhciBhZ2VudCA9IG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgcmV0dXJuIGFnZW50LmluZGV4T2YoXCJtc2llXCIpICE9PSAtMSB8fCBhZ2VudC5pbmRleE9mKFwidHJpZGVudFwiKSAhPT0gLTEgfHwgYWdlbnQuaW5kZXhPZihcIiBlZGdlL1wiKSAhPT0gLTE7XG4gICAgfVxuXG4gICAgaWYoIWlzQW55SWVWZXJzaW9uKCkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmKCF2ZXJzaW9uKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8vU2hhbWVsZXNzbHkgc3RvbGVuIGZyb20gaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vcGFkb2xzZXkvNTI3NjgzXG4gICAgdmFyIGllVmVyc2lvbiA9IChmdW5jdGlvbigpe1xuICAgICAgICB2YXIgdW5kZWYsXG4gICAgICAgICAgICB2ID0gMyxcbiAgICAgICAgICAgIGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksXG4gICAgICAgICAgICBhbGwgPSBkaXYuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJpXCIpO1xuXG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIGRpdi5pbm5lckhUTUwgPSBcIjwhLS1baWYgZ3QgSUUgXCIgKyAoKyt2KSArIFwiXT48aT48L2k+PCFbZW5kaWZdLS0+XCI7XG4gICAgICAgIH1cbiAgICAgICAgd2hpbGUgKGFsbFswXSk7XG5cbiAgICAgICAgcmV0dXJuIHYgPiA0ID8gdiA6IHVuZGVmO1xuICAgIH0oKSk7XG5cbiAgICByZXR1cm4gdmVyc2lvbiA9PT0gaWVWZXJzaW9uO1xufTtcblxuZGV0ZWN0b3IuaXNMZWdhY3lPcGVyYSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiAhIXdpbmRvdy5vcGVyYTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLyoqXG4gKiBMb29wcyB0aHJvdWdoIHRoZSBjb2xsZWN0aW9uIGFuZCBjYWxscyB0aGUgY2FsbGJhY2sgZm9yIGVhY2ggZWxlbWVudC4gaWYgdGhlIGNhbGxiYWNrIHJldHVybnMgdHJ1dGh5LCB0aGUgbG9vcCBpcyBicm9rZW4gYW5kIHJldHVybnMgdGhlIHNhbWUgdmFsdWUuXG4gKiBAcHVibGljXG4gKiBAcGFyYW0geyp9IGNvbGxlY3Rpb24gVGhlIGNvbGxlY3Rpb24gdG8gbG9vcCB0aHJvdWdoLiBOZWVkcyB0byBoYXZlIGEgbGVuZ3RoIHByb3BlcnR5IHNldCBhbmQgaGF2ZSBpbmRpY2VzIHNldCBmcm9tIDAgdG8gbGVuZ3RoIC0gMS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIFRoZSBjYWxsYmFjayB0byBiZSBjYWxsZWQgZm9yIGVhY2ggZWxlbWVudC4gVGhlIGVsZW1lbnQgd2lsbCBiZSBnaXZlbiBhcyBhIHBhcmFtZXRlciB0byB0aGUgY2FsbGJhY2suIElmIHRoaXMgY2FsbGJhY2sgcmV0dXJucyB0cnV0aHksIHRoZSBsb29wIGlzIGJyb2tlbiBhbmQgdGhlIHNhbWUgdmFsdWUgaXMgcmV0dXJuZWQuXG4gKiBAcmV0dXJucyB7Kn0gVGhlIHZhbHVlIHRoYXQgYSBjYWxsYmFjayBoYXMgcmV0dXJuZWQgKGlmIHRydXRoeSkuIE90aGVyd2lzZSBub3RoaW5nLlxuICovXG51dGlscy5mb3JFYWNoID0gZnVuY3Rpb24oY29sbGVjdGlvbiwgY2FsbGJhY2spIHtcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgY29sbGVjdGlvbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgcmVzdWx0ID0gY2FsbGJhY2soY29sbGVjdGlvbltpXSk7XG4gICAgICAgIGlmKHJlc3VsdCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgIH1cbn07XG4iLCIvKipcbiAqIFJlc2l6ZSBkZXRlY3Rpb24gc3RyYXRlZ3kgdGhhdCBpbmplY3RzIG9iamVjdHMgdG8gZWxlbWVudHMgaW4gb3JkZXIgdG8gZGV0ZWN0IHJlc2l6ZSBldmVudHMuXG4gKiBIZWF2aWx5IGluc3BpcmVkIGJ5OiBodHRwOi8vd3d3LmJhY2thbGxleWNvZGVyLmNvbS8yMDEzLzAzLzE4L2Nyb3NzLWJyb3dzZXItZXZlbnQtYmFzZWQtZWxlbWVudC1yZXNpemUtZGV0ZWN0aW9uL1xuICovXG5cblwidXNlIHN0cmljdFwiO1xuXG52YXIgYnJvd3NlckRldGVjdG9yID0gcmVxdWlyZShcIi4uL2Jyb3dzZXItZGV0ZWN0b3JcIik7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIG9wdGlvbnMgICAgICAgICAgICAgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciByZXBvcnRlciAgICAgICAgPSBvcHRpb25zLnJlcG9ydGVyO1xuICAgIHZhciBiYXRjaFByb2Nlc3NvciAgPSBvcHRpb25zLmJhdGNoUHJvY2Vzc29yO1xuICAgIHZhciBnZXRTdGF0ZSAgICAgICAgPSBvcHRpb25zLnN0YXRlSGFuZGxlci5nZXRTdGF0ZTtcblxuICAgIGlmKCFyZXBvcnRlcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJNaXNzaW5nIHJlcXVpcmVkIGRlcGVuZGVuY3k6IHJlcG9ydGVyLlwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgcmVzaXplIGV2ZW50IGxpc3RlbmVyIHRvIHRoZSBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdGhhdCBzaG91bGQgaGF2ZSB0aGUgbGlzdGVuZXIgYWRkZWQuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gbGlzdGVuZXIgVGhlIGxpc3RlbmVyIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCBmb3IgZWFjaCByZXNpemUgZXZlbnQgb2YgdGhlIGVsZW1lbnQuIFRoZSBlbGVtZW50IHdpbGwgYmUgZ2l2ZW4gYXMgYSBwYXJhbWV0ZXIgdG8gdGhlIGxpc3RlbmVyIGNhbGxiYWNrLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGFkZExpc3RlbmVyKGVsZW1lbnQsIGxpc3RlbmVyKSB7XG4gICAgICAgIGlmKCFnZXRPYmplY3QoZWxlbWVudCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkVsZW1lbnQgaXMgbm90IGRldGVjdGFibGUgYnkgdGhpcyBzdHJhdGVneS5cIik7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBsaXN0ZW5lclByb3h5KCkge1xuICAgICAgICAgICAgbGlzdGVuZXIoZWxlbWVudCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZihicm93c2VyRGV0ZWN0b3IuaXNJRSg4KSkge1xuICAgICAgICAgICAgLy9JRSA4IGRvZXMgbm90IHN1cHBvcnQgb2JqZWN0LCBidXQgc3VwcG9ydHMgdGhlIHJlc2l6ZSBldmVudCBkaXJlY3RseSBvbiBlbGVtZW50cy5cbiAgICAgICAgICAgIGVsZW1lbnQuYXR0YWNoRXZlbnQoXCJvbnJlc2l6ZVwiLCBsaXN0ZW5lclByb3h5KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBvYmplY3QgPSBnZXRPYmplY3QoZWxlbWVudCk7XG4gICAgICAgICAgICBvYmplY3QuY29udGVudERvY3VtZW50LmRlZmF1bHRWaWV3LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgbGlzdGVuZXJQcm94eSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNYWtlcyBhbiBlbGVtZW50IGRldGVjdGFibGUgYW5kIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgZXZlbnRzLiBXaWxsIGNhbGwgdGhlIGNhbGxiYWNrIHdoZW4gdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBjaGFuZ2VzLlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRvIG1ha2UgZGV0ZWN0YWJsZVxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIFRoZSBjYWxsYmFjayB0byBiZSBjYWxsZWQgd2hlbiB0aGUgZWxlbWVudCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGNoYW5nZXMuIFdpbGwgYmUgY2FsbGVkIHdpdGggdGhlIGVsZW1lbnQgYXMgZmlyc3QgcGFyYW1ldGVyLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIG1ha2VEZXRlY3RhYmxlKGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gICAgICAgIGZ1bmN0aW9uIGluamVjdE9iamVjdChlbGVtZW50LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgdmFyIE9CSkVDVF9TVFlMRSA9IFwiZGlzcGxheTogYmxvY2s7IHBvc2l0aW9uOiBhYnNvbHV0ZTsgdG9wOiAwOyBsZWZ0OiAwOyB3aWR0aDogMTAwJTsgaGVpZ2h0OiAxMDAlOyBib3JkZXI6IG5vbmU7IHBhZGRpbmc6IDA7IG1hcmdpbjogMDsgb3BhY2l0eTogMDsgei1pbmRleDogLTEwMDA7IHBvaW50ZXItZXZlbnRzOiBub25lO1wiO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBvbk9iamVjdExvYWQoKSB7XG4gICAgICAgICAgICAgICAgLypqc2hpbnQgdmFsaWR0aGlzOiB0cnVlICovXG5cbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBnZXREb2N1bWVudChlbGVtZW50LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgICAgICAvL09wZXJhIDEyIHNlZW0gdG8gY2FsbCB0aGUgb2JqZWN0Lm9ubG9hZCBiZWZvcmUgdGhlIGFjdHVhbCBkb2N1bWVudCBoYXMgYmVlbiBjcmVhdGVkLlxuICAgICAgICAgICAgICAgICAgICAvL1NvIGlmIGl0IGlzIG5vdCBwcmVzZW50LCBwb2xsIGl0IHdpdGggYW4gdGltZW91dCB1bnRpbCBpdCBpcyBwcmVzZW50LlxuICAgICAgICAgICAgICAgICAgICAvL1RPRE86IENvdWxkIG1heWJlIGJlIGhhbmRsZWQgYmV0dGVyIHdpdGggb2JqZWN0Lm9ucmVhZHlzdGF0ZWNoYW5nZSBvciBzaW1pbGFyLlxuICAgICAgICAgICAgICAgICAgICBpZighZWxlbWVudC5jb250ZW50RG9jdW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gY2hlY2tGb3JPYmplY3REb2N1bWVudCgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZXREb2N1bWVudChlbGVtZW50LCBjYWxsYmFjayk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCAxMDApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlbGVtZW50LmNvbnRlbnREb2N1bWVudCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy9NdXRhdGluZyB0aGUgb2JqZWN0IGVsZW1lbnQgaGVyZSBzZWVtcyB0byBmaXJlIGFub3RoZXIgbG9hZCBldmVudC5cbiAgICAgICAgICAgICAgICAvL011dGF0aW5nIHRoZSBpbm5lciBkb2N1bWVudCBvZiB0aGUgb2JqZWN0IGVsZW1lbnQgaXMgZmluZSB0aG91Z2guXG4gICAgICAgICAgICAgICAgdmFyIG9iamVjdEVsZW1lbnQgPSB0aGlzO1xuXG4gICAgICAgICAgICAgICAgLy9DcmVhdGUgdGhlIHN0eWxlIGVsZW1lbnQgdG8gYmUgYWRkZWQgdG8gdGhlIG9iamVjdC5cbiAgICAgICAgICAgICAgICBnZXREb2N1bWVudChvYmplY3RFbGVtZW50LCBmdW5jdGlvbiBvbk9iamVjdERvY3VtZW50UmVhZHkob2JqZWN0RG9jdW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy9Ob3RpZnkgdGhhdCB0aGUgZWxlbWVudCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCB0by5cbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vVGhlIHRhcmdldCBlbGVtZW50IG5lZWRzIHRvIGJlIHBvc2l0aW9uZWQgKGV2ZXJ5dGhpbmcgZXhjZXB0IHN0YXRpYykgc28gdGhlIGFic29sdXRlIHBvc2l0aW9uZWQgb2JqZWN0IHdpbGwgYmUgcG9zaXRpb25lZCByZWxhdGl2ZSB0byB0aGUgdGFyZ2V0IGVsZW1lbnQuXG4gICAgICAgICAgICB2YXIgc3R5bGUgPSBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuICAgICAgICAgICAgdmFyIHBvc2l0aW9uID0gc3R5bGUucG9zaXRpb247XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIG11dGF0ZURvbSgpIHtcbiAgICAgICAgICAgICAgICBpZihwb3NpdGlvbiA9PT0gXCJzdGF0aWNcIikge1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gXCJyZWxhdGl2ZVwiO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciByZW1vdmVSZWxhdGl2ZVN0eWxlcyA9IGZ1bmN0aW9uKHJlcG9ydGVyLCBlbGVtZW50LCBzdHlsZSwgcHJvcGVydHkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGdldE51bWVyaWNhbFZhbHVlKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1teLVxcZFxcLl0vZywgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IHN0eWxlW3Byb3BlcnR5XTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYodmFsdWUgIT09IFwiYXV0b1wiICYmIGdldE51bWVyaWNhbFZhbHVlKHZhbHVlKSAhPT0gXCIwXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRlci53YXJuKFwiQW4gZWxlbWVudCB0aGF0IGlzIHBvc2l0aW9uZWQgc3RhdGljIGhhcyBzdHlsZS5cIiArIHByb3BlcnR5ICsgXCI9XCIgKyB2YWx1ZSArIFwiIHdoaWNoIGlzIGlnbm9yZWQgZHVlIHRvIHRoZSBzdGF0aWMgcG9zaXRpb25pbmcuIFRoZSBlbGVtZW50IHdpbGwgbmVlZCB0byBiZSBwb3NpdGlvbmVkIHJlbGF0aXZlLCBzbyB0aGUgc3R5bGUuXCIgKyBwcm9wZXJ0eSArIFwiIHdpbGwgYmUgc2V0IHRvIDAuIEVsZW1lbnQ6IFwiLCBlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlW3Byb3BlcnR5XSA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgICAgLy9DaGVjayBzbyB0aGF0IHRoZXJlIGFyZSBubyBhY2NpZGVudGFsIHN0eWxlcyB0aGF0IHdpbGwgbWFrZSB0aGUgZWxlbWVudCBzdHlsZWQgZGlmZmVyZW50bHkgbm93IHRoYXQgaXMgaXMgcmVsYXRpdmUuXG4gICAgICAgICAgICAgICAgICAgIC8vSWYgdGhlcmUgYXJlIGFueSwgc2V0IHRoZW0gdG8gMCAodGhpcyBzaG91bGQgYmUgb2theSB3aXRoIHRoZSB1c2VyIHNpbmNlIHRoZSBzdHlsZSBwcm9wZXJ0aWVzIGRpZCBub3RoaW5nIGJlZm9yZSBbc2luY2UgdGhlIGVsZW1lbnQgd2FzIHBvc2l0aW9uZWQgc3RhdGljXSBhbnl3YXkpLlxuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIFwidG9wXCIpO1xuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgICAgIHJlbW92ZVJlbGF0aXZlU3R5bGVzKHJlcG9ydGVyLCBlbGVtZW50LCBzdHlsZSwgXCJib3R0b21cIik7XG4gICAgICAgICAgICAgICAgICAgIHJlbW92ZVJlbGF0aXZlU3R5bGVzKHJlcG9ydGVyLCBlbGVtZW50LCBzdHlsZSwgXCJsZWZ0XCIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vQWRkIGFuIG9iamVjdCBlbGVtZW50IGFzIGEgY2hpbGQgdG8gdGhlIHRhcmdldCBlbGVtZW50IHRoYXQgd2lsbCBiZSBsaXN0ZW5lZCB0byBmb3IgcmVzaXplIGV2ZW50cy5cbiAgICAgICAgICAgICAgICB2YXIgb2JqZWN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIm9iamVjdFwiKTtcbiAgICAgICAgICAgICAgICBvYmplY3Quc3R5bGUuY3NzVGV4dCA9IE9CSkVDVF9TVFlMRTtcbiAgICAgICAgICAgICAgICBvYmplY3QudHlwZSA9IFwidGV4dC9odG1sXCI7XG4gICAgICAgICAgICAgICAgb2JqZWN0Lm9ubG9hZCA9IG9uT2JqZWN0TG9hZDtcblxuICAgICAgICAgICAgICAgIC8vU2FmYXJpOiBUaGlzIG11c3Qgb2NjdXIgYmVmb3JlIGFkZGluZyB0aGUgb2JqZWN0IHRvIHRoZSBET00uXG4gICAgICAgICAgICAgICAgLy9JRTogRG9lcyBub3QgbGlrZSB0aGF0IHRoaXMgaGFwcGVucyBiZWZvcmUsIGV2ZW4gaWYgaXQgaXMgYWxzbyBhZGRlZCBhZnRlci5cbiAgICAgICAgICAgICAgICBpZighYnJvd3NlckRldGVjdG9yLmlzSUUoKSkge1xuICAgICAgICAgICAgICAgICAgICBvYmplY3QuZGF0YSA9IFwiYWJvdXQ6YmxhbmtcIjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBlbGVtZW50LmFwcGVuZENoaWxkKG9iamVjdCk7XG4gICAgICAgICAgICAgICAgZ2V0U3RhdGUoZWxlbWVudCkub2JqZWN0ID0gb2JqZWN0O1xuXG4gICAgICAgICAgICAgICAgLy9JRTogVGhpcyBtdXN0IG9jY3VyIGFmdGVyIGFkZGluZyB0aGUgb2JqZWN0IHRvIHRoZSBET00uXG4gICAgICAgICAgICAgICAgaWYoYnJvd3NlckRldGVjdG9yLmlzSUUoKSkge1xuICAgICAgICAgICAgICAgICAgICBvYmplY3QuZGF0YSA9IFwiYWJvdXQ6YmxhbmtcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKGJhdGNoUHJvY2Vzc29yKSB7XG4gICAgICAgICAgICAgICAgYmF0Y2hQcm9jZXNzb3IuYWRkKG11dGF0ZURvbSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG11dGF0ZURvbSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYoYnJvd3NlckRldGVjdG9yLmlzSUUoOCkpIHtcbiAgICAgICAgICAgIC8vSUUgOCBkb2VzIG5vdCBzdXBwb3J0IG9iamVjdHMgcHJvcGVybHkuIEx1Y2tpbHkgdGhleSBkbyBzdXBwb3J0IHRoZSByZXNpemUgZXZlbnQuXG4gICAgICAgICAgICAvL1NvIGRvIG5vdCBpbmplY3QgdGhlIG9iamVjdCBhbmQgbm90aWZ5IHRoYXQgdGhlIGVsZW1lbnQgaXMgYWxyZWFkeSByZWFkeSB0byBiZSBsaXN0ZW5lZCB0by5cbiAgICAgICAgICAgIC8vVGhlIGV2ZW50IGhhbmRsZXIgZm9yIHRoZSByZXNpemUgZXZlbnQgaXMgYXR0YWNoZWQgaW4gdGhlIHV0aWxzLmFkZExpc3RlbmVyIGluc3RlYWQuXG4gICAgICAgICAgICBjYWxsYmFjayhlbGVtZW50KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluamVjdE9iamVjdChlbGVtZW50LCBjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjaGlsZCBvYmplY3Qgb2YgdGhlIHRhcmdldCBlbGVtZW50LlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSB0YXJnZXQgZWxlbWVudC5cbiAgICAgKiBAcmV0dXJucyBUaGUgb2JqZWN0IGVsZW1lbnQgb2YgdGhlIHRhcmdldC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRPYmplY3QoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZ2V0U3RhdGUoZWxlbWVudCkub2JqZWN0O1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIG1ha2VEZXRlY3RhYmxlOiBtYWtlRGV0ZWN0YWJsZSxcbiAgICAgICAgYWRkTGlzdGVuZXI6IGFkZExpc3RlbmVyXG4gICAgfTtcbn07XG4iLCIvKipcbiAqIFJlc2l6ZSBkZXRlY3Rpb24gc3RyYXRlZ3kgdGhhdCBpbmplY3RzIGRpdnMgdG8gZWxlbWVudHMgaW4gb3JkZXIgdG8gZGV0ZWN0IHJlc2l6ZSBldmVudHMgb24gc2Nyb2xsIGV2ZW50cy5cbiAqIEhlYXZpbHkgaW5zcGlyZWQgYnk6IGh0dHBzOi8vZ2l0aHViLmNvbS9tYXJjai9jc3MtZWxlbWVudC1xdWVyaWVzL2Jsb2IvbWFzdGVyL3NyYy9SZXNpemVTZW5zb3IuanNcbiAqL1xuXG5cInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgb3B0aW9ucyAgICAgICAgICAgICA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIHJlcG9ydGVyICAgICAgICA9IG9wdGlvbnMucmVwb3J0ZXI7XG4gICAgdmFyIGJhdGNoUHJvY2Vzc29yICA9IG9wdGlvbnMuYmF0Y2hQcm9jZXNzb3I7XG4gICAgdmFyIGdldFN0YXRlICAgICAgICA9IG9wdGlvbnMuc3RhdGVIYW5kbGVyLmdldFN0YXRlO1xuXG4gICAgaWYoIXJlcG9ydGVyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk1pc3NpbmcgcmVxdWlyZWQgZGVwZW5kZW5jeTogcmVwb3J0ZXIuXCIpO1xuICAgIH1cblxuICAgIC8vVE9ETzogQ291bGQgdGhpcyBwZXJoYXBzIGJlIGRvbmUgYXQgaW5zdGFsbGF0aW9uIHRpbWU/XG4gICAgdmFyIHNjcm9sbGJhclNpemVzID0gZ2V0U2Nyb2xsYmFyU2l6ZXMoKTtcblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSByZXNpemUgZXZlbnQgbGlzdGVuZXIgdG8gdGhlIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0aGF0IHNob3VsZCBoYXZlIHRoZSBsaXN0ZW5lciBhZGRlZC5cbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBsaXN0ZW5lciBUaGUgbGlzdGVuZXIgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIGZvciBlYWNoIHJlc2l6ZSBldmVudCBvZiB0aGUgZWxlbWVudC4gVGhlIGVsZW1lbnQgd2lsbCBiZSBnaXZlbiBhcyBhIHBhcmFtZXRlciB0byB0aGUgbGlzdGVuZXIgY2FsbGJhY2suXG4gICAgICovXG4gICAgZnVuY3Rpb24gYWRkTGlzdGVuZXIoZWxlbWVudCwgbGlzdGVuZXIpIHtcbiAgICAgICAgdmFyIGNoYW5nZWQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciBlbGVtZW50U3R5bGUgICAgPSBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuICAgICAgICAgICAgdmFyIHdpZHRoICAgICAgICAgICA9IHBhcnNlU2l6ZShlbGVtZW50U3R5bGUud2lkdGgpO1xuICAgICAgICAgICAgdmFyIGhlaWdodCAgICAgICAgICA9IHBhcnNlU2l6ZShlbGVtZW50U3R5bGUuaGVpZ2h0KTtcblxuICAgICAgICAgICAgLy8gU3RvcmUgdGhlIHNpemUgb2YgdGhlIGVsZW1lbnQgc3luYyBoZXJlLCBzbyB0aGF0IG11bHRpcGxlIHNjcm9sbCBldmVudHMgbWF5IGJlIGlnbm9yZWQgaW4gdGhlIGV2ZW50IGxpc3RlbmVycy5cbiAgICAgICAgICAgIC8vIE90aGVyd2lzZSB0aGUgaWYtY2hlY2sgaW4gaGFuZGxlU2Nyb2xsIGlzIHVzZWxlc3MuXG4gICAgICAgICAgICBzdG9yZUN1cnJlbnRTaXplKGVsZW1lbnQsIHdpZHRoLCBoZWlnaHQpO1xuXG4gICAgICAgICAgICBiYXRjaFByb2Nlc3Nvci5hZGQoZnVuY3Rpb24gdXBkYXRlRGV0ZWN0b3JFbGVtZW50cygpIHtcbiAgICAgICAgICAgICAgICB1cGRhdGVDaGlsZFNpemVzKGVsZW1lbnQsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGJhdGNoUHJvY2Vzc29yLmFkZCgxLCBmdW5jdGlvbiB1cGRhdGVTY3JvbGxiYXJzKCkge1xuICAgICAgICAgICAgICAgIHBvc2l0aW9uU2Nyb2xsYmFycyhlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcihlbGVtZW50KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZ1bmN0aW9uIGhhbmRsZVNjcm9sbCgpIHtcbiAgICAgICAgICAgIHZhciBzdHlsZSA9IGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG4gICAgICAgICAgICB2YXIgd2lkdGggPSBwYXJzZVNpemUoc3R5bGUud2lkdGgpO1xuICAgICAgICAgICAgdmFyIGhlaWdodCA9IHBhcnNlU2l6ZShzdHlsZS5oZWlnaHQpO1xuXG4gICAgICAgICAgICBpZiAod2lkdGggIT09IGVsZW1lbnQubGFzdFdpZHRoIHx8IGhlaWdodCAhPT0gZWxlbWVudC5sYXN0SGVpZ2h0KSB7XG4gICAgICAgICAgICAgICAgY2hhbmdlZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGV4cGFuZCA9IGdldEV4cGFuZEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgIHZhciBzaHJpbmsgPSBnZXRTaHJpbmtFbGVtZW50KGVsZW1lbnQpO1xuXG4gICAgICAgIGFkZEV2ZW50KGV4cGFuZCwgXCJzY3JvbGxcIiwgaGFuZGxlU2Nyb2xsKTtcbiAgICAgICAgYWRkRXZlbnQoc2hyaW5rLCBcInNjcm9sbFwiLCBoYW5kbGVTY3JvbGwpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1ha2VzIGFuIGVsZW1lbnQgZGV0ZWN0YWJsZSBhbmQgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBldmVudHMuIFdpbGwgY2FsbCB0aGUgY2FsbGJhY2sgd2hlbiB0aGUgZWxlbWVudCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGNoYW5nZXMuXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdG8gbWFrZSBkZXRlY3RhYmxlXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCB3aGVuIHRoZSBlbGVtZW50IGlzIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgY2hhbmdlcy4gV2lsbCBiZSBjYWxsZWQgd2l0aCB0aGUgZWxlbWVudCBhcyBmaXJzdCBwYXJhbWV0ZXIuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbWFrZURldGVjdGFibGUoZWxlbWVudCwgY2FsbGJhY2spIHtcbiAgICAgICAgLy8gUmVhZGluZyBwcm9wZXJ0aWVzIG9mIGVsZW1lbnRTdHlsZSB3aWxsIHJlc3VsdCBpbiBhIGZvcmNlZCBnZXRDb21wdXRlZFN0eWxlIGZvciBzb21lIGJyb3dzZXJzLCBzbyByZWFkIGFsbCB2YWx1ZXMgYW5kIHN0b3JlIHRoZW0gYXMgcHJpbWl0aXZlcyBoZXJlLlxuICAgICAgICB2YXIgZWxlbWVudFN0eWxlICAgICAgICA9IGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG4gICAgICAgIHZhciBwb3NpdGlvbiAgICAgICAgICAgID0gZWxlbWVudFN0eWxlLnBvc2l0aW9uO1xuICAgICAgICB2YXIgd2lkdGggICAgICAgICAgICAgICA9IHBhcnNlU2l6ZShlbGVtZW50U3R5bGUud2lkdGgpO1xuICAgICAgICB2YXIgaGVpZ2h0ICAgICAgICAgICAgICA9IHBhcnNlU2l6ZShlbGVtZW50U3R5bGUuaGVpZ2h0KTtcbiAgICAgICAgdmFyIHRvcCAgICAgICAgICAgICAgICAgPSBlbGVtZW50U3R5bGUudG9wO1xuICAgICAgICB2YXIgcmlnaHQgICAgICAgICAgICAgICA9IGVsZW1lbnRTdHlsZS5yaWdodDtcbiAgICAgICAgdmFyIGJvdHRvbSAgICAgICAgICAgICAgPSBlbGVtZW50U3R5bGUuYm90dG9tO1xuICAgICAgICB2YXIgbGVmdCAgICAgICAgICAgICAgICA9IGVsZW1lbnRTdHlsZS5sZWZ0O1xuICAgICAgICB2YXIgcmVhZHlFeHBhbmRTY3JvbGwgICA9IGZhbHNlO1xuICAgICAgICB2YXIgcmVhZHlTaHJpbmtTY3JvbGwgICA9IGZhbHNlO1xuICAgICAgICB2YXIgcmVhZHlPdmVyYWxsICAgICAgICA9IGZhbHNlO1xuXG4gICAgICAgIGZ1bmN0aW9uIHJlYWR5KCkge1xuICAgICAgICAgICAgaWYocmVhZHlFeHBhbmRTY3JvbGwgJiYgcmVhZHlTaHJpbmtTY3JvbGwgJiYgcmVhZHlPdmVyYWxsKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZWxlbWVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBtdXRhdGVEb20oKSB7XG4gICAgICAgICAgICBpZihwb3NpdGlvbiA9PT0gXCJzdGF0aWNcIikge1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSBcInJlbGF0aXZlXCI7XG5cbiAgICAgICAgICAgICAgICB2YXIgcmVtb3ZlUmVsYXRpdmVTdHlsZXMgPSBmdW5jdGlvbihyZXBvcnRlciwgZWxlbWVudCwgdmFsdWUsIHByb3BlcnR5KSB7XG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGdldE51bWVyaWNhbFZhbHVlKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWUucmVwbGFjZSgvW14tXFxkXFwuXS9nLCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmKHZhbHVlICE9PSBcImF1dG9cIiAmJiBnZXROdW1lcmljYWxWYWx1ZSh2YWx1ZSkgIT09IFwiMFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRlci53YXJuKFwiQW4gZWxlbWVudCB0aGF0IGlzIHBvc2l0aW9uZWQgc3RhdGljIGhhcyBzdHlsZS5cIiArIHByb3BlcnR5ICsgXCI9XCIgKyB2YWx1ZSArIFwiIHdoaWNoIGlzIGlnbm9yZWQgZHVlIHRvIHRoZSBzdGF0aWMgcG9zaXRpb25pbmcuIFRoZSBlbGVtZW50IHdpbGwgbmVlZCB0byBiZSBwb3NpdGlvbmVkIHJlbGF0aXZlLCBzbyB0aGUgc3R5bGUuXCIgKyBwcm9wZXJ0eSArIFwiIHdpbGwgYmUgc2V0IHRvIDAuIEVsZW1lbnQ6IFwiLCBlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuc3R5bGVbcHJvcGVydHldID0gMDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAvL0NoZWNrIHNvIHRoYXQgdGhlcmUgYXJlIG5vIGFjY2lkZW50YWwgc3R5bGVzIHRoYXQgd2lsbCBtYWtlIHRoZSBlbGVtZW50IHN0eWxlZCBkaWZmZXJlbnRseSBub3cgdGhhdCBpcyBpcyByZWxhdGl2ZS5cbiAgICAgICAgICAgICAgICAvL0lmIHRoZXJlIGFyZSBhbnksIHNldCB0aGVtIHRvIDAgKHRoaXMgc2hvdWxkIGJlIG9rYXkgd2l0aCB0aGUgdXNlciBzaW5jZSB0aGUgc3R5bGUgcHJvcGVydGllcyBkaWQgbm90aGluZyBiZWZvcmUgW3NpbmNlIHRoZSBlbGVtZW50IHdhcyBwb3NpdGlvbmVkIHN0YXRpY10gYW55d2F5KS5cbiAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgdG9wLCBcInRvcFwiKTtcbiAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgcmlnaHQsIFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIGJvdHRvbSwgXCJib3R0b21cIik7XG4gICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIGxlZnQsIFwibGVmdFwiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gZ2V0Q29udGFpbmVyQ3NzVGV4dChsZWZ0LCB0b3AsIGJvdHRvbSwgcmlnaHQpIHtcbiAgICAgICAgICAgICAgICBsZWZ0ID0gKCFsZWZ0ID8gXCIwXCIgOiAobGVmdCArIFwicHhcIikpO1xuICAgICAgICAgICAgICAgIHRvcCA9ICghdG9wID8gXCIwXCIgOiAodG9wICsgXCJweFwiKSk7XG4gICAgICAgICAgICAgICAgYm90dG9tID0gKCFib3R0b20gPyBcIjBcIiA6IChib3R0b20gKyBcInB4XCIpKTtcbiAgICAgICAgICAgICAgICByaWdodCA9ICghcmlnaHQgPyBcIjBcIiA6IChyaWdodCArIFwicHhcIikpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIFwicG9zaXRpb246IGFic29sdXRlOyBsZWZ0OiBcIiArIGxlZnQgKyBcIjsgdG9wOiBcIiArIHRvcCArIFwiOyByaWdodDogXCIgKyByaWdodCArIFwiOyBib3R0b206IFwiICsgYm90dG9tICsgXCI7IG92ZXJmbG93OiBzY3JvbGw7IHotaW5kZXg6IC0xOyB2aXNpYmlsaXR5OiBoaWRkZW47XCI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBzY3JvbGxiYXJXaWR0aCAgICAgICAgICA9IHNjcm9sbGJhclNpemVzLndpZHRoO1xuICAgICAgICAgICAgdmFyIHNjcm9sbGJhckhlaWdodCAgICAgICAgID0gc2Nyb2xsYmFyU2l6ZXMuaGVpZ2h0O1xuICAgICAgICAgICAgdmFyIGNvbnRhaW5lclN0eWxlICAgICAgICAgID0gZ2V0Q29udGFpbmVyQ3NzVGV4dCgtMSwgLTEsIC1zY3JvbGxiYXJIZWlnaHQsIC1zY3JvbGxiYXJXaWR0aCk7XG4gICAgICAgICAgICB2YXIgc2hyaW5rRXhwYW5kc3R5bGUgICAgICAgPSBnZXRDb250YWluZXJDc3NUZXh0KDAsIDAsIC1zY3JvbGxiYXJIZWlnaHQsIC1zY3JvbGxiYXJXaWR0aCk7XG4gICAgICAgICAgICB2YXIgc2hyaW5rRXhwYW5kQ2hpbGRTdHlsZSAgPSBcInBvc2l0aW9uOiBhYnNvbHV0ZTsgbGVmdDogMDsgdG9wOiAwO1wiO1xuXG4gICAgICAgICAgICB2YXIgY29udGFpbmVyICAgICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgdmFyIGV4cGFuZCAgICAgICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIHZhciBleHBhbmRDaGlsZCAgICAgICAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICB2YXIgc2hyaW5rICAgICAgICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgdmFyIHNocmlua0NoaWxkICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblxuICAgICAgICAgICAgY29udGFpbmVyLnN0eWxlLmNzc1RleHQgICAgID0gY29udGFpbmVyU3R5bGU7XG4gICAgICAgICAgICBleHBhbmQuc3R5bGUuY3NzVGV4dCAgICAgICAgPSBzaHJpbmtFeHBhbmRzdHlsZTtcbiAgICAgICAgICAgIGV4cGFuZENoaWxkLnN0eWxlLmNzc1RleHQgICA9IHNocmlua0V4cGFuZENoaWxkU3R5bGU7XG4gICAgICAgICAgICBzaHJpbmsuc3R5bGUuY3NzVGV4dCAgICAgICAgPSBzaHJpbmtFeHBhbmRzdHlsZTtcbiAgICAgICAgICAgIHNocmlua0NoaWxkLnN0eWxlLmNzc1RleHQgICA9IHNocmlua0V4cGFuZENoaWxkU3R5bGUgKyBcIiB3aWR0aDogMjAwJTsgaGVpZ2h0OiAyMDAlO1wiO1xuXG4gICAgICAgICAgICBleHBhbmQuYXBwZW5kQ2hpbGQoZXhwYW5kQ2hpbGQpO1xuICAgICAgICAgICAgc2hyaW5rLmFwcGVuZENoaWxkKHNocmlua0NoaWxkKTtcbiAgICAgICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChleHBhbmQpO1xuICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHNocmluayk7XG4gICAgICAgICAgICBlbGVtZW50LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG4gICAgICAgICAgICBnZXRTdGF0ZShlbGVtZW50KS5lbGVtZW50ID0gY29udGFpbmVyO1xuXG4gICAgICAgICAgICBhZGRFdmVudChleHBhbmQsIFwic2Nyb2xsXCIsIGZ1bmN0aW9uIG9uRmlyc3RFeHBhbmRTY3JvbGwoKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlRXZlbnQoZXhwYW5kLCBcInNjcm9sbFwiLCBvbkZpcnN0RXhwYW5kU2Nyb2xsKTtcbiAgICAgICAgICAgICAgICByZWFkeUV4cGFuZFNjcm9sbCA9IHRydWU7XG4gICAgICAgICAgICAgICAgcmVhZHkoKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBhZGRFdmVudChzaHJpbmssIFwic2Nyb2xsXCIsIGZ1bmN0aW9uIG9uRmlyc3RTaHJpbmtTY3JvbGwoKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlRXZlbnQoc2hyaW5rLCBcInNjcm9sbFwiLCBvbkZpcnN0U2hyaW5rU2Nyb2xsKTtcbiAgICAgICAgICAgICAgICByZWFkeVNocmlua1Njcm9sbCA9IHRydWU7XG4gICAgICAgICAgICAgICAgcmVhZHkoKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB1cGRhdGVDaGlsZFNpemVzKGVsZW1lbnQsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZmluYWxpemVEb21NdXRhdGlvbigpIHtcbiAgICAgICAgICAgIHN0b3JlQ3VycmVudFNpemUoZWxlbWVudCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgICAgICBwb3NpdGlvblNjcm9sbGJhcnMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgICAgICByZWFkeU92ZXJhbGwgPSB0cnVlO1xuICAgICAgICAgICAgcmVhZHkoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGJhdGNoUHJvY2Vzc29yKSB7XG4gICAgICAgICAgICBiYXRjaFByb2Nlc3Nvci5hZGQobXV0YXRlRG9tKTtcbiAgICAgICAgICAgIGJhdGNoUHJvY2Vzc29yLmFkZCgxLCBmaW5hbGl6ZURvbU11dGF0aW9uKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG11dGF0ZURvbSgpO1xuICAgICAgICAgICAgZmluYWxpemVEb21NdXRhdGlvbigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0RXhwYW5kRWxlbWVudChlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBnZXRTdGF0ZShlbGVtZW50KS5lbGVtZW50LmNoaWxkTm9kZXNbMF07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0RXhwYW5kQ2hpbGRFbGVtZW50KGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGdldEV4cGFuZEVsZW1lbnQoZWxlbWVudCkuY2hpbGROb2Rlc1swXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRTaHJpbmtFbGVtZW50KGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGdldFN0YXRlKGVsZW1lbnQpLmVsZW1lbnQuY2hpbGROb2Rlc1sxXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRFeHBhbmRTaXplKHNpemUpIHtcbiAgICAgICAgcmV0dXJuIHNpemUgKyAxMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRTaHJpbmtTaXplKHNpemUpIHtcbiAgICAgICAgcmV0dXJuIHNpemUgKiAyO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVwZGF0ZUNoaWxkU2l6ZXMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICB2YXIgZXhwYW5kQ2hpbGQgICAgICAgICAgICAgPSBnZXRFeHBhbmRDaGlsZEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgIHZhciBleHBhbmRXaWR0aCAgICAgICAgICAgICA9IGdldEV4cGFuZFNpemUod2lkdGgpO1xuICAgICAgICB2YXIgZXhwYW5kSGVpZ2h0ICAgICAgICAgICAgPSBnZXRFeHBhbmRTaXplKGhlaWdodCk7XG4gICAgICAgIGV4cGFuZENoaWxkLnN0eWxlLndpZHRoICAgICA9IGV4cGFuZFdpZHRoICsgXCJweFwiO1xuICAgICAgICBleHBhbmRDaGlsZC5zdHlsZS5oZWlnaHQgICAgPSBleHBhbmRIZWlnaHQgKyBcInB4XCI7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3RvcmVDdXJyZW50U2l6ZShlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICAgIGVsZW1lbnQubGFzdFdpZHRoICAgPSB3aWR0aDtcbiAgICAgICAgZWxlbWVudC5sYXN0SGVpZ2h0ICA9IGhlaWdodDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwb3NpdGlvblNjcm9sbGJhcnMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICB2YXIgZXhwYW5kICAgICAgICAgID0gZ2V0RXhwYW5kRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgdmFyIHNocmluayAgICAgICAgICA9IGdldFNocmlua0VsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgIHZhciBleHBhbmRXaWR0aCAgICAgPSBnZXRFeHBhbmRTaXplKHdpZHRoKTtcbiAgICAgICAgdmFyIGV4cGFuZEhlaWdodCAgICA9IGdldEV4cGFuZFNpemUoaGVpZ2h0KTtcbiAgICAgICAgdmFyIHNocmlua1dpZHRoICAgICA9IGdldFNocmlua1NpemUod2lkdGgpO1xuICAgICAgICB2YXIgc2hyaW5rSGVpZ2h0ICAgID0gZ2V0U2hyaW5rU2l6ZShoZWlnaHQpO1xuICAgICAgICBleHBhbmQuc2Nyb2xsTGVmdCAgID0gZXhwYW5kV2lkdGg7XG4gICAgICAgIGV4cGFuZC5zY3JvbGxUb3AgICAgPSBleHBhbmRIZWlnaHQ7XG4gICAgICAgIHNocmluay5zY3JvbGxMZWZ0ICAgPSBzaHJpbmtXaWR0aDtcbiAgICAgICAgc2hyaW5rLnNjcm9sbFRvcCAgICA9IHNocmlua0hlaWdodDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBhZGRFdmVudChlbCwgbmFtZSwgY2IpIHtcbiAgICAgICAgaWYgKGVsLmF0dGFjaEV2ZW50KSB7XG4gICAgICAgICAgICBlbC5hdHRhY2hFdmVudChcIm9uXCIgKyBuYW1lLCBjYik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKG5hbWUsIGNiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbW92ZUV2ZW50KGVsLCBuYW1lLCBjYikge1xuICAgICAgICBpZihlbC5hdHRhY2hFdmVudCkge1xuICAgICAgICAgICAgZWwuZGV0YWNoRXZlbnQoXCJvblwiICsgbmFtZSwgY2IpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihuYW1lLCBjYik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwYXJzZVNpemUoc2l6ZSkge1xuICAgICAgICByZXR1cm4gcGFyc2VGbG9hdChzaXplLnJlcGxhY2UoL3B4LywgXCJcIikpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFNjcm9sbGJhclNpemVzKCkge1xuICAgICAgICB2YXIgd2lkdGggPSA1MDA7XG4gICAgICAgIHZhciBoZWlnaHQgPSA1MDA7XG5cbiAgICAgICAgdmFyIGNoaWxkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgY2hpbGQuc3R5bGUuY3NzVGV4dCA9IFwicG9zaXRpb246IGFic29sdXRlOyB3aWR0aDogXCIgKyB3aWR0aCoyICsgXCJweDsgaGVpZ2h0OiBcIiArIGhlaWdodCoyICsgXCJweDsgdmlzaWJpbGl0eTogaGlkZGVuO1wiO1xuXG4gICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBjb250YWluZXIuc3R5bGUuY3NzVGV4dCA9IFwicG9zaXRpb246IGFic29sdXRlOyB3aWR0aDogXCIgKyB3aWR0aCArIFwicHg7IGhlaWdodDogXCIgKyBoZWlnaHQgKyBcInB4OyBvdmVyZmxvdzogc2Nyb2xsOyB2aXNpYmlsaXR5OiBub25lOyB0b3A6IFwiICsgLXdpZHRoKjMgKyBcInB4OyBsZWZ0OiBcIiArIC1oZWlnaHQqMyArIFwicHg7IHZpc2liaWxpdHk6IGhpZGRlbjtcIjtcblxuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoY2hpbGQpO1xuXG4gICAgICAgIGRvY3VtZW50LmJvZHkuaW5zZXJ0QmVmb3JlKGNvbnRhaW5lciwgZG9jdW1lbnQuYm9keS5maXJzdENoaWxkKTtcblxuICAgICAgICB2YXIgd2lkdGhTaXplID0gd2lkdGggLSBjb250YWluZXIuY2xpZW50V2lkdGg7XG4gICAgICAgIHZhciBoZWlnaHRTaXplID0gaGVpZ2h0IC0gY29udGFpbmVyLmNsaWVudEhlaWdodDtcblxuICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKGNvbnRhaW5lcik7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHdpZHRoOiB3aWR0aFNpemUsXG4gICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFNpemVcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBtYWtlRGV0ZWN0YWJsZTogbWFrZURldGVjdGFibGUsXG4gICAgICAgIGFkZExpc3RlbmVyOiBhZGRMaXN0ZW5lclxuICAgIH07XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBmb3JFYWNoICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoXCIuL2NvbGxlY3Rpb24tdXRpbHNcIikuZm9yRWFjaDtcbnZhciBlbGVtZW50VXRpbHNNYWtlciAgICAgICA9IHJlcXVpcmUoXCIuL2VsZW1lbnQtdXRpbHNcIik7XG52YXIgbGlzdGVuZXJIYW5kbGVyTWFrZXIgICAgPSByZXF1aXJlKFwiLi9saXN0ZW5lci1oYW5kbGVyXCIpO1xudmFyIGlkR2VuZXJhdG9yTWFrZXIgICAgICAgID0gcmVxdWlyZShcIi4vaWQtZ2VuZXJhdG9yXCIpO1xudmFyIGlkSGFuZGxlck1ha2VyICAgICAgICAgID0gcmVxdWlyZShcIi4vaWQtaGFuZGxlclwiKTtcbnZhciByZXBvcnRlck1ha2VyICAgICAgICAgICA9IHJlcXVpcmUoXCIuL3JlcG9ydGVyXCIpO1xudmFyIGJyb3dzZXJEZXRlY3RvciAgICAgICAgID0gcmVxdWlyZShcIi4vYnJvd3Nlci1kZXRlY3RvclwiKTtcbnZhciBiYXRjaFByb2Nlc3Nvck1ha2VyICAgICA9IHJlcXVpcmUoXCJiYXRjaC1wcm9jZXNzb3JcIik7XG52YXIgc3RhdGVIYW5kbGVyICAgICAgICAgICAgPSByZXF1aXJlKFwiLi9zdGF0ZS1oYW5kbGVyXCIpO1xuXG4vL0RldGVjdGlvbiBzdHJhdGVnaWVzLlxudmFyIG9iamVjdFN0cmF0ZWd5TWFrZXIgICAgID0gcmVxdWlyZShcIi4vZGV0ZWN0aW9uLXN0cmF0ZWd5L29iamVjdC5qc1wiKTtcbnZhciBzY3JvbGxTdHJhdGVneU1ha2VyICAgICA9IHJlcXVpcmUoXCIuL2RldGVjdGlvbi1zdHJhdGVneS9zY3JvbGwuanNcIik7XG5cbi8qKlxuICogQHR5cGVkZWYgaWRIYW5kbGVyXG4gKiBAdHlwZSB7b2JqZWN0fVxuICogQHByb3BlcnR5IHtmdW5jdGlvbn0gZ2V0IEdldHMgdGhlIHJlc2l6ZSBkZXRlY3RvciBpZCBvZiB0aGUgZWxlbWVudC5cbiAqIEBwcm9wZXJ0eSB7ZnVuY3Rpb259IHNldCBHZW5lcmF0ZSBhbmQgc2V0cyB0aGUgcmVzaXplIGRldGVjdG9yIGlkIG9mIHRoZSBlbGVtZW50LlxuICovXG5cbi8qKlxuICogQHR5cGVkZWYgT3B0aW9uc1xuICogQHR5cGUge29iamVjdH1cbiAqIEBwcm9wZXJ0eSB7Ym9vbGVhbn0gY2FsbE9uQWRkICAgIERldGVybWluZXMgaWYgbGlzdGVuZXJzIHNob3VsZCBiZSBjYWxsZWQgd2hlbiB0aGV5IGFyZSBnZXR0aW5nIGFkZGVkLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgRGVmYXVsdCBpcyB0cnVlLiBJZiB0cnVlLCB0aGUgbGlzdGVuZXIgaXMgZ3VhcmFudGVlZCB0byBiZSBjYWxsZWQgd2hlbiBpdCBoYXMgYmVlbiBhZGRlZC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIElmIGZhbHNlLCB0aGUgbGlzdGVuZXIgd2lsbCBub3QgYmUgZ3VhcmVudGVlZCB0byBiZSBjYWxsZWQgd2hlbiBpdCBoYXMgYmVlbiBhZGRlZCAoZG9lcyBub3QgcHJldmVudCBpdCBmcm9tIGJlaW5nIGNhbGxlZCkuXG4gKiBAcHJvcGVydHkge2lkSGFuZGxlcn0gaWRIYW5kbGVyICBBIGN1c3RvbSBpZCBoYW5kbGVyIHRoYXQgaXMgcmVzcG9uc2libGUgZm9yIGdlbmVyYXRpbmcsIHNldHRpbmcgYW5kIHJldHJpZXZpbmcgaWQncyBmb3IgZWxlbWVudHMuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBJZiBub3QgcHJvdmlkZWQsIGEgZGVmYXVsdCBpZCBoYW5kbGVyIHdpbGwgYmUgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7cmVwb3J0ZXJ9IHJlcG9ydGVyICAgIEEgY3VzdG9tIHJlcG9ydGVyIHRoYXQgaGFuZGxlcyByZXBvcnRpbmcgbG9ncywgd2FybmluZ3MgYW5kIGVycm9ycy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIElmIG5vdCBwcm92aWRlZCwgYSBkZWZhdWx0IGlkIGhhbmRsZXIgd2lsbCBiZSB1c2VkLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSWYgc2V0IHRvIGZhbHNlLCB0aGVuIG5vdGhpbmcgd2lsbCBiZSByZXBvcnRlZC5cbiAqL1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gZWxlbWVudCByZXNpemUgZGV0ZWN0b3IgaW5zdGFuY2UuXG4gKiBAcHVibGljXG4gKiBAcGFyYW0ge09wdGlvbnM/fSBvcHRpb25zIE9wdGlvbmFsIGdsb2JhbCBvcHRpb25zIG9iamVjdCB0aGF0IHdpbGwgZGVjaWRlIGhvdyB0aGlzIGluc3RhbmNlIHdpbGwgd29yay5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICAvL2lkSGFuZGxlciBpcyBjdXJyZW50bHkgbm90IGFuIG9wdGlvbiB0byB0aGUgbGlzdGVuVG8gZnVuY3Rpb24sIHNvIGl0IHNob3VsZCBub3QgYmUgYWRkZWQgdG8gZ2xvYmFsT3B0aW9ucy5cbiAgICB2YXIgaWRIYW5kbGVyID0gb3B0aW9ucy5pZEhhbmRsZXI7XG5cbiAgICBpZighaWRIYW5kbGVyKSB7XG4gICAgICAgIHZhciBpZEdlbmVyYXRvciA9IGlkR2VuZXJhdG9yTWFrZXIoKTtcbiAgICAgICAgdmFyIGRlZmF1bHRJZEhhbmRsZXIgPSBpZEhhbmRsZXJNYWtlcihpZEdlbmVyYXRvcik7XG4gICAgICAgIGlkSGFuZGxlciA9IGRlZmF1bHRJZEhhbmRsZXI7XG4gICAgfVxuXG4gICAgLy9yZXBvcnRlciBpcyBjdXJyZW50bHkgbm90IGFuIG9wdGlvbiB0byB0aGUgbGlzdGVuVG8gZnVuY3Rpb24sIHNvIGl0IHNob3VsZCBub3QgYmUgYWRkZWQgdG8gZ2xvYmFsT3B0aW9ucy5cbiAgICB2YXIgcmVwb3J0ZXIgPSBvcHRpb25zLnJlcG9ydGVyO1xuXG4gICAgaWYoIXJlcG9ydGVyKSB7XG4gICAgICAgIC8vSWYgb3B0aW9ucy5yZXBvcnRlciBpcyBmYWxzZSwgdGhlbiB0aGUgcmVwb3J0ZXIgc2hvdWxkIGJlIHF1aWV0LlxuICAgICAgICB2YXIgcXVpZXQgPSByZXBvcnRlciA9PT0gZmFsc2U7XG4gICAgICAgIHJlcG9ydGVyID0gcmVwb3J0ZXJNYWtlcihxdWlldCk7XG4gICAgfVxuXG4gICAgLy9iYXRjaFByb2Nlc3NvciBpcyBjdXJyZW50bHkgbm90IGFuIG9wdGlvbiB0byB0aGUgbGlzdGVuVG8gZnVuY3Rpb24sIHNvIGl0IHNob3VsZCBub3QgYmUgYWRkZWQgdG8gZ2xvYmFsT3B0aW9ucy5cbiAgICB2YXIgYmF0Y2hQcm9jZXNzb3IgPSBnZXRPcHRpb24ob3B0aW9ucywgXCJiYXRjaFByb2Nlc3NvclwiLCBiYXRjaFByb2Nlc3Nvck1ha2VyKHsgcmVwb3J0ZXI6IHJlcG9ydGVyIH0pKTtcblxuICAgIC8vT3B0aW9ucyB0byBiZSB1c2VkIGFzIGRlZmF1bHQgZm9yIHRoZSBsaXN0ZW5UbyBmdW5jdGlvbi5cbiAgICB2YXIgZ2xvYmFsT3B0aW9ucyA9IHt9O1xuICAgIGdsb2JhbE9wdGlvbnMuY2FsbE9uQWRkICAgICA9ICEhZ2V0T3B0aW9uKG9wdGlvbnMsIFwiY2FsbE9uQWRkXCIsIHRydWUpO1xuXG4gICAgdmFyIGV2ZW50TGlzdGVuZXJIYW5kbGVyICAgID0gbGlzdGVuZXJIYW5kbGVyTWFrZXIoaWRIYW5kbGVyKTtcbiAgICB2YXIgZWxlbWVudFV0aWxzICAgICAgICAgICAgPSBlbGVtZW50VXRpbHNNYWtlcih7XG4gICAgICAgIHN0YXRlSGFuZGxlcjogc3RhdGVIYW5kbGVyXG4gICAgfSk7XG5cbiAgICAvL1RoZSBkZXRlY3Rpb24gc3RyYXRlZ3kgdG8gYmUgdXNlZC5cbiAgICB2YXIgZGV0ZWN0aW9uU3RyYXRlZ3k7XG4gICAgdmFyIGRlc2lyZWRTdHJhdGVneSA9IGdldE9wdGlvbihvcHRpb25zLCBcInN0cmF0ZWd5XCIsIFwib2JqZWN0XCIpO1xuICAgIHZhciBzdHJhdGVneU9wdGlvbnMgPSB7XG4gICAgICAgIHJlcG9ydGVyOiByZXBvcnRlcixcbiAgICAgICAgYmF0Y2hQcm9jZXNzb3I6IGJhdGNoUHJvY2Vzc29yLFxuICAgICAgICBzdGF0ZUhhbmRsZXI6IHN0YXRlSGFuZGxlclxuICAgIH07XG5cbiAgICBpZihkZXNpcmVkU3RyYXRlZ3kgPT09IFwic2Nyb2xsXCIgJiYgYnJvd3NlckRldGVjdG9yLmlzTGVnYWN5T3BlcmEoKSkge1xuICAgICAgICByZXBvcnRlci53YXJuKFwiU2Nyb2xsIHN0cmF0ZWd5IGlzIG5vdCBzdXBwb3J0ZWQgb24gbGVnYWN5IE9wZXJhLiBDaGFuZ2luZyB0byBvYmplY3Qgc3RyYXRlZ3kuXCIpO1xuICAgICAgICBkZXNpcmVkU3RyYXRlZ3kgPSBcIm9iamVjdFwiO1xuICAgIH1cblxuICAgIGlmKGRlc2lyZWRTdHJhdGVneSA9PT0gXCJzY3JvbGxcIikge1xuICAgICAgICBkZXRlY3Rpb25TdHJhdGVneSA9IHNjcm9sbFN0cmF0ZWd5TWFrZXIoc3RyYXRlZ3lPcHRpb25zKTtcbiAgICB9IGVsc2UgaWYoZGVzaXJlZFN0cmF0ZWd5ID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIGRldGVjdGlvblN0cmF0ZWd5ID0gb2JqZWN0U3RyYXRlZ3lNYWtlcihzdHJhdGVneU9wdGlvbnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgc3RyYXRlZ3kgbmFtZTogXCIgKyBkZXNpcmVkU3RyYXRlZ3kpO1xuICAgIH1cblxuICAgIC8vQ2FsbHMgY2FuIGJlIG1hZGUgdG8gbGlzdGVuVG8gd2l0aCBlbGVtZW50cyB0aGF0IGFyZSBzdGlsbCBhcmUgYmVpbmcgaW5zdGFsbGVkLlxuICAgIC8vQWxzbywgc2FtZSBlbGVtZW50cyBjYW4gb2NjdXIgaW4gdGhlIGVsZW1lbnRzIGxpc3QgaW4gdGhlIGxpc3RlblRvIGZ1bmN0aW9uLlxuICAgIC8vV2l0aCB0aGlzIG1hcCwgdGhlIHJlYWR5IGNhbGxiYWNrcyBjYW4gYmUgc3luY2hyb25pemVkIGJldHdlZW4gdGhlIGNhbGxzXG4gICAgLy9zbyB0aGF0IHRoZSByZWFkeSBjYWxsYmFjayBjYW4gYWx3YXlzIGJlIGNhbGxlZCB3aGVuIGFuIGVsZW1lbnQgaXMgcmVhZHkgLSBldmVuIGlmXG4gICAgLy9pdCB3YXNuJ3QgaW5zdGFsbGVkIGZyb20gdGhlIGZ1bmN0aW9uIGludHNlbGYuXG4gICAgdmFyIG9uUmVhZHlDYWxsYmFja3MgPSB7fTtcblxuICAgIC8qKlxuICAgICAqIE1ha2VzIHRoZSBnaXZlbiBlbGVtZW50cyByZXNpemUtZGV0ZWN0YWJsZSBhbmQgc3RhcnRzIGxpc3RlbmluZyB0byByZXNpemUgZXZlbnRzIG9uIHRoZSBlbGVtZW50cy4gQ2FsbHMgdGhlIGV2ZW50IGNhbGxiYWNrIGZvciBlYWNoIGV2ZW50IGZvciBlYWNoIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7T3B0aW9ucz99IG9wdGlvbnMgT3B0aW9uYWwgb3B0aW9ucyBvYmplY3QuIFRoZXNlIG9wdGlvbnMgd2lsbCBvdmVycmlkZSB0aGUgZ2xvYmFsIG9wdGlvbnMuIFNvbWUgb3B0aW9ucyBtYXkgbm90IGJlIG92ZXJyaWRlbiwgc3VjaCBhcyBpZEhhbmRsZXIuXG4gICAgICogQHBhcmFtIHtlbGVtZW50W118ZWxlbWVudH0gZWxlbWVudHMgVGhlIGdpdmVuIGFycmF5IG9mIGVsZW1lbnRzIHRvIGRldGVjdCByZXNpemUgZXZlbnRzIG9mLiBTaW5nbGUgZWxlbWVudCBpcyBhbHNvIHZhbGlkLlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGxpc3RlbmVyIFRoZSBjYWxsYmFjayB0byBiZSBleGVjdXRlZCBmb3IgZWFjaCByZXNpemUgZXZlbnQgZm9yIGVhY2ggZWxlbWVudC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBsaXN0ZW5UbyhvcHRpb25zLCBlbGVtZW50cywgbGlzdGVuZXIpIHtcbiAgICAgICAgZnVuY3Rpb24gb25SZXNpemVDYWxsYmFjayhlbGVtZW50KSB7XG4gICAgICAgICAgICB2YXIgbGlzdGVuZXJzID0gZXZlbnRMaXN0ZW5lckhhbmRsZXIuZ2V0KGVsZW1lbnQpO1xuXG4gICAgICAgICAgICBmb3JFYWNoKGxpc3RlbmVycywgZnVuY3Rpb24gY2FsbExpc3RlbmVyUHJveHkobGlzdGVuZXIpIHtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcihlbGVtZW50KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkTGlzdGVuZXIoY2FsbE9uQWRkLCBlbGVtZW50LCBsaXN0ZW5lcikge1xuICAgICAgICAgICAgZXZlbnRMaXN0ZW5lckhhbmRsZXIuYWRkKGVsZW1lbnQsIGxpc3RlbmVyKTtcblxuICAgICAgICAgICAgaWYoY2FsbE9uQWRkKSB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIoZWxlbWVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvL09wdGlvbnMgb2JqZWN0IG1heSBiZSBvbWl0dGVkLlxuICAgICAgICBpZighbGlzdGVuZXIpIHtcbiAgICAgICAgICAgIGxpc3RlbmVyID0gZWxlbWVudHM7XG4gICAgICAgICAgICBlbGVtZW50cyA9IG9wdGlvbnM7XG4gICAgICAgICAgICBvcHRpb25zID0ge307XG4gICAgICAgIH1cblxuICAgICAgICBpZighZWxlbWVudHMpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkF0IGxlYXN0IG9uZSBlbGVtZW50IHJlcXVpcmVkLlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCFsaXN0ZW5lcikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTGlzdGVuZXIgcmVxdWlyZWQuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoZWxlbWVudHMubGVuZ3RoID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGVsZW1lbnRzID0gW2VsZW1lbnRzXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBlbGVtZW50c1JlYWR5ID0gMDtcblxuICAgICAgICB2YXIgY2FsbE9uQWRkID0gZ2V0T3B0aW9uKG9wdGlvbnMsIFwiY2FsbE9uQWRkXCIsIGdsb2JhbE9wdGlvbnMuY2FsbE9uQWRkKTtcbiAgICAgICAgdmFyIG9uUmVhZHlDYWxsYmFjayA9IGdldE9wdGlvbihvcHRpb25zLCBcIm9uUmVhZHlcIiwgZnVuY3Rpb24gbm9vcCgpIHt9KTtcblxuICAgICAgICBmb3JFYWNoKGVsZW1lbnRzLCBmdW5jdGlvbiBhdHRhY2hMaXN0ZW5lclRvRWxlbWVudChlbGVtZW50KSB7XG4gICAgICAgICAgICB2YXIgaWQgPSBpZEhhbmRsZXIuZ2V0KGVsZW1lbnQpO1xuXG4gICAgICAgICAgICBpZighZWxlbWVudFV0aWxzLmlzRGV0ZWN0YWJsZShlbGVtZW50KSkge1xuICAgICAgICAgICAgICAgIGlmKGVsZW1lbnRVdGlscy5pc0J1c3koZWxlbWVudCkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy9UaGUgZWxlbWVudCBpcyBiZWluZyBwcmVwYXJlZCB0byBiZSBkZXRlY3RhYmxlLiBEbyBub3QgbWFrZSBpdCBkZXRlY3RhYmxlLlxuICAgICAgICAgICAgICAgICAgICAvL0p1c3QgYWRkIHRoZSBsaXN0ZW5lciwgYmVjYXVzZSB0aGUgZWxlbWVudCB3aWxsIHNvb24gYmUgZGV0ZWN0YWJsZS5cbiAgICAgICAgICAgICAgICAgICAgYWRkTGlzdGVuZXIoY2FsbE9uQWRkLCBlbGVtZW50LCBsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgICAgIG9uUmVhZHlDYWxsYmFja3NbaWRdID0gb25SZWFkeUNhbGxiYWNrc1tpZF0gfHwgW107XG4gICAgICAgICAgICAgICAgICAgIG9uUmVhZHlDYWxsYmFja3NbaWRdLnB1c2goZnVuY3Rpb24gb25SZWFkeSgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzUmVhZHkrKztcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoZWxlbWVudHNSZWFkeSA9PT0gZWxlbWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb25SZWFkeUNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy9UaGUgZWxlbWVudCBpcyBub3QgcHJlcGFyZWQgdG8gYmUgZGV0ZWN0YWJsZSwgc28gZG8gcHJlcGFyZSBpdCBhbmQgYWRkIGEgbGlzdGVuZXIgdG8gaXQuXG4gICAgICAgICAgICAgICAgZWxlbWVudFV0aWxzLm1hcmtCdXN5KGVsZW1lbnQsIHRydWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiBkZXRlY3Rpb25TdHJhdGVneS5tYWtlRGV0ZWN0YWJsZShlbGVtZW50LCBmdW5jdGlvbiBvbkVsZW1lbnREZXRlY3RhYmxlKGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudFV0aWxzLm1hcmtBc0RldGVjdGFibGUoZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRVdGlscy5tYXJrQnVzeShlbGVtZW50LCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgIGRldGVjdGlvblN0cmF0ZWd5LmFkZExpc3RlbmVyKGVsZW1lbnQsIG9uUmVzaXplQ2FsbGJhY2spO1xuICAgICAgICAgICAgICAgICAgICBhZGRMaXN0ZW5lcihjYWxsT25BZGQsIGVsZW1lbnQsIGxpc3RlbmVyKTtcblxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50c1JlYWR5Kys7XG4gICAgICAgICAgICAgICAgICAgIGlmKGVsZW1lbnRzUmVhZHkgPT09IGVsZW1lbnRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgb25SZWFkeUNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZihvblJlYWR5Q2FsbGJhY2tzW2lkXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yRWFjaChvblJlYWR5Q2FsbGJhY2tzW2lkXSwgZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgb25SZWFkeUNhbGxiYWNrc1tpZF07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9UaGUgZWxlbWVudCBoYXMgYmVlbiBwcmVwYXJlZCB0byBiZSBkZXRlY3RhYmxlIGFuZCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCB0by5cbiAgICAgICAgICAgIGFkZExpc3RlbmVyKGNhbGxPbkFkZCwgZWxlbWVudCwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgZWxlbWVudHNSZWFkeSsrO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZihlbGVtZW50c1JlYWR5ID09PSBlbGVtZW50cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIG9uUmVhZHlDYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgbGlzdGVuVG86IGxpc3RlblRvXG4gICAgfTtcbn07XG5cbmZ1bmN0aW9uIGdldE9wdGlvbihvcHRpb25zLCBuYW1lLCBkZWZhdWx0VmFsdWUpIHtcbiAgICB2YXIgdmFsdWUgPSBvcHRpb25zW25hbWVdO1xuXG4gICAgaWYoKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpICYmIGRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0VmFsdWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHZhbHVlO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIHZhciBnZXRTdGF0ZSA9IG9wdGlvbnMuc3RhdGVIYW5kbGVyLmdldFN0YXRlO1xuXG4gICAgLyoqXG4gICAgICogVGVsbHMgaWYgdGhlIGVsZW1lbnQgaGFzIGJlZW4gbWFkZSBkZXRlY3RhYmxlIGFuZCByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGV2ZW50cy5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBUaGUgZWxlbWVudCB0byBjaGVjay5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBvciBmYWxzZSBkZXBlbmRpbmcgb24gaWYgdGhlIGVsZW1lbnQgaXMgZGV0ZWN0YWJsZSBvciBub3QuXG4gICAgICovXG4gICAgZnVuY3Rpb24gaXNEZXRlY3RhYmxlKGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuICEhZ2V0U3RhdGUoZWxlbWVudCkuaXNEZXRlY3RhYmxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1hcmtzIHRoZSBlbGVtZW50IHRoYXQgaXQgaGFzIGJlZW4gbWFkZSBkZXRlY3RhYmxlIGFuZCByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGV2ZW50cy5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBUaGUgZWxlbWVudCB0byBtYXJrLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIG1hcmtBc0RldGVjdGFibGUoZWxlbWVudCkge1xuICAgICAgICBnZXRTdGF0ZShlbGVtZW50KS5pc0RldGVjdGFibGUgPSB0cnVlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRlbGxzIGlmIHRoZSBlbGVtZW50IGlzIGJ1c3kgb3Igbm90LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IFRoZSBlbGVtZW50IHRvIGNoZWNrLlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIG9yIGZhbHNlIGRlcGVuZGluZyBvbiBpZiB0aGUgZWxlbWVudCBpcyBidXN5IG9yIG5vdC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpc0J1c3koZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gISFnZXRTdGF0ZShlbGVtZW50KS5idXN5O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1hcmtzIHRoZSBvYmplY3QgaXMgYnVzeSBhbmQgc2hvdWxkIG5vdCBiZSBtYWRlIGRldGVjdGFibGUuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0byBtYXJrLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gYnVzeSBJZiB0aGUgZWxlbWVudCBpcyBidXN5IG9yIG5vdC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBtYXJrQnVzeShlbGVtZW50LCBidXN5KSB7XG4gICAgICAgIGdldFN0YXRlKGVsZW1lbnQpLmJ1c3kgPSAhIWJ1c3k7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgaXNEZXRlY3RhYmxlOiBpc0RldGVjdGFibGUsXG4gICAgICAgIG1hcmtBc0RldGVjdGFibGU6IG1hcmtBc0RldGVjdGFibGUsXG4gICAgICAgIGlzQnVzeTogaXNCdXN5LFxuICAgICAgICBtYXJrQnVzeTogbWFya0J1c3lcbiAgICB9O1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBpZENvdW50ID0gMTtcblxuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlcyBhIG5ldyB1bmlxdWUgaWQgaW4gdGhlIGNvbnRleHQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9IEEgdW5pcXVlIGlkIGluIHRoZSBjb250ZXh0LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdlbmVyYXRlKCkge1xuICAgICAgICByZXR1cm4gaWRDb3VudCsrO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGdlbmVyYXRlOiBnZW5lcmF0ZVxuICAgIH07XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oaWRHZW5lcmF0b3IpIHtcbiAgICB2YXIgSURfUFJPUF9OQU1FID0gXCJfZXJkVGFyZ2V0SWRcIjtcblxuICAgIC8qKlxuICAgICAqIEdldHMgdGhlIHJlc2l6ZSBkZXRlY3RvciBpZCBvZiB0aGUgZWxlbWVudC4gSWYgdGhlIGVsZW1lbnQgZG9lcyBub3QgaGF2ZSBhbiBpZCwgb25lIHdpbGwgYmUgYXNzaWduZWQgdG8gdGhlIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgdGFyZ2V0IGVsZW1lbnQgdG8gZ2V0IHRoZSBpZCBvZi5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW4/fSByZWFkb25seSBBbiBpZCB3aWxsIG5vdCBiZSBhc3NpZ25lZCB0byB0aGUgZWxlbWVudCBpZiB0aGUgcmVhZG9ubHkgcGFyYW1ldGVyIGlzIHRydWUuIERlZmF1bHQgaXMgZmFsc2UuXG4gICAgICogQHJldHVybnMge3N0cmluZ3xudW1iZXJ9IFRoZSBpZCBvZiB0aGUgZWxlbWVudC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRJZChlbGVtZW50LCByZWFkb25seSkge1xuICAgICAgICBpZighcmVhZG9ubHkgJiYgIWhhc0lkKGVsZW1lbnQpKSB7XG4gICAgICAgICAgICBzZXRJZChlbGVtZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBlbGVtZW50W0lEX1BST1BfTkFNRV07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0SWQoZWxlbWVudCkge1xuICAgICAgICB2YXIgaWQgPSBpZEdlbmVyYXRvci5nZW5lcmF0ZSgpO1xuXG4gICAgICAgIGVsZW1lbnRbSURfUFJPUF9OQU1FXSA9IGlkO1xuXG4gICAgICAgIHJldHVybiBpZDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBoYXNJZChlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50W0lEX1BST1BfTkFNRV0gIT09IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBnZXQ6IGdldElkXG4gICAgfTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihpZEhhbmRsZXIpIHtcbiAgICB2YXIgZXZlbnRMaXN0ZW5lcnMgPSB7fTtcblxuICAgIC8qKlxuICAgICAqIEdldHMgYWxsIGxpc3RlbmVycyBmb3IgdGhlIGdpdmVuIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0byBnZXQgYWxsIGxpc3RlbmVycyBmb3IuXG4gICAgICogQHJldHVybnMgQWxsIGxpc3RlbmVycyBmb3IgdGhlIGdpdmVuIGVsZW1lbnQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0TGlzdGVuZXJzKGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGV2ZW50TGlzdGVuZXJzW2lkSGFuZGxlci5nZXQoZWxlbWVudCldO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN0b3JlcyB0aGUgZ2l2ZW4gbGlzdGVuZXIgZm9yIHRoZSBnaXZlbiBlbGVtZW50LiBXaWxsIG5vdCBhY3R1YWxseSBhZGQgdGhlIGxpc3RlbmVyIHRvIHRoZSBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdGhhdCBzaG91bGQgaGF2ZSB0aGUgbGlzdGVuZXIgYWRkZWQuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gbGlzdGVuZXIgVGhlIGNhbGxiYWNrIHRoYXQgdGhlIGVsZW1lbnQgaGFzIGFkZGVkLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGFkZExpc3RlbmVyKGVsZW1lbnQsIGxpc3RlbmVyKSB7XG4gICAgICAgIHZhciBpZCA9IGlkSGFuZGxlci5nZXQoZWxlbWVudCk7XG5cbiAgICAgICAgaWYoIWV2ZW50TGlzdGVuZXJzW2lkXSkge1xuICAgICAgICAgICAgZXZlbnRMaXN0ZW5lcnNbaWRdID0gW107XG4gICAgICAgIH1cblxuICAgICAgICBldmVudExpc3RlbmVyc1tpZF0ucHVzaChsaXN0ZW5lcik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ2V0OiBnZXRMaXN0ZW5lcnMsXG4gICAgICAgIGFkZDogYWRkTGlzdGVuZXJcbiAgICB9O1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG4vKiBnbG9iYWwgY29uc29sZTogZmFsc2UgKi9cblxuLyoqXG4gKiBSZXBvcnRlciB0aGF0IGhhbmRsZXMgdGhlIHJlcG9ydGluZyBvZiBsb2dzLCB3YXJuaW5ncyBhbmQgZXJyb3JzLlxuICogQHB1YmxpY1xuICogQHBhcmFtIHtib29sZWFufSBxdWlldCBUZWxscyBpZiB0aGUgcmVwb3J0ZXIgc2hvdWxkIGJlIHF1aWV0IG9yIG5vdC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihxdWlldCkge1xuICAgIGZ1bmN0aW9uIG5vb3AoKSB7XG4gICAgICAgIC8vRG9lcyBub3RoaW5nLlxuICAgIH1cblxuICAgIHZhciByZXBvcnRlciA9IHtcbiAgICAgICAgbG9nOiBub29wLFxuICAgICAgICB3YXJuOiBub29wLFxuICAgICAgICBlcnJvcjogbm9vcFxuICAgIH07XG5cbiAgICBpZighcXVpZXQgJiYgd2luZG93LmNvbnNvbGUpIHtcbiAgICAgICAgdmFyIGF0dGFjaEZ1bmN0aW9uID0gZnVuY3Rpb24ocmVwb3J0ZXIsIG5hbWUpIHtcbiAgICAgICAgICAgIC8vVGhlIHByb3h5IGlzIG5lZWRlZCB0byBiZSBhYmxlIHRvIGNhbGwgdGhlIG1ldGhvZCB3aXRoIHRoZSBjb25zb2xlIGNvbnRleHQsXG4gICAgICAgICAgICAvL3NpbmNlIHdlIGNhbm5vdCB1c2UgYmluZC5cbiAgICAgICAgICAgIHJlcG9ydGVyW25hbWVdID0gZnVuY3Rpb24gcmVwb3J0ZXJQcm94eSgpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlW25hbWVdLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9O1xuXG4gICAgICAgIGF0dGFjaEZ1bmN0aW9uKHJlcG9ydGVyLCBcImxvZ1wiKTtcbiAgICAgICAgYXR0YWNoRnVuY3Rpb24ocmVwb3J0ZXIsIFwid2FyblwiKTtcbiAgICAgICAgYXR0YWNoRnVuY3Rpb24ocmVwb3J0ZXIsIFwiZXJyb3JcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcG9ydGVyO1xufTsiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHByb3AgPSBcIl9lcmRcIjtcblxuZnVuY3Rpb24gaW5pdFN0YXRlKGVsZW1lbnQpIHtcbiAgICBlbGVtZW50W3Byb3BdID0ge307XG4gICAgcmV0dXJuIGdldFN0YXRlKGVsZW1lbnQpO1xufVxuXG5mdW5jdGlvbiBnZXRTdGF0ZShlbGVtZW50KSB7XG4gICAgcmV0dXJuIGVsZW1lbnRbcHJvcF0gfHwgaW5pdFN0YXRlKGVsZW1lbnQpO1xufVxuXG5mdW5jdGlvbiBjbGVhblN0YXRlKGVsZW1lbnQpIHtcbiAgICBkZWxldGUgZWxlbWVudFtwcm9wXTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGluaXRTdGF0ZTogaW5pdFN0YXRlLFxuICBnZXRTdGF0ZTogZ2V0U3RhdGUsXG4gIGNsZWFuU3RhdGU6IGNsZWFuU3RhdGVcbn07XG4iXX0=
