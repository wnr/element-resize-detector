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
                element._erdObject = object;

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
        return element._erdObject;
    }

    function removeObject(element) {
        element.removeChild(getObject(element));
        delete element._erdObject;
    }

    function removeListeners(element) {
        removeObject(element);
    }

    return {
        makeDetectable: makeDetectable,
        addListener: addListener,
        removeListeners: removeListeners
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
            element._erdElement = container;

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
        return element._erdElement.childNodes[0];
    }

    function getExpandChildElement(element) {
        return getExpandElement(element).childNodes[0];
    }

    function getShrinkElement(element) {
        return element._erdElement.childNodes[1];
    }

    function removeErdElement(element) {
        element.removeChild(element._erdElement);
        delete element._erdElement;
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

    function removeListeners(element) {
      removeErdElement(element);
    }

    return {
        makeDetectable: makeDetectable,
        addListener: addListener,
        removeListeners: removeListeners
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
    var elementUtils            = elementUtilsMaker();

    //The detection strategy to be used.
    var detectionStrategy;
    var desiredStrategy = getOption(options, "strategy", "object");
    var strategyOptions = {
        reporter: reporter,
        batchProcessor: batchProcessor
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

    function detach(element) {
      eventListenerHandler.remove(element);
      detectionStrategy.removeListeners(element);
    }

    return {
        listenTo: listenTo,
        detach: detach
    };
};

function getOption(options, name, defaultValue) {
    var value = options[name];

    if((value === undefined || value === null) && defaultValue !== undefined) {
        return defaultValue;
    }

    return value;
}

},{"./browser-detector":3,"./collection-utils":4,"./detection-strategy/object.js":5,"./detection-strategy/scroll.js":6,"./element-utils":8,"./id-generator":9,"./id-handler":10,"./listener-handler":11,"./reporter":12,"batch-processor":1}],8:[function(require,module,exports){
"use strict";

module.exports = function() {
    /**
     * Tells if the element has been made detectable and ready to be listened for resize events.
     * @public
     * @param {element} The element to check.
     * @returns {boolean} True or false depending on if the element is detectable or not.
     */
    function isDetectable(element) {
        return !!element._erdIsDetectable;
    }

    /**
     * Marks the element that it has been made detectable and ready to be listened for resize events.
     * @public
     * @param {element} The element to mark.
     */
    function markAsDetectable(element) {
        element._erdIsDetectable = true;
    }

    /**
     * Tells if the element is busy or not.
     * @public
     * @param {element} The element to check.
     * @returns {boolean} True or false depending on if the element is busy or not.
     */
    function isBusy(element) {
        return !!element._erdBusy;
    }

    /**
     * Marks the object is busy and should not be made detectable.
     * @public
     * @param {element} element The element to mark.
     * @param {boolean} busy If the element is busy or not.
     */
    function markBusy(element, busy) {
        element._erdBusy = !!busy;
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

    function removeId(element) {
        delete element[ID_PROP_NAME];
    }

    return {
        get: getId,
        remove: removeId
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

    function removeListener(element) {
        var id = idHandler.get(element);
        idHandler.remove(element);
        delete eventListeners[id];
    }

    return {
        get: getListeners,
        add: addListener,
        remove: removeListener
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
},{}]},{},[7])(7)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYmF0Y2gtcHJvY2Vzc29yL3NyYy9iYXRjaC1wcm9jZXNzb3IuanMiLCJub2RlX21vZHVsZXMvYmF0Y2gtcHJvY2Vzc29yL3NyYy91dGlscy5qcyIsInNyYy9icm93c2VyLWRldGVjdG9yLmpzIiwic3JjL2NvbGxlY3Rpb24tdXRpbHMuanMiLCJzcmMvZGV0ZWN0aW9uLXN0cmF0ZWd5L29iamVjdC5qcyIsInNyYy9kZXRlY3Rpb24tc3RyYXRlZ3kvc2Nyb2xsLmpzIiwic3JjL2VsZW1lbnQtcmVzaXplLWRldGVjdG9yLmpzIiwic3JjL2VsZW1lbnQtdXRpbHMuanMiLCJzcmMvaWQtZ2VuZXJhdG9yLmpzIiwic3JjL2lkLWhhbmRsZXIuanMiLCJzcmMvbGlzdGVuZXItaGFuZGxlci5qcyIsInNyYy9yZXBvcnRlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMVJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDek5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIik7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYmF0Y2hQcm9jZXNzb3JNYWtlcihvcHRpb25zKSB7XG4gICAgb3B0aW9ucyAgICAgICAgICAgICA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIHJlcG9ydGVyICAgICAgICA9IG9wdGlvbnMucmVwb3J0ZXI7XG4gICAgdmFyIGFzeW5jUHJvY2VzcyAgICA9IHV0aWxzLmdldE9wdGlvbihvcHRpb25zLCBcImFzeW5jXCIsIHRydWUpO1xuICAgIHZhciBhdXRvUHJvY2VzcyAgICAgPSB1dGlscy5nZXRPcHRpb24ob3B0aW9ucywgXCJhdXRvXCIsIHRydWUpO1xuXG4gICAgaWYoYXV0b1Byb2Nlc3MgJiYgIWFzeW5jUHJvY2Vzcykge1xuICAgICAgICByZXBvcnRlciAmJiByZXBvcnRlci53YXJuKFwiSW52YWxpZCBvcHRpb25zIGNvbWJpbmF0aW9uLiBhdXRvPXRydWUgYW5kIGFzeW5jPWZhbHNlIGlzIGludmFsaWQuIFNldHRpbmcgYXN5bmM9dHJ1ZS5cIik7XG4gICAgICAgIGFzeW5jUHJvY2VzcyA9IHRydWU7XG4gICAgfVxuXG4gICAgdmFyIGJhdGNoO1xuICAgIHZhciBiYXRjaFNpemU7XG4gICAgdmFyIHRvcExldmVsO1xuICAgIHZhciBib3R0b21MZXZlbDtcblxuICAgIGNsZWFyQmF0Y2goKTtcblxuICAgIHZhciBhc3luY0ZyYW1lSGFuZGxlcjtcblxuICAgIGZ1bmN0aW9uIGFkZEZ1bmN0aW9uKGxldmVsLCBmbikge1xuICAgICAgICBpZighZm4pIHtcbiAgICAgICAgICAgIGZuID0gbGV2ZWw7XG4gICAgICAgICAgICBsZXZlbCA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICBpZihsZXZlbCA+IHRvcExldmVsKSB7XG4gICAgICAgICAgICB0b3BMZXZlbCA9IGxldmVsO1xuICAgICAgICB9IGVsc2UgaWYobGV2ZWwgPCBib3R0b21MZXZlbCkge1xuICAgICAgICAgICAgYm90dG9tTGV2ZWwgPSBsZXZlbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCFiYXRjaFtsZXZlbF0pIHtcbiAgICAgICAgICAgIGJhdGNoW2xldmVsXSA9IFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoYXV0b1Byb2Nlc3MgJiYgYXN5bmNQcm9jZXNzICYmIGJhdGNoU2l6ZSA9PT0gMCkge1xuICAgICAgICAgICAgcHJvY2Vzc0JhdGNoQXN5bmMoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJhdGNoW2xldmVsXS5wdXNoKGZuKTtcbiAgICAgICAgYmF0Y2hTaXplKys7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZm9yY2VQcm9jZXNzQmF0Y2gobG9jYWxBc3luY1Byb2Nlc3MpIHtcbiAgICAgICAgaWYobG9jYWxBc3luY1Byb2Nlc3MgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgbG9jYWxBc3luY1Byb2Nlc3MgPSBhc3luY1Byb2Nlc3M7XG4gICAgICAgIH1cblxuICAgICAgICBpZihhc3luY0ZyYW1lSGFuZGxlcikge1xuICAgICAgICAgICAgY2FuY2VsRnJhbWUoYXN5bmNGcmFtZUhhbmRsZXIpO1xuICAgICAgICAgICAgYXN5bmNGcmFtZUhhbmRsZXIgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYobG9jYWxBc3luY1Byb2Nlc3MpIHtcbiAgICAgICAgICAgIHByb2Nlc3NCYXRjaEFzeW5jKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm9jZXNzQmF0Y2goKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHByb2Nlc3NCYXRjaCgpIHtcbiAgICAgICAgZm9yKHZhciBsZXZlbCA9IGJvdHRvbUxldmVsOyBsZXZlbCA8PSB0b3BMZXZlbDsgbGV2ZWwrKykge1xuICAgICAgICAgICAgdmFyIGZucyA9IGJhdGNoW2xldmVsXTtcblxuICAgICAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IGZucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBmbiA9IGZuc1tpXTtcbiAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNsZWFyQmF0Y2goKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwcm9jZXNzQmF0Y2hBc3luYygpIHtcbiAgICAgICAgYXN5bmNGcmFtZUhhbmRsZXIgPSByZXF1ZXN0RnJhbWUocHJvY2Vzc0JhdGNoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjbGVhckJhdGNoKCkge1xuICAgICAgICBiYXRjaCAgICAgICAgICAgPSB7fTtcbiAgICAgICAgYmF0Y2hTaXplICAgICAgID0gMDtcbiAgICAgICAgdG9wTGV2ZWwgICAgICAgID0gMDtcbiAgICAgICAgYm90dG9tTGV2ZWwgICAgID0gMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjYW5jZWxGcmFtZShsaXN0ZW5lcikge1xuICAgICAgICAvLyB2YXIgY2FuY2VsID0gd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy5tb3pDYW5jZWxBbmltYXRpb25GcmFtZSB8fCB3aW5kb3cud2Via2l0Q2FuY2VsQW5pbWF0aW9uRnJhbWUgfHwgd2luZG93LmNsZWFyVGltZW91dDtcbiAgICAgICAgdmFyIGNhbmNlbCA9IHdpbmRvdy5jbGVhclRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBjYW5jZWwobGlzdGVuZXIpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlcXVlc3RGcmFtZShjYWxsYmFjaykge1xuICAgICAgICAvLyB2YXIgcmFmID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSB8fCB3aW5kb3cubW96UmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy53ZWJraXRSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHwgZnVuY3Rpb24oZm4pIHsgcmV0dXJuIHdpbmRvdy5zZXRUaW1lb3V0KGZuLCAyMCk7IH07XG4gICAgICAgIHZhciByYWYgPSBmdW5jdGlvbihmbikgeyByZXR1cm4gd2luZG93LnNldFRpbWVvdXQoZm4sIDApOyB9O1xuICAgICAgICByZXR1cm4gcmFmKGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBhZGQ6IGFkZEZ1bmN0aW9uLFxuICAgICAgICBmb3JjZTogZm9yY2VQcm9jZXNzQmF0Y2hcbiAgICB9O1xufTsiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxudXRpbHMuZ2V0T3B0aW9uID0gZ2V0T3B0aW9uO1xuXG5mdW5jdGlvbiBnZXRPcHRpb24ob3B0aW9ucywgbmFtZSwgZGVmYXVsdFZhbHVlKSB7XG4gICAgdmFyIHZhbHVlID0gb3B0aW9uc1tuYW1lXTtcblxuICAgIGlmKCh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSAmJiBkZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICAgIH1cblxuICAgIHJldHVybiB2YWx1ZTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZGV0ZWN0b3IgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG5kZXRlY3Rvci5pc0lFID0gZnVuY3Rpb24odmVyc2lvbikge1xuICAgIGZ1bmN0aW9uIGlzQW55SWVWZXJzaW9uKCkge1xuICAgICAgICB2YXIgYWdlbnQgPSBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIHJldHVybiBhZ2VudC5pbmRleE9mKFwibXNpZVwiKSAhPT0gLTEgfHwgYWdlbnQuaW5kZXhPZihcInRyaWRlbnRcIikgIT09IC0xIHx8IGFnZW50LmluZGV4T2YoXCIgZWRnZS9cIikgIT09IC0xO1xuICAgIH1cblxuICAgIGlmKCFpc0FueUllVmVyc2lvbigpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBpZighdmVyc2lvbikge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvL1NoYW1lbGVzc2x5IHN0b2xlbiBmcm9tIGh0dHBzOi8vZ2lzdC5naXRodWIuY29tL3BhZG9sc2V5LzUyNzY4M1xuICAgIHZhciBpZVZlcnNpb24gPSAoZnVuY3Rpb24oKXtcbiAgICAgICAgdmFyIHVuZGVmLFxuICAgICAgICAgICAgdiA9IDMsXG4gICAgICAgICAgICBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLFxuICAgICAgICAgICAgYWxsID0gZGl2LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiaVwiKTtcblxuICAgICAgICBkbyB7XG4gICAgICAgICAgICBkaXYuaW5uZXJIVE1MID0gXCI8IS0tW2lmIGd0IElFIFwiICsgKCsrdikgKyBcIl0+PGk+PC9pPjwhW2VuZGlmXS0tPlwiO1xuICAgICAgICB9XG4gICAgICAgIHdoaWxlIChhbGxbMF0pO1xuXG4gICAgICAgIHJldHVybiB2ID4gNCA/IHYgOiB1bmRlZjtcbiAgICB9KCkpO1xuXG4gICAgcmV0dXJuIHZlcnNpb24gPT09IGllVmVyc2lvbjtcbn07XG5cbmRldGVjdG9yLmlzTGVnYWN5T3BlcmEgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gISF3aW5kb3cub3BlcmE7XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8qKlxuICogTG9vcHMgdGhyb3VnaCB0aGUgY29sbGVjdGlvbiBhbmQgY2FsbHMgdGhlIGNhbGxiYWNrIGZvciBlYWNoIGVsZW1lbnQuIGlmIHRoZSBjYWxsYmFjayByZXR1cm5zIHRydXRoeSwgdGhlIGxvb3AgaXMgYnJva2VuIGFuZCByZXR1cm5zIHRoZSBzYW1lIHZhbHVlLlxuICogQHB1YmxpY1xuICogQHBhcmFtIHsqfSBjb2xsZWN0aW9uIFRoZSBjb2xsZWN0aW9uIHRvIGxvb3AgdGhyb3VnaC4gTmVlZHMgdG8gaGF2ZSBhIGxlbmd0aCBwcm9wZXJ0eSBzZXQgYW5kIGhhdmUgaW5kaWNlcyBzZXQgZnJvbSAwIHRvIGxlbmd0aCAtIDEuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIGZvciBlYWNoIGVsZW1lbnQuIFRoZSBlbGVtZW50IHdpbGwgYmUgZ2l2ZW4gYXMgYSBwYXJhbWV0ZXIgdG8gdGhlIGNhbGxiYWNrLiBJZiB0aGlzIGNhbGxiYWNrIHJldHVybnMgdHJ1dGh5LCB0aGUgbG9vcCBpcyBicm9rZW4gYW5kIHRoZSBzYW1lIHZhbHVlIGlzIHJldHVybmVkLlxuICogQHJldHVybnMgeyp9IFRoZSB2YWx1ZSB0aGF0IGEgY2FsbGJhY2sgaGFzIHJldHVybmVkIChpZiB0cnV0aHkpLiBPdGhlcndpc2Ugbm90aGluZy5cbiAqL1xudXRpbHMuZm9yRWFjaCA9IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIGNhbGxiYWNrKSB7XG4gICAgZm9yKHZhciBpID0gMDsgaSA8IGNvbGxlY3Rpb24ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9IGNhbGxiYWNrKGNvbGxlY3Rpb25baV0pO1xuICAgICAgICBpZihyZXN1bHQpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICB9XG59O1xuIiwiLyoqXG4gKiBSZXNpemUgZGV0ZWN0aW9uIHN0cmF0ZWd5IHRoYXQgaW5qZWN0cyBvYmplY3RzIHRvIGVsZW1lbnRzIGluIG9yZGVyIHRvIGRldGVjdCByZXNpemUgZXZlbnRzLlxuICogSGVhdmlseSBpbnNwaXJlZCBieTogaHR0cDovL3d3dy5iYWNrYWxsZXljb2Rlci5jb20vMjAxMy8wMy8xOC9jcm9zcy1icm93c2VyLWV2ZW50LWJhc2VkLWVsZW1lbnQtcmVzaXplLWRldGVjdGlvbi9cbiAqL1xuXG5cInVzZSBzdHJpY3RcIjtcblxudmFyIGJyb3dzZXJEZXRlY3RvciA9IHJlcXVpcmUoXCIuLi9icm93c2VyLWRldGVjdG9yXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICBvcHRpb25zICAgICAgICAgICAgID0gb3B0aW9ucyB8fCB7fTtcbiAgICB2YXIgcmVwb3J0ZXIgICAgICAgID0gb3B0aW9ucy5yZXBvcnRlcjtcbiAgICB2YXIgYmF0Y2hQcm9jZXNzb3IgID0gb3B0aW9ucy5iYXRjaFByb2Nlc3NvcjtcblxuICAgIGlmKCFyZXBvcnRlcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJNaXNzaW5nIHJlcXVpcmVkIGRlcGVuZGVuY3k6IHJlcG9ydGVyLlwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgcmVzaXplIGV2ZW50IGxpc3RlbmVyIHRvIHRoZSBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdGhhdCBzaG91bGQgaGF2ZSB0aGUgbGlzdGVuZXIgYWRkZWQuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gbGlzdGVuZXIgVGhlIGxpc3RlbmVyIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCBmb3IgZWFjaCByZXNpemUgZXZlbnQgb2YgdGhlIGVsZW1lbnQuIFRoZSBlbGVtZW50IHdpbGwgYmUgZ2l2ZW4gYXMgYSBwYXJhbWV0ZXIgdG8gdGhlIGxpc3RlbmVyIGNhbGxiYWNrLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGFkZExpc3RlbmVyKGVsZW1lbnQsIGxpc3RlbmVyKSB7XG4gICAgICAgIGlmKCFnZXRPYmplY3QoZWxlbWVudCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkVsZW1lbnQgaXMgbm90IGRldGVjdGFibGUgYnkgdGhpcyBzdHJhdGVneS5cIik7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBsaXN0ZW5lclByb3h5KCkge1xuICAgICAgICAgICAgbGlzdGVuZXIoZWxlbWVudCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZihicm93c2VyRGV0ZWN0b3IuaXNJRSg4KSkge1xuICAgICAgICAgICAgLy9JRSA4IGRvZXMgbm90IHN1cHBvcnQgb2JqZWN0LCBidXQgc3VwcG9ydHMgdGhlIHJlc2l6ZSBldmVudCBkaXJlY3RseSBvbiBlbGVtZW50cy5cbiAgICAgICAgICAgIGVsZW1lbnQuYXR0YWNoRXZlbnQoXCJvbnJlc2l6ZVwiLCBsaXN0ZW5lclByb3h5KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBvYmplY3QgPSBnZXRPYmplY3QoZWxlbWVudCk7XG4gICAgICAgICAgICBvYmplY3QuY29udGVudERvY3VtZW50LmRlZmF1bHRWaWV3LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgbGlzdGVuZXJQcm94eSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNYWtlcyBhbiBlbGVtZW50IGRldGVjdGFibGUgYW5kIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgZXZlbnRzLiBXaWxsIGNhbGwgdGhlIGNhbGxiYWNrIHdoZW4gdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBjaGFuZ2VzLlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRvIG1ha2UgZGV0ZWN0YWJsZVxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIFRoZSBjYWxsYmFjayB0byBiZSBjYWxsZWQgd2hlbiB0aGUgZWxlbWVudCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGNoYW5nZXMuIFdpbGwgYmUgY2FsbGVkIHdpdGggdGhlIGVsZW1lbnQgYXMgZmlyc3QgcGFyYW1ldGVyLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIG1ha2VEZXRlY3RhYmxlKGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gICAgICAgIGZ1bmN0aW9uIGluamVjdE9iamVjdChlbGVtZW50LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgdmFyIE9CSkVDVF9TVFlMRSA9IFwiZGlzcGxheTogYmxvY2s7IHBvc2l0aW9uOiBhYnNvbHV0ZTsgdG9wOiAwOyBsZWZ0OiAwOyB3aWR0aDogMTAwJTsgaGVpZ2h0OiAxMDAlOyBib3JkZXI6IG5vbmU7IHBhZGRpbmc6IDA7IG1hcmdpbjogMDsgb3BhY2l0eTogMDsgei1pbmRleDogLTEwMDA7IHBvaW50ZXItZXZlbnRzOiBub25lO1wiO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBvbk9iamVjdExvYWQoKSB7XG4gICAgICAgICAgICAgICAgLypqc2hpbnQgdmFsaWR0aGlzOiB0cnVlICovXG5cbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBnZXREb2N1bWVudChlbGVtZW50LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgICAgICAvL09wZXJhIDEyIHNlZW0gdG8gY2FsbCB0aGUgb2JqZWN0Lm9ubG9hZCBiZWZvcmUgdGhlIGFjdHVhbCBkb2N1bWVudCBoYXMgYmVlbiBjcmVhdGVkLlxuICAgICAgICAgICAgICAgICAgICAvL1NvIGlmIGl0IGlzIG5vdCBwcmVzZW50LCBwb2xsIGl0IHdpdGggYW4gdGltZW91dCB1bnRpbCBpdCBpcyBwcmVzZW50LlxuICAgICAgICAgICAgICAgICAgICAvL1RPRE86IENvdWxkIG1heWJlIGJlIGhhbmRsZWQgYmV0dGVyIHdpdGggb2JqZWN0Lm9ucmVhZHlzdGF0ZWNoYW5nZSBvciBzaW1pbGFyLlxuICAgICAgICAgICAgICAgICAgICBpZighZWxlbWVudC5jb250ZW50RG9jdW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gY2hlY2tGb3JPYmplY3REb2N1bWVudCgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZXREb2N1bWVudChlbGVtZW50LCBjYWxsYmFjayk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCAxMDApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlbGVtZW50LmNvbnRlbnREb2N1bWVudCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy9NdXRhdGluZyB0aGUgb2JqZWN0IGVsZW1lbnQgaGVyZSBzZWVtcyB0byBmaXJlIGFub3RoZXIgbG9hZCBldmVudC5cbiAgICAgICAgICAgICAgICAvL011dGF0aW5nIHRoZSBpbm5lciBkb2N1bWVudCBvZiB0aGUgb2JqZWN0IGVsZW1lbnQgaXMgZmluZSB0aG91Z2guXG4gICAgICAgICAgICAgICAgdmFyIG9iamVjdEVsZW1lbnQgPSB0aGlzO1xuXG4gICAgICAgICAgICAgICAgLy9DcmVhdGUgdGhlIHN0eWxlIGVsZW1lbnQgdG8gYmUgYWRkZWQgdG8gdGhlIG9iamVjdC5cbiAgICAgICAgICAgICAgICBnZXREb2N1bWVudChvYmplY3RFbGVtZW50LCBmdW5jdGlvbiBvbk9iamVjdERvY3VtZW50UmVhZHkob2JqZWN0RG9jdW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy9Ob3RpZnkgdGhhdCB0aGUgZWxlbWVudCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCB0by5cbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vVGhlIHRhcmdldCBlbGVtZW50IG5lZWRzIHRvIGJlIHBvc2l0aW9uZWQgKGV2ZXJ5dGhpbmcgZXhjZXB0IHN0YXRpYykgc28gdGhlIGFic29sdXRlIHBvc2l0aW9uZWQgb2JqZWN0IHdpbGwgYmUgcG9zaXRpb25lZCByZWxhdGl2ZSB0byB0aGUgdGFyZ2V0IGVsZW1lbnQuXG4gICAgICAgICAgICB2YXIgc3R5bGUgPSBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuICAgICAgICAgICAgdmFyIHBvc2l0aW9uID0gc3R5bGUucG9zaXRpb247XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIG11dGF0ZURvbSgpIHtcbiAgICAgICAgICAgICAgICBpZihwb3NpdGlvbiA9PT0gXCJzdGF0aWNcIikge1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gXCJyZWxhdGl2ZVwiO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciByZW1vdmVSZWxhdGl2ZVN0eWxlcyA9IGZ1bmN0aW9uKHJlcG9ydGVyLCBlbGVtZW50LCBzdHlsZSwgcHJvcGVydHkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGdldE51bWVyaWNhbFZhbHVlKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1teLVxcZFxcLl0vZywgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IHN0eWxlW3Byb3BlcnR5XTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYodmFsdWUgIT09IFwiYXV0b1wiICYmIGdldE51bWVyaWNhbFZhbHVlKHZhbHVlKSAhPT0gXCIwXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRlci53YXJuKFwiQW4gZWxlbWVudCB0aGF0IGlzIHBvc2l0aW9uZWQgc3RhdGljIGhhcyBzdHlsZS5cIiArIHByb3BlcnR5ICsgXCI9XCIgKyB2YWx1ZSArIFwiIHdoaWNoIGlzIGlnbm9yZWQgZHVlIHRvIHRoZSBzdGF0aWMgcG9zaXRpb25pbmcuIFRoZSBlbGVtZW50IHdpbGwgbmVlZCB0byBiZSBwb3NpdGlvbmVkIHJlbGF0aXZlLCBzbyB0aGUgc3R5bGUuXCIgKyBwcm9wZXJ0eSArIFwiIHdpbGwgYmUgc2V0IHRvIDAuIEVsZW1lbnQ6IFwiLCBlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlW3Byb3BlcnR5XSA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgICAgLy9DaGVjayBzbyB0aGF0IHRoZXJlIGFyZSBubyBhY2NpZGVudGFsIHN0eWxlcyB0aGF0IHdpbGwgbWFrZSB0aGUgZWxlbWVudCBzdHlsZWQgZGlmZmVyZW50bHkgbm93IHRoYXQgaXMgaXMgcmVsYXRpdmUuXG4gICAgICAgICAgICAgICAgICAgIC8vSWYgdGhlcmUgYXJlIGFueSwgc2V0IHRoZW0gdG8gMCAodGhpcyBzaG91bGQgYmUgb2theSB3aXRoIHRoZSB1c2VyIHNpbmNlIHRoZSBzdHlsZSBwcm9wZXJ0aWVzIGRpZCBub3RoaW5nIGJlZm9yZSBbc2luY2UgdGhlIGVsZW1lbnQgd2FzIHBvc2l0aW9uZWQgc3RhdGljXSBhbnl3YXkpLlxuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIFwidG9wXCIpO1xuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgICAgIHJlbW92ZVJlbGF0aXZlU3R5bGVzKHJlcG9ydGVyLCBlbGVtZW50LCBzdHlsZSwgXCJib3R0b21cIik7XG4gICAgICAgICAgICAgICAgICAgIHJlbW92ZVJlbGF0aXZlU3R5bGVzKHJlcG9ydGVyLCBlbGVtZW50LCBzdHlsZSwgXCJsZWZ0XCIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vQWRkIGFuIG9iamVjdCBlbGVtZW50IGFzIGEgY2hpbGQgdG8gdGhlIHRhcmdldCBlbGVtZW50IHRoYXQgd2lsbCBiZSBsaXN0ZW5lZCB0byBmb3IgcmVzaXplIGV2ZW50cy5cbiAgICAgICAgICAgICAgICB2YXIgb2JqZWN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIm9iamVjdFwiKTtcbiAgICAgICAgICAgICAgICBvYmplY3Quc3R5bGUuY3NzVGV4dCA9IE9CSkVDVF9TVFlMRTtcbiAgICAgICAgICAgICAgICBvYmplY3QudHlwZSA9IFwidGV4dC9odG1sXCI7XG4gICAgICAgICAgICAgICAgb2JqZWN0Lm9ubG9hZCA9IG9uT2JqZWN0TG9hZDtcblxuICAgICAgICAgICAgICAgIC8vU2FmYXJpOiBUaGlzIG11c3Qgb2NjdXIgYmVmb3JlIGFkZGluZyB0aGUgb2JqZWN0IHRvIHRoZSBET00uXG4gICAgICAgICAgICAgICAgLy9JRTogRG9lcyBub3QgbGlrZSB0aGF0IHRoaXMgaGFwcGVucyBiZWZvcmUsIGV2ZW4gaWYgaXQgaXMgYWxzbyBhZGRlZCBhZnRlci5cbiAgICAgICAgICAgICAgICBpZighYnJvd3NlckRldGVjdG9yLmlzSUUoKSkge1xuICAgICAgICAgICAgICAgICAgICBvYmplY3QuZGF0YSA9IFwiYWJvdXQ6YmxhbmtcIjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBlbGVtZW50LmFwcGVuZENoaWxkKG9iamVjdCk7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5fZXJkT2JqZWN0ID0gb2JqZWN0O1xuXG4gICAgICAgICAgICAgICAgLy9JRTogVGhpcyBtdXN0IG9jY3VyIGFmdGVyIGFkZGluZyB0aGUgb2JqZWN0IHRvIHRoZSBET00uXG4gICAgICAgICAgICAgICAgaWYoYnJvd3NlckRldGVjdG9yLmlzSUUoKSkge1xuICAgICAgICAgICAgICAgICAgICBvYmplY3QuZGF0YSA9IFwiYWJvdXQ6YmxhbmtcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKGJhdGNoUHJvY2Vzc29yKSB7XG4gICAgICAgICAgICAgICAgYmF0Y2hQcm9jZXNzb3IuYWRkKG11dGF0ZURvbSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG11dGF0ZURvbSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYoYnJvd3NlckRldGVjdG9yLmlzSUUoOCkpIHtcbiAgICAgICAgICAgIC8vSUUgOCBkb2VzIG5vdCBzdXBwb3J0IG9iamVjdHMgcHJvcGVybHkuIEx1Y2tpbHkgdGhleSBkbyBzdXBwb3J0IHRoZSByZXNpemUgZXZlbnQuXG4gICAgICAgICAgICAvL1NvIGRvIG5vdCBpbmplY3QgdGhlIG9iamVjdCBhbmQgbm90aWZ5IHRoYXQgdGhlIGVsZW1lbnQgaXMgYWxyZWFkeSByZWFkeSB0byBiZSBsaXN0ZW5lZCB0by5cbiAgICAgICAgICAgIC8vVGhlIGV2ZW50IGhhbmRsZXIgZm9yIHRoZSByZXNpemUgZXZlbnQgaXMgYXR0YWNoZWQgaW4gdGhlIHV0aWxzLmFkZExpc3RlbmVyIGluc3RlYWQuXG4gICAgICAgICAgICBjYWxsYmFjayhlbGVtZW50KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluamVjdE9iamVjdChlbGVtZW50LCBjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjaGlsZCBvYmplY3Qgb2YgdGhlIHRhcmdldCBlbGVtZW50LlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSB0YXJnZXQgZWxlbWVudC5cbiAgICAgKiBAcmV0dXJucyBUaGUgb2JqZWN0IGVsZW1lbnQgb2YgdGhlIHRhcmdldC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRPYmplY3QoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZWxlbWVudC5fZXJkT2JqZWN0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbW92ZU9iamVjdChlbGVtZW50KSB7XG4gICAgICAgIGVsZW1lbnQucmVtb3ZlQ2hpbGQoZ2V0T2JqZWN0KGVsZW1lbnQpKTtcbiAgICAgICAgZGVsZXRlIGVsZW1lbnQuX2VyZE9iamVjdDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW1vdmVMaXN0ZW5lcnMoZWxlbWVudCkge1xuICAgICAgICByZW1vdmVPYmplY3QoZWxlbWVudCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgbWFrZURldGVjdGFibGU6IG1ha2VEZXRlY3RhYmxlLFxuICAgICAgICBhZGRMaXN0ZW5lcjogYWRkTGlzdGVuZXIsXG4gICAgICAgIHJlbW92ZUxpc3RlbmVyczogcmVtb3ZlTGlzdGVuZXJzXG4gICAgfTtcbn07XG4iLCIvKipcbiAqIFJlc2l6ZSBkZXRlY3Rpb24gc3RyYXRlZ3kgdGhhdCBpbmplY3RzIGRpdnMgdG8gZWxlbWVudHMgaW4gb3JkZXIgdG8gZGV0ZWN0IHJlc2l6ZSBldmVudHMgb24gc2Nyb2xsIGV2ZW50cy5cbiAqIEhlYXZpbHkgaW5zcGlyZWQgYnk6IGh0dHBzOi8vZ2l0aHViLmNvbS9tYXJjai9jc3MtZWxlbWVudC1xdWVyaWVzL2Jsb2IvbWFzdGVyL3NyYy9SZXNpemVTZW5zb3IuanNcbiAqL1xuXG5cInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgb3B0aW9ucyAgICAgICAgICAgICA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIHJlcG9ydGVyICAgICAgICA9IG9wdGlvbnMucmVwb3J0ZXI7XG4gICAgdmFyIGJhdGNoUHJvY2Vzc29yICA9IG9wdGlvbnMuYmF0Y2hQcm9jZXNzb3I7XG5cbiAgICBpZighcmVwb3J0ZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTWlzc2luZyByZXF1aXJlZCBkZXBlbmRlbmN5OiByZXBvcnRlci5cIik7XG4gICAgfVxuXG4gICAgLy9UT0RPOiBDb3VsZCB0aGlzIHBlcmhhcHMgYmUgZG9uZSBhdCBpbnN0YWxsYXRpb24gdGltZT9cbiAgICB2YXIgc2Nyb2xsYmFyU2l6ZXMgPSBnZXRTY3JvbGxiYXJTaXplcygpO1xuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIHJlc2l6ZSBldmVudCBsaXN0ZW5lciB0byB0aGUgZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRoYXQgc2hvdWxkIGhhdmUgdGhlIGxpc3RlbmVyIGFkZGVkLlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGxpc3RlbmVyIFRoZSBsaXN0ZW5lciBjYWxsYmFjayB0byBiZSBjYWxsZWQgZm9yIGVhY2ggcmVzaXplIGV2ZW50IG9mIHRoZSBlbGVtZW50LiBUaGUgZWxlbWVudCB3aWxsIGJlIGdpdmVuIGFzIGEgcGFyYW1ldGVyIHRvIHRoZSBsaXN0ZW5lciBjYWxsYmFjay5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhZGRMaXN0ZW5lcihlbGVtZW50LCBsaXN0ZW5lcikge1xuICAgICAgICB2YXIgY2hhbmdlZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIGVsZW1lbnRTdHlsZSAgICA9IGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG4gICAgICAgICAgICB2YXIgd2lkdGggICAgICAgICAgID0gcGFyc2VTaXplKGVsZW1lbnRTdHlsZS53aWR0aCk7XG4gICAgICAgICAgICB2YXIgaGVpZ2h0ICAgICAgICAgID0gcGFyc2VTaXplKGVsZW1lbnRTdHlsZS5oZWlnaHQpO1xuXG4gICAgICAgICAgICAvLyBTdG9yZSB0aGUgc2l6ZSBvZiB0aGUgZWxlbWVudCBzeW5jIGhlcmUsIHNvIHRoYXQgbXVsdGlwbGUgc2Nyb2xsIGV2ZW50cyBtYXkgYmUgaWdub3JlZCBpbiB0aGUgZXZlbnQgbGlzdGVuZXJzLlxuICAgICAgICAgICAgLy8gT3RoZXJ3aXNlIHRoZSBpZi1jaGVjayBpbiBoYW5kbGVTY3JvbGwgaXMgdXNlbGVzcy5cbiAgICAgICAgICAgIHN0b3JlQ3VycmVudFNpemUoZWxlbWVudCwgd2lkdGgsIGhlaWdodCk7XG5cbiAgICAgICAgICAgIGJhdGNoUHJvY2Vzc29yLmFkZChmdW5jdGlvbiB1cGRhdGVEZXRlY3RvckVsZW1lbnRzKCkge1xuICAgICAgICAgICAgICAgIHVwZGF0ZUNoaWxkU2l6ZXMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgYmF0Y2hQcm9jZXNzb3IuYWRkKDEsIGZ1bmN0aW9uIHVwZGF0ZVNjcm9sbGJhcnMoKSB7XG4gICAgICAgICAgICAgICAgcG9zaXRpb25TY3JvbGxiYXJzKGVsZW1lbnQsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICAgICAgICAgIGxpc3RlbmVyKGVsZW1lbnQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgZnVuY3Rpb24gaGFuZGxlU2Nyb2xsKCkge1xuICAgICAgICAgICAgdmFyIHN0eWxlID0gZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcbiAgICAgICAgICAgIHZhciB3aWR0aCA9IHBhcnNlU2l6ZShzdHlsZS53aWR0aCk7XG4gICAgICAgICAgICB2YXIgaGVpZ2h0ID0gcGFyc2VTaXplKHN0eWxlLmhlaWdodCk7XG5cbiAgICAgICAgICAgIGlmICh3aWR0aCAhPT0gZWxlbWVudC5sYXN0V2lkdGggfHwgaGVpZ2h0ICE9PSBlbGVtZW50Lmxhc3RIZWlnaHQpIHtcbiAgICAgICAgICAgICAgICBjaGFuZ2VkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZXhwYW5kID0gZ2V0RXhwYW5kRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgdmFyIHNocmluayA9IGdldFNocmlua0VsZW1lbnQoZWxlbWVudCk7XG5cbiAgICAgICAgYWRkRXZlbnQoZXhwYW5kLCBcInNjcm9sbFwiLCBoYW5kbGVTY3JvbGwpO1xuICAgICAgICBhZGRFdmVudChzaHJpbmssIFwic2Nyb2xsXCIsIGhhbmRsZVNjcm9sbCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWFrZXMgYW4gZWxlbWVudCBkZXRlY3RhYmxlIGFuZCByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGV2ZW50cy4gV2lsbCBjYWxsIHRoZSBjYWxsYmFjayB3aGVuIHRoZSBlbGVtZW50IGlzIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgY2hhbmdlcy5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0byBtYWtlIGRldGVjdGFibGVcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIHdoZW4gdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBjaGFuZ2VzLiBXaWxsIGJlIGNhbGxlZCB3aXRoIHRoZSBlbGVtZW50IGFzIGZpcnN0IHBhcmFtZXRlci5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBtYWtlRGV0ZWN0YWJsZShlbGVtZW50LCBjYWxsYmFjaykge1xuICAgICAgICAvLyBSZWFkaW5nIHByb3BlcnRpZXMgb2YgZWxlbWVudFN0eWxlIHdpbGwgcmVzdWx0IGluIGEgZm9yY2VkIGdldENvbXB1dGVkU3R5bGUgZm9yIHNvbWUgYnJvd3NlcnMsIHNvIHJlYWQgYWxsIHZhbHVlcyBhbmQgc3RvcmUgdGhlbSBhcyBwcmltaXRpdmVzIGhlcmUuXG4gICAgICAgIHZhciBlbGVtZW50U3R5bGUgICAgICAgID0gZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcbiAgICAgICAgdmFyIHBvc2l0aW9uICAgICAgICAgICAgPSBlbGVtZW50U3R5bGUucG9zaXRpb247XG4gICAgICAgIHZhciB3aWR0aCAgICAgICAgICAgICAgID0gcGFyc2VTaXplKGVsZW1lbnRTdHlsZS53aWR0aCk7XG4gICAgICAgIHZhciBoZWlnaHQgICAgICAgICAgICAgID0gcGFyc2VTaXplKGVsZW1lbnRTdHlsZS5oZWlnaHQpO1xuICAgICAgICB2YXIgdG9wICAgICAgICAgICAgICAgICA9IGVsZW1lbnRTdHlsZS50b3A7XG4gICAgICAgIHZhciByaWdodCAgICAgICAgICAgICAgID0gZWxlbWVudFN0eWxlLnJpZ2h0O1xuICAgICAgICB2YXIgYm90dG9tICAgICAgICAgICAgICA9IGVsZW1lbnRTdHlsZS5ib3R0b207XG4gICAgICAgIHZhciBsZWZ0ICAgICAgICAgICAgICAgID0gZWxlbWVudFN0eWxlLmxlZnQ7XG4gICAgICAgIHZhciByZWFkeUV4cGFuZFNjcm9sbCAgID0gZmFsc2U7XG4gICAgICAgIHZhciByZWFkeVNocmlua1Njcm9sbCAgID0gZmFsc2U7XG4gICAgICAgIHZhciByZWFkeU92ZXJhbGwgICAgICAgID0gZmFsc2U7XG5cbiAgICAgICAgZnVuY3Rpb24gcmVhZHkoKSB7XG4gICAgICAgICAgICBpZihyZWFkeUV4cGFuZFNjcm9sbCAmJiByZWFkeVNocmlua1Njcm9sbCAmJiByZWFkeU92ZXJhbGwpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlbGVtZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG11dGF0ZURvbSgpIHtcbiAgICAgICAgICAgIGlmKHBvc2l0aW9uID09PSBcInN0YXRpY1wiKSB7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9IFwicmVsYXRpdmVcIjtcblxuICAgICAgICAgICAgICAgIHZhciByZW1vdmVSZWxhdGl2ZVN0eWxlcyA9IGZ1bmN0aW9uKHJlcG9ydGVyLCBlbGVtZW50LCB2YWx1ZSwgcHJvcGVydHkpIHtcbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gZ2V0TnVtZXJpY2FsVmFsdWUodmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bXi1cXGRcXC5dL2csIFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYodmFsdWUgIT09IFwiYXV0b1wiICYmIGdldE51bWVyaWNhbFZhbHVlKHZhbHVlKSAhPT0gXCIwXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlcG9ydGVyLndhcm4oXCJBbiBlbGVtZW50IHRoYXQgaXMgcG9zaXRpb25lZCBzdGF0aWMgaGFzIHN0eWxlLlwiICsgcHJvcGVydHkgKyBcIj1cIiArIHZhbHVlICsgXCIgd2hpY2ggaXMgaWdub3JlZCBkdWUgdG8gdGhlIHN0YXRpYyBwb3NpdGlvbmluZy4gVGhlIGVsZW1lbnQgd2lsbCBuZWVkIHRvIGJlIHBvc2l0aW9uZWQgcmVsYXRpdmUsIHNvIHRoZSBzdHlsZS5cIiArIHByb3BlcnR5ICsgXCIgd2lsbCBiZSBzZXQgdG8gMC4gRWxlbWVudDogXCIsIGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZVtwcm9wZXJ0eV0gPSAwO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIC8vQ2hlY2sgc28gdGhhdCB0aGVyZSBhcmUgbm8gYWNjaWRlbnRhbCBzdHlsZXMgdGhhdCB3aWxsIG1ha2UgdGhlIGVsZW1lbnQgc3R5bGVkIGRpZmZlcmVudGx5IG5vdyB0aGF0IGlzIGlzIHJlbGF0aXZlLlxuICAgICAgICAgICAgICAgIC8vSWYgdGhlcmUgYXJlIGFueSwgc2V0IHRoZW0gdG8gMCAodGhpcyBzaG91bGQgYmUgb2theSB3aXRoIHRoZSB1c2VyIHNpbmNlIHRoZSBzdHlsZSBwcm9wZXJ0aWVzIGRpZCBub3RoaW5nIGJlZm9yZSBbc2luY2UgdGhlIGVsZW1lbnQgd2FzIHBvc2l0aW9uZWQgc3RhdGljXSBhbnl3YXkpLlxuICAgICAgICAgICAgICAgIHJlbW92ZVJlbGF0aXZlU3R5bGVzKHJlcG9ydGVyLCBlbGVtZW50LCB0b3AsIFwidG9wXCIpO1xuICAgICAgICAgICAgICAgIHJlbW92ZVJlbGF0aXZlU3R5bGVzKHJlcG9ydGVyLCBlbGVtZW50LCByaWdodCwgXCJyaWdodFwiKTtcbiAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgYm90dG9tLCBcImJvdHRvbVwiKTtcbiAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgbGVmdCwgXCJsZWZ0XCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBnZXRDb250YWluZXJDc3NUZXh0KGxlZnQsIHRvcCwgYm90dG9tLCByaWdodCkge1xuICAgICAgICAgICAgICAgIGxlZnQgPSAoIWxlZnQgPyBcIjBcIiA6IChsZWZ0ICsgXCJweFwiKSk7XG4gICAgICAgICAgICAgICAgdG9wID0gKCF0b3AgPyBcIjBcIiA6ICh0b3AgKyBcInB4XCIpKTtcbiAgICAgICAgICAgICAgICBib3R0b20gPSAoIWJvdHRvbSA/IFwiMFwiIDogKGJvdHRvbSArIFwicHhcIikpO1xuICAgICAgICAgICAgICAgIHJpZ2h0ID0gKCFyaWdodCA/IFwiMFwiIDogKHJpZ2h0ICsgXCJweFwiKSk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gXCJwb3NpdGlvbjogYWJzb2x1dGU7IGxlZnQ6IFwiICsgbGVmdCArIFwiOyB0b3A6IFwiICsgdG9wICsgXCI7IHJpZ2h0OiBcIiArIHJpZ2h0ICsgXCI7IGJvdHRvbTogXCIgKyBib3R0b20gKyBcIjsgb3ZlcmZsb3c6IHNjcm9sbDsgei1pbmRleDogLTE7IHZpc2liaWxpdHk6IGhpZGRlbjtcIjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHNjcm9sbGJhcldpZHRoICAgICAgICAgID0gc2Nyb2xsYmFyU2l6ZXMud2lkdGg7XG4gICAgICAgICAgICB2YXIgc2Nyb2xsYmFySGVpZ2h0ICAgICAgICAgPSBzY3JvbGxiYXJTaXplcy5oZWlnaHQ7XG4gICAgICAgICAgICB2YXIgY29udGFpbmVyU3R5bGUgICAgICAgICAgPSBnZXRDb250YWluZXJDc3NUZXh0KC0xLCAtMSwgLXNjcm9sbGJhckhlaWdodCwgLXNjcm9sbGJhcldpZHRoKTtcbiAgICAgICAgICAgIHZhciBzaHJpbmtFeHBhbmRzdHlsZSAgICAgICA9IGdldENvbnRhaW5lckNzc1RleHQoMCwgMCwgLXNjcm9sbGJhckhlaWdodCwgLXNjcm9sbGJhcldpZHRoKTtcbiAgICAgICAgICAgIHZhciBzaHJpbmtFeHBhbmRDaGlsZFN0eWxlICA9IFwicG9zaXRpb246IGFic29sdXRlOyBsZWZ0OiAwOyB0b3A6IDA7XCI7XG5cbiAgICAgICAgICAgIHZhciBjb250YWluZXIgICAgICAgICAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICB2YXIgZXhwYW5kICAgICAgICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgdmFyIGV4cGFuZENoaWxkICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIHZhciBzaHJpbmsgICAgICAgICAgICAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICB2YXIgc2hyaW5rQ2hpbGQgICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXG4gICAgICAgICAgICBjb250YWluZXIuc3R5bGUuY3NzVGV4dCAgICAgPSBjb250YWluZXJTdHlsZTtcbiAgICAgICAgICAgIGV4cGFuZC5zdHlsZS5jc3NUZXh0ICAgICAgICA9IHNocmlua0V4cGFuZHN0eWxlO1xuICAgICAgICAgICAgZXhwYW5kQ2hpbGQuc3R5bGUuY3NzVGV4dCAgID0gc2hyaW5rRXhwYW5kQ2hpbGRTdHlsZTtcbiAgICAgICAgICAgIHNocmluay5zdHlsZS5jc3NUZXh0ICAgICAgICA9IHNocmlua0V4cGFuZHN0eWxlO1xuICAgICAgICAgICAgc2hyaW5rQ2hpbGQuc3R5bGUuY3NzVGV4dCAgID0gc2hyaW5rRXhwYW5kQ2hpbGRTdHlsZSArIFwiIHdpZHRoOiAyMDAlOyBoZWlnaHQ6IDIwMCU7XCI7XG5cbiAgICAgICAgICAgIGV4cGFuZC5hcHBlbmRDaGlsZChleHBhbmRDaGlsZCk7XG4gICAgICAgICAgICBzaHJpbmsuYXBwZW5kQ2hpbGQoc2hyaW5rQ2hpbGQpO1xuICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGV4cGFuZCk7XG4gICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoc2hyaW5rKTtcbiAgICAgICAgICAgIGVsZW1lbnQuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcbiAgICAgICAgICAgIGVsZW1lbnQuX2VyZEVsZW1lbnQgPSBjb250YWluZXI7XG5cbiAgICAgICAgICAgIGFkZEV2ZW50KGV4cGFuZCwgXCJzY3JvbGxcIiwgZnVuY3Rpb24gb25GaXJzdEV4cGFuZFNjcm9sbCgpIHtcbiAgICAgICAgICAgICAgICByZW1vdmVFdmVudChleHBhbmQsIFwic2Nyb2xsXCIsIG9uRmlyc3RFeHBhbmRTY3JvbGwpO1xuICAgICAgICAgICAgICAgIHJlYWR5RXhwYW5kU2Nyb2xsID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICByZWFkeSgpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGFkZEV2ZW50KHNocmluaywgXCJzY3JvbGxcIiwgZnVuY3Rpb24gb25GaXJzdFNocmlua1Njcm9sbCgpIHtcbiAgICAgICAgICAgICAgICByZW1vdmVFdmVudChzaHJpbmssIFwic2Nyb2xsXCIsIG9uRmlyc3RTaHJpbmtTY3JvbGwpO1xuICAgICAgICAgICAgICAgIHJlYWR5U2hyaW5rU2Nyb2xsID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICByZWFkeSgpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHVwZGF0ZUNoaWxkU2l6ZXMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBmaW5hbGl6ZURvbU11dGF0aW9uKCkge1xuICAgICAgICAgICAgc3RvcmVDdXJyZW50U2l6ZShlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgICAgIHBvc2l0aW9uU2Nyb2xsYmFycyhlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgICAgIHJlYWR5T3ZlcmFsbCA9IHRydWU7XG4gICAgICAgICAgICByZWFkeSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoYmF0Y2hQcm9jZXNzb3IpIHtcbiAgICAgICAgICAgIGJhdGNoUHJvY2Vzc29yLmFkZChtdXRhdGVEb20pO1xuICAgICAgICAgICAgYmF0Y2hQcm9jZXNzb3IuYWRkKDEsIGZpbmFsaXplRG9tTXV0YXRpb24pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbXV0YXRlRG9tKCk7XG4gICAgICAgICAgICBmaW5hbGl6ZURvbU11dGF0aW9uKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRFeHBhbmRFbGVtZW50KGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuX2VyZEVsZW1lbnQuY2hpbGROb2Rlc1swXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRFeHBhbmRDaGlsZEVsZW1lbnQoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZ2V0RXhwYW5kRWxlbWVudChlbGVtZW50KS5jaGlsZE5vZGVzWzBdO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFNocmlua0VsZW1lbnQoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZWxlbWVudC5fZXJkRWxlbWVudC5jaGlsZE5vZGVzWzFdO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbW92ZUVyZEVsZW1lbnQoZWxlbWVudCkge1xuICAgICAgICBlbGVtZW50LnJlbW92ZUNoaWxkKGVsZW1lbnQuX2VyZEVsZW1lbnQpO1xuICAgICAgICBkZWxldGUgZWxlbWVudC5fZXJkRWxlbWVudDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRFeHBhbmRTaXplKHNpemUpIHtcbiAgICAgICAgcmV0dXJuIHNpemUgKyAxMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRTaHJpbmtTaXplKHNpemUpIHtcbiAgICAgICAgcmV0dXJuIHNpemUgKiAyO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVwZGF0ZUNoaWxkU2l6ZXMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICB2YXIgZXhwYW5kQ2hpbGQgICAgICAgICAgICAgPSBnZXRFeHBhbmRDaGlsZEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgIHZhciBleHBhbmRXaWR0aCAgICAgICAgICAgICA9IGdldEV4cGFuZFNpemUod2lkdGgpO1xuICAgICAgICB2YXIgZXhwYW5kSGVpZ2h0ICAgICAgICAgICAgPSBnZXRFeHBhbmRTaXplKGhlaWdodCk7XG4gICAgICAgIGV4cGFuZENoaWxkLnN0eWxlLndpZHRoICAgICA9IGV4cGFuZFdpZHRoICsgXCJweFwiO1xuICAgICAgICBleHBhbmRDaGlsZC5zdHlsZS5oZWlnaHQgICAgPSBleHBhbmRIZWlnaHQgKyBcInB4XCI7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3RvcmVDdXJyZW50U2l6ZShlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICAgIGVsZW1lbnQubGFzdFdpZHRoICAgPSB3aWR0aDtcbiAgICAgICAgZWxlbWVudC5sYXN0SGVpZ2h0ICA9IGhlaWdodDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwb3NpdGlvblNjcm9sbGJhcnMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICB2YXIgZXhwYW5kICAgICAgICAgID0gZ2V0RXhwYW5kRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgdmFyIHNocmluayAgICAgICAgICA9IGdldFNocmlua0VsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgIHZhciBleHBhbmRXaWR0aCAgICAgPSBnZXRFeHBhbmRTaXplKHdpZHRoKTtcbiAgICAgICAgdmFyIGV4cGFuZEhlaWdodCAgICA9IGdldEV4cGFuZFNpemUoaGVpZ2h0KTtcbiAgICAgICAgdmFyIHNocmlua1dpZHRoICAgICA9IGdldFNocmlua1NpemUod2lkdGgpO1xuICAgICAgICB2YXIgc2hyaW5rSGVpZ2h0ICAgID0gZ2V0U2hyaW5rU2l6ZShoZWlnaHQpO1xuICAgICAgICBleHBhbmQuc2Nyb2xsTGVmdCAgID0gZXhwYW5kV2lkdGg7XG4gICAgICAgIGV4cGFuZC5zY3JvbGxUb3AgICAgPSBleHBhbmRIZWlnaHQ7XG4gICAgICAgIHNocmluay5zY3JvbGxMZWZ0ICAgPSBzaHJpbmtXaWR0aDtcbiAgICAgICAgc2hyaW5rLnNjcm9sbFRvcCAgICA9IHNocmlua0hlaWdodDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBhZGRFdmVudChlbCwgbmFtZSwgY2IpIHtcbiAgICAgICAgaWYgKGVsLmF0dGFjaEV2ZW50KSB7XG4gICAgICAgICAgICBlbC5hdHRhY2hFdmVudChcIm9uXCIgKyBuYW1lLCBjYik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKG5hbWUsIGNiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbW92ZUV2ZW50KGVsLCBuYW1lLCBjYikge1xuICAgICAgICBpZihlbC5hdHRhY2hFdmVudCkge1xuICAgICAgICAgICAgZWwuZGV0YWNoRXZlbnQoXCJvblwiICsgbmFtZSwgY2IpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihuYW1lLCBjYik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwYXJzZVNpemUoc2l6ZSkge1xuICAgICAgICByZXR1cm4gcGFyc2VGbG9hdChzaXplLnJlcGxhY2UoL3B4LywgXCJcIikpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFNjcm9sbGJhclNpemVzKCkge1xuICAgICAgICB2YXIgd2lkdGggPSA1MDA7XG4gICAgICAgIHZhciBoZWlnaHQgPSA1MDA7XG5cbiAgICAgICAgdmFyIGNoaWxkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgY2hpbGQuc3R5bGUuY3NzVGV4dCA9IFwicG9zaXRpb246IGFic29sdXRlOyB3aWR0aDogXCIgKyB3aWR0aCoyICsgXCJweDsgaGVpZ2h0OiBcIiArIGhlaWdodCoyICsgXCJweDsgdmlzaWJpbGl0eTogaGlkZGVuO1wiO1xuXG4gICAgICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBjb250YWluZXIuc3R5bGUuY3NzVGV4dCA9IFwicG9zaXRpb246IGFic29sdXRlOyB3aWR0aDogXCIgKyB3aWR0aCArIFwicHg7IGhlaWdodDogXCIgKyBoZWlnaHQgKyBcInB4OyBvdmVyZmxvdzogc2Nyb2xsOyB2aXNpYmlsaXR5OiBub25lOyB0b3A6IFwiICsgLXdpZHRoKjMgKyBcInB4OyBsZWZ0OiBcIiArIC1oZWlnaHQqMyArIFwicHg7IHZpc2liaWxpdHk6IGhpZGRlbjtcIjtcblxuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoY2hpbGQpO1xuXG4gICAgICAgIGRvY3VtZW50LmJvZHkuaW5zZXJ0QmVmb3JlKGNvbnRhaW5lciwgZG9jdW1lbnQuYm9keS5maXJzdENoaWxkKTtcblxuICAgICAgICB2YXIgd2lkdGhTaXplID0gd2lkdGggLSBjb250YWluZXIuY2xpZW50V2lkdGg7XG4gICAgICAgIHZhciBoZWlnaHRTaXplID0gaGVpZ2h0IC0gY29udGFpbmVyLmNsaWVudEhlaWdodDtcblxuICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKGNvbnRhaW5lcik7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHdpZHRoOiB3aWR0aFNpemUsXG4gICAgICAgICAgICBoZWlnaHQ6IGhlaWdodFNpemVcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW1vdmVMaXN0ZW5lcnMoZWxlbWVudCkge1xuICAgICAgcmVtb3ZlRXJkRWxlbWVudChlbGVtZW50KTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBtYWtlRGV0ZWN0YWJsZTogbWFrZURldGVjdGFibGUsXG4gICAgICAgIGFkZExpc3RlbmVyOiBhZGRMaXN0ZW5lcixcbiAgICAgICAgcmVtb3ZlTGlzdGVuZXJzOiByZW1vdmVMaXN0ZW5lcnNcbiAgICB9O1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZm9yRWFjaCAgICAgICAgICAgICAgICAgPSByZXF1aXJlKFwiLi9jb2xsZWN0aW9uLXV0aWxzXCIpLmZvckVhY2g7XG52YXIgZWxlbWVudFV0aWxzTWFrZXIgICAgICAgPSByZXF1aXJlKFwiLi9lbGVtZW50LXV0aWxzXCIpO1xudmFyIGxpc3RlbmVySGFuZGxlck1ha2VyICAgID0gcmVxdWlyZShcIi4vbGlzdGVuZXItaGFuZGxlclwiKTtcbnZhciBpZEdlbmVyYXRvck1ha2VyICAgICAgICA9IHJlcXVpcmUoXCIuL2lkLWdlbmVyYXRvclwiKTtcbnZhciBpZEhhbmRsZXJNYWtlciAgICAgICAgICA9IHJlcXVpcmUoXCIuL2lkLWhhbmRsZXJcIik7XG52YXIgcmVwb3J0ZXJNYWtlciAgICAgICAgICAgPSByZXF1aXJlKFwiLi9yZXBvcnRlclwiKTtcbnZhciBicm93c2VyRGV0ZWN0b3IgICAgICAgICA9IHJlcXVpcmUoXCIuL2Jyb3dzZXItZGV0ZWN0b3JcIik7XG52YXIgYmF0Y2hQcm9jZXNzb3JNYWtlciAgICAgPSByZXF1aXJlKFwiYmF0Y2gtcHJvY2Vzc29yXCIpO1xuXG4vL0RldGVjdGlvbiBzdHJhdGVnaWVzLlxudmFyIG9iamVjdFN0cmF0ZWd5TWFrZXIgICAgID0gcmVxdWlyZShcIi4vZGV0ZWN0aW9uLXN0cmF0ZWd5L29iamVjdC5qc1wiKTtcbnZhciBzY3JvbGxTdHJhdGVneU1ha2VyICAgICA9IHJlcXVpcmUoXCIuL2RldGVjdGlvbi1zdHJhdGVneS9zY3JvbGwuanNcIik7XG5cbi8qKlxuICogQHR5cGVkZWYgaWRIYW5kbGVyXG4gKiBAdHlwZSB7b2JqZWN0fVxuICogQHByb3BlcnR5IHtmdW5jdGlvbn0gZ2V0IEdldHMgdGhlIHJlc2l6ZSBkZXRlY3RvciBpZCBvZiB0aGUgZWxlbWVudC5cbiAqIEBwcm9wZXJ0eSB7ZnVuY3Rpb259IHNldCBHZW5lcmF0ZSBhbmQgc2V0cyB0aGUgcmVzaXplIGRldGVjdG9yIGlkIG9mIHRoZSBlbGVtZW50LlxuICovXG5cbi8qKlxuICogQHR5cGVkZWYgT3B0aW9uc1xuICogQHR5cGUge29iamVjdH1cbiAqIEBwcm9wZXJ0eSB7Ym9vbGVhbn0gY2FsbE9uQWRkICAgIERldGVybWluZXMgaWYgbGlzdGVuZXJzIHNob3VsZCBiZSBjYWxsZWQgd2hlbiB0aGV5IGFyZSBnZXR0aW5nIGFkZGVkLiBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIERlZmF1bHQgaXMgdHJ1ZS4gSWYgdHJ1ZSwgdGhlIGxpc3RlbmVyIGlzIGd1YXJhbnRlZWQgdG8gYmUgY2FsbGVkIHdoZW4gaXQgaGFzIGJlZW4gYWRkZWQuIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSWYgZmFsc2UsIHRoZSBsaXN0ZW5lciB3aWxsIG5vdCBiZSBndWFyZW50ZWVkIHRvIGJlIGNhbGxlZCB3aGVuIGl0IGhhcyBiZWVuIGFkZGVkIChkb2VzIG5vdCBwcmV2ZW50IGl0IGZyb20gYmVpbmcgY2FsbGVkKS5cbiAqIEBwcm9wZXJ0eSB7aWRIYW5kbGVyfSBpZEhhbmRsZXIgIEEgY3VzdG9tIGlkIGhhbmRsZXIgdGhhdCBpcyByZXNwb25zaWJsZSBmb3IgZ2VuZXJhdGluZywgc2V0dGluZyBhbmQgcmV0cmlldmluZyBpZCdzIGZvciBlbGVtZW50cy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIElmIG5vdCBwcm92aWRlZCwgYSBkZWZhdWx0IGlkIGhhbmRsZXIgd2lsbCBiZSB1c2VkLlxuICogQHByb3BlcnR5IHtyZXBvcnRlcn0gcmVwb3J0ZXIgICAgQSBjdXN0b20gcmVwb3J0ZXIgdGhhdCBoYW5kbGVzIHJlcG9ydGluZyBsb2dzLCB3YXJuaW5ncyBhbmQgZXJyb3JzLiBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIElmIG5vdCBwcm92aWRlZCwgYSBkZWZhdWx0IGlkIGhhbmRsZXIgd2lsbCBiZSB1c2VkLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSWYgc2V0IHRvIGZhbHNlLCB0aGVuIG5vdGhpbmcgd2lsbCBiZSByZXBvcnRlZC5cbiAqL1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gZWxlbWVudCByZXNpemUgZGV0ZWN0b3IgaW5zdGFuY2UuXG4gKiBAcHVibGljXG4gKiBAcGFyYW0ge09wdGlvbnM/fSBvcHRpb25zIE9wdGlvbmFsIGdsb2JhbCBvcHRpb25zIG9iamVjdCB0aGF0IHdpbGwgZGVjaWRlIGhvdyB0aGlzIGluc3RhbmNlIHdpbGwgd29yay5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICAvL2lkSGFuZGxlciBpcyBjdXJyZW50bHkgbm90IGFuIG9wdGlvbiB0byB0aGUgbGlzdGVuVG8gZnVuY3Rpb24sIHNvIGl0IHNob3VsZCBub3QgYmUgYWRkZWQgdG8gZ2xvYmFsT3B0aW9ucy5cbiAgICB2YXIgaWRIYW5kbGVyID0gb3B0aW9ucy5pZEhhbmRsZXI7XG5cbiAgICBpZighaWRIYW5kbGVyKSB7XG4gICAgICAgIHZhciBpZEdlbmVyYXRvciA9IGlkR2VuZXJhdG9yTWFrZXIoKTtcbiAgICAgICAgdmFyIGRlZmF1bHRJZEhhbmRsZXIgPSBpZEhhbmRsZXJNYWtlcihpZEdlbmVyYXRvcik7XG4gICAgICAgIGlkSGFuZGxlciA9IGRlZmF1bHRJZEhhbmRsZXI7XG4gICAgfVxuXG4gICAgLy9yZXBvcnRlciBpcyBjdXJyZW50bHkgbm90IGFuIG9wdGlvbiB0byB0aGUgbGlzdGVuVG8gZnVuY3Rpb24sIHNvIGl0IHNob3VsZCBub3QgYmUgYWRkZWQgdG8gZ2xvYmFsT3B0aW9ucy5cbiAgICB2YXIgcmVwb3J0ZXIgPSBvcHRpb25zLnJlcG9ydGVyO1xuXG4gICAgaWYoIXJlcG9ydGVyKSB7XG4gICAgICAgIC8vSWYgb3B0aW9ucy5yZXBvcnRlciBpcyBmYWxzZSwgdGhlbiB0aGUgcmVwb3J0ZXIgc2hvdWxkIGJlIHF1aWV0LlxuICAgICAgICB2YXIgcXVpZXQgPSByZXBvcnRlciA9PT0gZmFsc2U7XG4gICAgICAgIHJlcG9ydGVyID0gcmVwb3J0ZXJNYWtlcihxdWlldCk7XG4gICAgfVxuXG4gICAgLy9iYXRjaFByb2Nlc3NvciBpcyBjdXJyZW50bHkgbm90IGFuIG9wdGlvbiB0byB0aGUgbGlzdGVuVG8gZnVuY3Rpb24sIHNvIGl0IHNob3VsZCBub3QgYmUgYWRkZWQgdG8gZ2xvYmFsT3B0aW9ucy5cbiAgICB2YXIgYmF0Y2hQcm9jZXNzb3IgPSBnZXRPcHRpb24ob3B0aW9ucywgXCJiYXRjaFByb2Nlc3NvclwiLCBiYXRjaFByb2Nlc3Nvck1ha2VyKHsgcmVwb3J0ZXI6IHJlcG9ydGVyIH0pKTtcblxuICAgIC8vT3B0aW9ucyB0byBiZSB1c2VkIGFzIGRlZmF1bHQgZm9yIHRoZSBsaXN0ZW5UbyBmdW5jdGlvbi5cbiAgICB2YXIgZ2xvYmFsT3B0aW9ucyA9IHt9O1xuICAgIGdsb2JhbE9wdGlvbnMuY2FsbE9uQWRkICAgICA9ICEhZ2V0T3B0aW9uKG9wdGlvbnMsIFwiY2FsbE9uQWRkXCIsIHRydWUpO1xuXG4gICAgdmFyIGV2ZW50TGlzdGVuZXJIYW5kbGVyICAgID0gbGlzdGVuZXJIYW5kbGVyTWFrZXIoaWRIYW5kbGVyKTtcbiAgICB2YXIgZWxlbWVudFV0aWxzICAgICAgICAgICAgPSBlbGVtZW50VXRpbHNNYWtlcigpO1xuXG4gICAgLy9UaGUgZGV0ZWN0aW9uIHN0cmF0ZWd5IHRvIGJlIHVzZWQuXG4gICAgdmFyIGRldGVjdGlvblN0cmF0ZWd5O1xuICAgIHZhciBkZXNpcmVkU3RyYXRlZ3kgPSBnZXRPcHRpb24ob3B0aW9ucywgXCJzdHJhdGVneVwiLCBcIm9iamVjdFwiKTtcbiAgICB2YXIgc3RyYXRlZ3lPcHRpb25zID0ge1xuICAgICAgICByZXBvcnRlcjogcmVwb3J0ZXIsXG4gICAgICAgIGJhdGNoUHJvY2Vzc29yOiBiYXRjaFByb2Nlc3NvclxuICAgIH07XG5cbiAgICBpZihkZXNpcmVkU3RyYXRlZ3kgPT09IFwic2Nyb2xsXCIgJiYgYnJvd3NlckRldGVjdG9yLmlzTGVnYWN5T3BlcmEoKSkge1xuICAgICAgICByZXBvcnRlci53YXJuKFwiU2Nyb2xsIHN0cmF0ZWd5IGlzIG5vdCBzdXBwb3J0ZWQgb24gbGVnYWN5IE9wZXJhLiBDaGFuZ2luZyB0byBvYmplY3Qgc3RyYXRlZ3kuXCIpO1xuICAgICAgICBkZXNpcmVkU3RyYXRlZ3kgPSBcIm9iamVjdFwiO1xuICAgIH1cblxuICAgIGlmKGRlc2lyZWRTdHJhdGVneSA9PT0gXCJzY3JvbGxcIikge1xuICAgICAgICBkZXRlY3Rpb25TdHJhdGVneSA9IHNjcm9sbFN0cmF0ZWd5TWFrZXIoc3RyYXRlZ3lPcHRpb25zKTtcbiAgICB9IGVsc2UgaWYoZGVzaXJlZFN0cmF0ZWd5ID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIGRldGVjdGlvblN0cmF0ZWd5ID0gb2JqZWN0U3RyYXRlZ3lNYWtlcihzdHJhdGVneU9wdGlvbnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgc3RyYXRlZ3kgbmFtZTogXCIgKyBkZXNpcmVkU3RyYXRlZ3kpO1xuICAgIH1cblxuICAgIC8vQ2FsbHMgY2FuIGJlIG1hZGUgdG8gbGlzdGVuVG8gd2l0aCBlbGVtZW50cyB0aGF0IGFyZSBzdGlsbCBhcmUgYmVpbmcgaW5zdGFsbGVkLlxuICAgIC8vQWxzbywgc2FtZSBlbGVtZW50cyBjYW4gb2NjdXIgaW4gdGhlIGVsZW1lbnRzIGxpc3QgaW4gdGhlIGxpc3RlblRvIGZ1bmN0aW9uLlxuICAgIC8vV2l0aCB0aGlzIG1hcCwgdGhlIHJlYWR5IGNhbGxiYWNrcyBjYW4gYmUgc3luY2hyb25pemVkIGJldHdlZW4gdGhlIGNhbGxzXG4gICAgLy9zbyB0aGF0IHRoZSByZWFkeSBjYWxsYmFjayBjYW4gYWx3YXlzIGJlIGNhbGxlZCB3aGVuIGFuIGVsZW1lbnQgaXMgcmVhZHkgLSBldmVuIGlmXG4gICAgLy9pdCB3YXNuJ3QgaW5zdGFsbGVkIGZyb20gdGhlIGZ1bmN0aW9uIGludHNlbGYuXG4gICAgdmFyIG9uUmVhZHlDYWxsYmFja3MgPSB7fTtcblxuICAgIC8qKlxuICAgICAqIE1ha2VzIHRoZSBnaXZlbiBlbGVtZW50cyByZXNpemUtZGV0ZWN0YWJsZSBhbmQgc3RhcnRzIGxpc3RlbmluZyB0byByZXNpemUgZXZlbnRzIG9uIHRoZSBlbGVtZW50cy4gQ2FsbHMgdGhlIGV2ZW50IGNhbGxiYWNrIGZvciBlYWNoIGV2ZW50IGZvciBlYWNoIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7T3B0aW9ucz99IG9wdGlvbnMgT3B0aW9uYWwgb3B0aW9ucyBvYmplY3QuIFRoZXNlIG9wdGlvbnMgd2lsbCBvdmVycmlkZSB0aGUgZ2xvYmFsIG9wdGlvbnMuIFNvbWUgb3B0aW9ucyBtYXkgbm90IGJlIG92ZXJyaWRlbiwgc3VjaCBhcyBpZEhhbmRsZXIuXG4gICAgICogQHBhcmFtIHtlbGVtZW50W118ZWxlbWVudH0gZWxlbWVudHMgVGhlIGdpdmVuIGFycmF5IG9mIGVsZW1lbnRzIHRvIGRldGVjdCByZXNpemUgZXZlbnRzIG9mLiBTaW5nbGUgZWxlbWVudCBpcyBhbHNvIHZhbGlkLlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGxpc3RlbmVyIFRoZSBjYWxsYmFjayB0byBiZSBleGVjdXRlZCBmb3IgZWFjaCByZXNpemUgZXZlbnQgZm9yIGVhY2ggZWxlbWVudC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBsaXN0ZW5UbyhvcHRpb25zLCBlbGVtZW50cywgbGlzdGVuZXIpIHtcbiAgICAgICAgZnVuY3Rpb24gb25SZXNpemVDYWxsYmFjayhlbGVtZW50KSB7XG4gICAgICAgICAgICB2YXIgbGlzdGVuZXJzID0gZXZlbnRMaXN0ZW5lckhhbmRsZXIuZ2V0KGVsZW1lbnQpO1xuICAgICAgICAgICAgZm9yRWFjaChsaXN0ZW5lcnMsIGZ1bmN0aW9uIGNhbGxMaXN0ZW5lclByb3h5KGxpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIoZWxlbWVudCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGFkZExpc3RlbmVyKGNhbGxPbkFkZCwgZWxlbWVudCwgbGlzdGVuZXIpIHtcbiAgICAgICAgICAgIGV2ZW50TGlzdGVuZXJIYW5kbGVyLmFkZChlbGVtZW50LCBsaXN0ZW5lcik7XG5cbiAgICAgICAgICAgIGlmKGNhbGxPbkFkZCkge1xuICAgICAgICAgICAgICAgIGxpc3RlbmVyKGVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy9PcHRpb25zIG9iamVjdCBtYXkgYmUgb21pdHRlZC5cbiAgICAgICAgaWYoIWxpc3RlbmVyKSB7XG4gICAgICAgICAgICBsaXN0ZW5lciA9IGVsZW1lbnRzO1xuICAgICAgICAgICAgZWxlbWVudHMgPSBvcHRpb25zO1xuICAgICAgICAgICAgb3B0aW9ucyA9IHt9O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIWVsZW1lbnRzKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBdCBsZWFzdCBvbmUgZWxlbWVudCByZXF1aXJlZC5cIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZighbGlzdGVuZXIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkxpc3RlbmVyIHJlcXVpcmVkLlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGVsZW1lbnRzLmxlbmd0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBlbGVtZW50cyA9IFtlbGVtZW50c107XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZWxlbWVudHNSZWFkeSA9IDA7XG5cbiAgICAgICAgdmFyIGNhbGxPbkFkZCA9IGdldE9wdGlvbihvcHRpb25zLCBcImNhbGxPbkFkZFwiLCBnbG9iYWxPcHRpb25zLmNhbGxPbkFkZCk7XG4gICAgICAgIHZhciBvblJlYWR5Q2FsbGJhY2sgPSBnZXRPcHRpb24ob3B0aW9ucywgXCJvblJlYWR5XCIsIGZ1bmN0aW9uIG5vb3AoKSB7fSk7XG5cbiAgICAgICAgZm9yRWFjaChlbGVtZW50cywgZnVuY3Rpb24gYXR0YWNoTGlzdGVuZXJUb0VsZW1lbnQoZWxlbWVudCkge1xuICAgICAgICAgICAgdmFyIGlkID0gaWRIYW5kbGVyLmdldChlbGVtZW50KTtcblxuICAgICAgICAgICAgaWYoIWVsZW1lbnRVdGlscy5pc0RldGVjdGFibGUoZWxlbWVudCkpIHtcbiAgICAgICAgICAgICAgICBpZihlbGVtZW50VXRpbHMuaXNCdXN5KGVsZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vVGhlIGVsZW1lbnQgaXMgYmVpbmcgcHJlcGFyZWQgdG8gYmUgZGV0ZWN0YWJsZS4gRG8gbm90IG1ha2UgaXQgZGV0ZWN0YWJsZS5cbiAgICAgICAgICAgICAgICAgICAgLy9KdXN0IGFkZCB0aGUgbGlzdGVuZXIsIGJlY2F1c2UgdGhlIGVsZW1lbnQgd2lsbCBzb29uIGJlIGRldGVjdGFibGUuXG4gICAgICAgICAgICAgICAgICAgIGFkZExpc3RlbmVyKGNhbGxPbkFkZCwgZWxlbWVudCwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgICAgICBvblJlYWR5Q2FsbGJhY2tzW2lkXSA9IG9uUmVhZHlDYWxsYmFja3NbaWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgICAgICBvblJlYWR5Q2FsbGJhY2tzW2lkXS5wdXNoKGZ1bmN0aW9uIG9uUmVhZHkoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50c1JlYWR5Kys7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKGVsZW1lbnRzUmVhZHkgPT09IGVsZW1lbnRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9uUmVhZHlDYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vVGhlIGVsZW1lbnQgaXMgbm90IHByZXBhcmVkIHRvIGJlIGRldGVjdGFibGUsIHNvIGRvIHByZXBhcmUgaXQgYW5kIGFkZCBhIGxpc3RlbmVyIHRvIGl0LlxuICAgICAgICAgICAgICAgIGVsZW1lbnRVdGlscy5tYXJrQnVzeShlbGVtZW50LCB0cnVlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZGV0ZWN0aW9uU3RyYXRlZ3kubWFrZURldGVjdGFibGUoZWxlbWVudCwgZnVuY3Rpb24gb25FbGVtZW50RGV0ZWN0YWJsZShlbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRVdGlscy5tYXJrQXNEZXRlY3RhYmxlKGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50VXRpbHMubWFya0J1c3koZWxlbWVudCwgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICBkZXRlY3Rpb25TdHJhdGVneS5hZGRMaXN0ZW5lcihlbGVtZW50LCBvblJlc2l6ZUNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkTGlzdGVuZXIoY2FsbE9uQWRkLCBlbGVtZW50LCBsaXN0ZW5lcik7XG5cbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudHNSZWFkeSsrO1xuICAgICAgICAgICAgICAgICAgICBpZihlbGVtZW50c1JlYWR5ID09PSBlbGVtZW50cy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9uUmVhZHlDYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYob25SZWFkeUNhbGxiYWNrc1tpZF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvckVhY2gob25SZWFkeUNhbGxiYWNrc1tpZF0sIGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIG9uUmVhZHlDYWxsYmFja3NbaWRdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vVGhlIGVsZW1lbnQgaGFzIGJlZW4gcHJlcGFyZWQgdG8gYmUgZGV0ZWN0YWJsZSBhbmQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgdG8uXG4gICAgICAgICAgICBhZGRMaXN0ZW5lcihjYWxsT25BZGQsIGVsZW1lbnQsIGxpc3RlbmVyKTtcbiAgICAgICAgICAgIGVsZW1lbnRzUmVhZHkrKztcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYoZWxlbWVudHNSZWFkeSA9PT0gZWxlbWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICBvblJlYWR5Q2FsbGJhY2soKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRldGFjaChlbGVtZW50KSB7XG4gICAgICBldmVudExpc3RlbmVySGFuZGxlci5yZW1vdmUoZWxlbWVudCk7XG4gICAgICBkZXRlY3Rpb25TdHJhdGVneS5yZW1vdmVMaXN0ZW5lcnMoZWxlbWVudCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgbGlzdGVuVG86IGxpc3RlblRvLFxuICAgICAgICBkZXRhY2g6IGRldGFjaFxuICAgIH07XG59O1xuXG5mdW5jdGlvbiBnZXRPcHRpb24ob3B0aW9ucywgbmFtZSwgZGVmYXVsdFZhbHVlKSB7XG4gICAgdmFyIHZhbHVlID0gb3B0aW9uc1tuYW1lXTtcblxuICAgIGlmKCh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSAmJiBkZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICAgIH1cblxuICAgIHJldHVybiB2YWx1ZTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgIC8qKlxuICAgICAqIFRlbGxzIGlmIHRoZSBlbGVtZW50IGhhcyBiZWVuIG1hZGUgZGV0ZWN0YWJsZSBhbmQgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBldmVudHMuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gVGhlIGVsZW1lbnQgdG8gY2hlY2suXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgb3IgZmFsc2UgZGVwZW5kaW5nIG9uIGlmIHRoZSBlbGVtZW50IGlzIGRldGVjdGFibGUgb3Igbm90LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzRGV0ZWN0YWJsZShlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiAhIWVsZW1lbnQuX2VyZElzRGV0ZWN0YWJsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNYXJrcyB0aGUgZWxlbWVudCB0aGF0IGl0IGhhcyBiZWVuIG1hZGUgZGV0ZWN0YWJsZSBhbmQgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBldmVudHMuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gVGhlIGVsZW1lbnQgdG8gbWFyay5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBtYXJrQXNEZXRlY3RhYmxlKGVsZW1lbnQpIHtcbiAgICAgICAgZWxlbWVudC5fZXJkSXNEZXRlY3RhYmxlID0gdHJ1ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUZWxscyBpZiB0aGUgZWxlbWVudCBpcyBidXN5IG9yIG5vdC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBUaGUgZWxlbWVudCB0byBjaGVjay5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBvciBmYWxzZSBkZXBlbmRpbmcgb24gaWYgdGhlIGVsZW1lbnQgaXMgYnVzeSBvciBub3QuXG4gICAgICovXG4gICAgZnVuY3Rpb24gaXNCdXN5KGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuICEhZWxlbWVudC5fZXJkQnVzeTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNYXJrcyB0aGUgb2JqZWN0IGlzIGJ1c3kgYW5kIHNob3VsZCBub3QgYmUgbWFkZSBkZXRlY3RhYmxlLlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdG8gbWFyay5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGJ1c3kgSWYgdGhlIGVsZW1lbnQgaXMgYnVzeSBvciBub3QuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbWFya0J1c3koZWxlbWVudCwgYnVzeSkge1xuICAgICAgICBlbGVtZW50Ll9lcmRCdXN5ID0gISFidXN5O1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGlzRGV0ZWN0YWJsZTogaXNEZXRlY3RhYmxlLFxuICAgICAgICBtYXJrQXNEZXRlY3RhYmxlOiBtYXJrQXNEZXRlY3RhYmxlLFxuICAgICAgICBpc0J1c3k6IGlzQnVzeSxcbiAgICAgICAgbWFya0J1c3k6IG1hcmtCdXN5XG4gICAgfTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgaWRDb3VudCA9IDE7XG5cbiAgICAvKipcbiAgICAgKiBHZW5lcmF0ZXMgYSBuZXcgdW5pcXVlIGlkIGluIHRoZSBjb250ZXh0LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSBBIHVuaXF1ZSBpZCBpbiB0aGUgY29udGV4dC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZW5lcmF0ZSgpIHtcbiAgICAgICAgcmV0dXJuIGlkQ291bnQrKztcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBnZW5lcmF0ZTogZ2VuZXJhdGVcbiAgICB9O1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGlkR2VuZXJhdG9yKSB7XG4gICAgdmFyIElEX1BST1BfTkFNRSA9IFwiX2VyZFRhcmdldElkXCI7XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSByZXNpemUgZGV0ZWN0b3IgaWQgb2YgdGhlIGVsZW1lbnQuIElmIHRoZSBlbGVtZW50IGRvZXMgbm90IGhhdmUgYW4gaWQsIG9uZSB3aWxsIGJlIGFzc2lnbmVkIHRvIHRoZSBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIHRhcmdldCBlbGVtZW50IHRvIGdldCB0aGUgaWQgb2YuXG4gICAgICogQHBhcmFtIHtib29sZWFuP30gcmVhZG9ubHkgQW4gaWQgd2lsbCBub3QgYmUgYXNzaWduZWQgdG8gdGhlIGVsZW1lbnQgaWYgdGhlIHJlYWRvbmx5IHBhcmFtZXRlciBpcyB0cnVlLiBEZWZhdWx0IGlzIGZhbHNlLlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd8bnVtYmVyfSBUaGUgaWQgb2YgdGhlIGVsZW1lbnQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0SWQoZWxlbWVudCwgcmVhZG9ubHkpIHtcbiAgICAgICAgaWYoIXJlYWRvbmx5ICYmICFoYXNJZChlbGVtZW50KSkge1xuICAgICAgICAgICAgc2V0SWQoZWxlbWVudCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWxlbWVudFtJRF9QUk9QX05BTUVdO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNldElkKGVsZW1lbnQpIHtcbiAgICAgICAgdmFyIGlkID0gaWRHZW5lcmF0b3IuZ2VuZXJhdGUoKTtcblxuICAgICAgICBlbGVtZW50W0lEX1BST1BfTkFNRV0gPSBpZDtcblxuICAgICAgICByZXR1cm4gaWQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaGFzSWQoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZWxlbWVudFtJRF9QUk9QX05BTUVdICE9PSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVtb3ZlSWQoZWxlbWVudCkge1xuICAgICAgICBkZWxldGUgZWxlbWVudFtJRF9QUk9QX05BTUVdO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGdldDogZ2V0SWQsXG4gICAgICAgIHJlbW92ZTogcmVtb3ZlSWRcbiAgICB9O1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGlkSGFuZGxlcikge1xuICAgIHZhciBldmVudExpc3RlbmVycyA9IHt9O1xuXG4gICAgLyoqXG4gICAgICogR2V0cyBhbGwgbGlzdGVuZXJzIGZvciB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRvIGdldCBhbGwgbGlzdGVuZXJzIGZvci5cbiAgICAgKiBAcmV0dXJucyBBbGwgbGlzdGVuZXJzIGZvciB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRMaXN0ZW5lcnMoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZXZlbnRMaXN0ZW5lcnNbaWRIYW5kbGVyLmdldChlbGVtZW50KV07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RvcmVzIHRoZSBnaXZlbiBsaXN0ZW5lciBmb3IgdGhlIGdpdmVuIGVsZW1lbnQuIFdpbGwgbm90IGFjdHVhbGx5IGFkZCB0aGUgbGlzdGVuZXIgdG8gdGhlIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0aGF0IHNob3VsZCBoYXZlIHRoZSBsaXN0ZW5lciBhZGRlZC5cbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBsaXN0ZW5lciBUaGUgY2FsbGJhY2sgdGhhdCB0aGUgZWxlbWVudCBoYXMgYWRkZWQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gYWRkTGlzdGVuZXIoZWxlbWVudCwgbGlzdGVuZXIpIHtcbiAgICAgICAgdmFyIGlkID0gaWRIYW5kbGVyLmdldChlbGVtZW50KTtcblxuICAgICAgICBpZighZXZlbnRMaXN0ZW5lcnNbaWRdKSB7XG4gICAgICAgICAgICBldmVudExpc3RlbmVyc1tpZF0gPSBbXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGV2ZW50TGlzdGVuZXJzW2lkXS5wdXNoKGxpc3RlbmVyKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW1vdmVMaXN0ZW5lcihlbGVtZW50KSB7XG4gICAgICAgIHZhciBpZCA9IGlkSGFuZGxlci5nZXQoZWxlbWVudCk7XG4gICAgICAgIGlkSGFuZGxlci5yZW1vdmUoZWxlbWVudCk7XG4gICAgICAgIGRlbGV0ZSBldmVudExpc3RlbmVyc1tpZF07XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ2V0OiBnZXRMaXN0ZW5lcnMsXG4gICAgICAgIGFkZDogYWRkTGlzdGVuZXIsXG4gICAgICAgIHJlbW92ZTogcmVtb3ZlTGlzdGVuZXJcbiAgICB9O1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG4vKiBnbG9iYWwgY29uc29sZTogZmFsc2UgKi9cblxuLyoqXG4gKiBSZXBvcnRlciB0aGF0IGhhbmRsZXMgdGhlIHJlcG9ydGluZyBvZiBsb2dzLCB3YXJuaW5ncyBhbmQgZXJyb3JzLlxuICogQHB1YmxpY1xuICogQHBhcmFtIHtib29sZWFufSBxdWlldCBUZWxscyBpZiB0aGUgcmVwb3J0ZXIgc2hvdWxkIGJlIHF1aWV0IG9yIG5vdC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihxdWlldCkge1xuICAgIGZ1bmN0aW9uIG5vb3AoKSB7XG4gICAgICAgIC8vRG9lcyBub3RoaW5nLlxuICAgIH1cblxuICAgIHZhciByZXBvcnRlciA9IHtcbiAgICAgICAgbG9nOiBub29wLFxuICAgICAgICB3YXJuOiBub29wLFxuICAgICAgICBlcnJvcjogbm9vcFxuICAgIH07XG5cbiAgICBpZighcXVpZXQgJiYgd2luZG93LmNvbnNvbGUpIHtcbiAgICAgICAgdmFyIGF0dGFjaEZ1bmN0aW9uID0gZnVuY3Rpb24ocmVwb3J0ZXIsIG5hbWUpIHtcbiAgICAgICAgICAgIC8vVGhlIHByb3h5IGlzIG5lZWRlZCB0byBiZSBhYmxlIHRvIGNhbGwgdGhlIG1ldGhvZCB3aXRoIHRoZSBjb25zb2xlIGNvbnRleHQsXG4gICAgICAgICAgICAvL3NpbmNlIHdlIGNhbm5vdCB1c2UgYmluZC5cbiAgICAgICAgICAgIHJlcG9ydGVyW25hbWVdID0gZnVuY3Rpb24gcmVwb3J0ZXJQcm94eSgpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlW25hbWVdLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9O1xuXG4gICAgICAgIGF0dGFjaEZ1bmN0aW9uKHJlcG9ydGVyLCBcImxvZ1wiKTtcbiAgICAgICAgYXR0YWNoRnVuY3Rpb24ocmVwb3J0ZXIsIFwid2FyblwiKTtcbiAgICAgICAgYXR0YWNoRnVuY3Rpb24ocmVwb3J0ZXIsIFwiZXJyb3JcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcG9ydGVyO1xufTsiXX0=
