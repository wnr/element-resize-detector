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
            getState(element).object = {
              proxy: listenerProxy
            };
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

    function uninstall(element) {
        if(browserDetector.isIE(8)) {
            element.detachEvent("onresize", getState(element).object.proxy);
        } else {
            element.removeChild(getObject(element));
        }
        delete getState(element).object;
    }

    return {
        makeDetectable: makeDetectable,
        addListener: addListener,
        uninstall: uninstall
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

    function removeErdElement(element) {
        element.removeChild(getState(element).element);
        delete getState(element).element;
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

    function uninstall(element, callback) {
        var state = getState(element);
        element.removeChild(state.element);
        delete state.element;
    }

    return {
        makeDetectable: makeDetectable,
        addListener: addListener,
        uninstall: uninstall
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

    function uninstall(element) {
      eventListenerHandler.removeAllListeners(element);
      detectionStrategy.uninstall(element);
      stateHandler.cleanState(element);
    }

    return {
        listenTo: listenTo,
        removeListener: eventListenerHandler.removeListener,
        removeAllListeners: eventListenerHandler.removeAllListeners,
        uninstall: uninstall
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

    function removeListener(element, listener) {
        var listeners = getListeners(element);
        for (var i = 0, len = listeners.length; i < len; ++i) {
            if (listeners[i] === listener) {
              listeners.splice(i, 1);
              break;
            }
        }
    }

    function removeAllListeners(element) {
      eventListeners[idHandler.get(element)].length = 0;
    }

    return {
        get: getListeners,
        add: addListener,
        removeListener: removeListener,
        removeAllListeners: removeAllListeners
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYmF0Y2gtcHJvY2Vzc29yL3NyYy9iYXRjaC1wcm9jZXNzb3IuanMiLCJub2RlX21vZHVsZXMvYmF0Y2gtcHJvY2Vzc29yL3NyYy91dGlscy5qcyIsInNyYy9icm93c2VyLWRldGVjdG9yLmpzIiwic3JjL2NvbGxlY3Rpb24tdXRpbHMuanMiLCJzcmMvZGV0ZWN0aW9uLXN0cmF0ZWd5L29iamVjdC5qcyIsInNyYy9kZXRlY3Rpb24tc3RyYXRlZ3kvc2Nyb2xsLmpzIiwic3JjL2VsZW1lbnQtcmVzaXplLWRldGVjdG9yLmpzIiwic3JjL2VsZW1lbnQtdXRpbHMuanMiLCJzcmMvaWQtZ2VuZXJhdG9yLmpzIiwic3JjL2lkLWhhbmRsZXIuanMiLCJzcmMvbGlzdGVuZXItaGFuZGxlci5qcyIsInNyYy9yZXBvcnRlci5qcyIsInNyYy9zdGF0ZS1oYW5kbGVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaE9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGJhdGNoUHJvY2Vzc29yTWFrZXIob3B0aW9ucykge1xuICAgIG9wdGlvbnMgICAgICAgICAgICAgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciByZXBvcnRlciAgICAgICAgPSBvcHRpb25zLnJlcG9ydGVyO1xuICAgIHZhciBhc3luY1Byb2Nlc3MgICAgPSB1dGlscy5nZXRPcHRpb24ob3B0aW9ucywgXCJhc3luY1wiLCB0cnVlKTtcbiAgICB2YXIgYXV0b1Byb2Nlc3MgICAgID0gdXRpbHMuZ2V0T3B0aW9uKG9wdGlvbnMsIFwiYXV0b1wiLCB0cnVlKTtcblxuICAgIGlmKGF1dG9Qcm9jZXNzICYmICFhc3luY1Byb2Nlc3MpIHtcbiAgICAgICAgcmVwb3J0ZXIgJiYgcmVwb3J0ZXIud2FybihcIkludmFsaWQgb3B0aW9ucyBjb21iaW5hdGlvbi4gYXV0bz10cnVlIGFuZCBhc3luYz1mYWxzZSBpcyBpbnZhbGlkLiBTZXR0aW5nIGFzeW5jPXRydWUuXCIpO1xuICAgICAgICBhc3luY1Byb2Nlc3MgPSB0cnVlO1xuICAgIH1cblxuICAgIHZhciBiYXRjaDtcbiAgICB2YXIgYmF0Y2hTaXplO1xuICAgIHZhciB0b3BMZXZlbDtcbiAgICB2YXIgYm90dG9tTGV2ZWw7XG5cbiAgICBjbGVhckJhdGNoKCk7XG5cbiAgICB2YXIgYXN5bmNGcmFtZUhhbmRsZXI7XG5cbiAgICBmdW5jdGlvbiBhZGRGdW5jdGlvbihsZXZlbCwgZm4pIHtcbiAgICAgICAgaWYoIWZuKSB7XG4gICAgICAgICAgICBmbiA9IGxldmVsO1xuICAgICAgICAgICAgbGV2ZWwgPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYobGV2ZWwgPiB0b3BMZXZlbCkge1xuICAgICAgICAgICAgdG9wTGV2ZWwgPSBsZXZlbDtcbiAgICAgICAgfSBlbHNlIGlmKGxldmVsIDwgYm90dG9tTGV2ZWwpIHtcbiAgICAgICAgICAgIGJvdHRvbUxldmVsID0gbGV2ZWw7XG4gICAgICAgIH1cblxuICAgICAgICBpZighYmF0Y2hbbGV2ZWxdKSB7XG4gICAgICAgICAgICBiYXRjaFtsZXZlbF0gPSBbXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGF1dG9Qcm9jZXNzICYmIGFzeW5jUHJvY2VzcyAmJiBiYXRjaFNpemUgPT09IDApIHtcbiAgICAgICAgICAgIHByb2Nlc3NCYXRjaEFzeW5jKCk7XG4gICAgICAgIH1cblxuICAgICAgICBiYXRjaFtsZXZlbF0ucHVzaChmbik7XG4gICAgICAgIGJhdGNoU2l6ZSsrO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZvcmNlUHJvY2Vzc0JhdGNoKGxvY2FsQXN5bmNQcm9jZXNzKSB7XG4gICAgICAgIGlmKGxvY2FsQXN5bmNQcm9jZXNzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGxvY2FsQXN5bmNQcm9jZXNzID0gYXN5bmNQcm9jZXNzO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoYXN5bmNGcmFtZUhhbmRsZXIpIHtcbiAgICAgICAgICAgIGNhbmNlbEZyYW1lKGFzeW5jRnJhbWVIYW5kbGVyKTtcbiAgICAgICAgICAgIGFzeW5jRnJhbWVIYW5kbGVyID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGxvY2FsQXN5bmNQcm9jZXNzKSB7XG4gICAgICAgICAgICBwcm9jZXNzQmF0Y2hBc3luYygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvY2Vzc0JhdGNoKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwcm9jZXNzQmF0Y2goKSB7XG4gICAgICAgIGZvcih2YXIgbGV2ZWwgPSBib3R0b21MZXZlbDsgbGV2ZWwgPD0gdG9wTGV2ZWw7IGxldmVsKyspIHtcbiAgICAgICAgICAgIHZhciBmbnMgPSBiYXRjaFtsZXZlbF07XG5cbiAgICAgICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBmbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgZm4gPSBmbnNbaV07XG4gICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjbGVhckJhdGNoKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcHJvY2Vzc0JhdGNoQXN5bmMoKSB7XG4gICAgICAgIGFzeW5jRnJhbWVIYW5kbGVyID0gcmVxdWVzdEZyYW1lKHByb2Nlc3NCYXRjaCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2xlYXJCYXRjaCgpIHtcbiAgICAgICAgYmF0Y2ggICAgICAgICAgID0ge307XG4gICAgICAgIGJhdGNoU2l6ZSAgICAgICA9IDA7XG4gICAgICAgIHRvcExldmVsICAgICAgICA9IDA7XG4gICAgICAgIGJvdHRvbUxldmVsICAgICA9IDA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2FuY2VsRnJhbWUobGlzdGVuZXIpIHtcbiAgICAgICAgLy8gdmFyIGNhbmNlbCA9IHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSB8fCB3aW5kb3cubW96Q2FuY2VsQW5pbWF0aW9uRnJhbWUgfHwgd2luZG93LndlYmtpdENhbmNlbEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy5jbGVhclRpbWVvdXQ7XG4gICAgICAgIHZhciBjYW5jZWwgPSB3aW5kb3cuY2xlYXJUaW1lb3V0O1xuICAgICAgICByZXR1cm4gY2FuY2VsKGxpc3RlbmVyKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXF1ZXN0RnJhbWUoY2FsbGJhY2spIHtcbiAgICAgICAgLy8gdmFyIHJhZiA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHwgd2luZG93Lm1velJlcXVlc3RBbmltYXRpb25GcmFtZSB8fCB3aW5kb3cud2Via2l0UmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8IGZ1bmN0aW9uKGZuKSB7IHJldHVybiB3aW5kb3cuc2V0VGltZW91dChmbiwgMjApOyB9O1xuICAgICAgICB2YXIgcmFmID0gZnVuY3Rpb24oZm4pIHsgcmV0dXJuIHdpbmRvdy5zZXRUaW1lb3V0KGZuLCAwKTsgfTtcbiAgICAgICAgcmV0dXJuIHJhZihjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgYWRkOiBhZGRGdW5jdGlvbixcbiAgICAgICAgZm9yY2U6IGZvcmNlUHJvY2Vzc0JhdGNoXG4gICAgfTtcbn07IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbnV0aWxzLmdldE9wdGlvbiA9IGdldE9wdGlvbjtcblxuZnVuY3Rpb24gZ2V0T3B0aW9uKG9wdGlvbnMsIG5hbWUsIGRlZmF1bHRWYWx1ZSkge1xuICAgIHZhciB2YWx1ZSA9IG9wdGlvbnNbbmFtZV07XG5cbiAgICBpZigodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkgJiYgZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdmFsdWU7XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGRldGVjdG9yID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuZGV0ZWN0b3IuaXNJRSA9IGZ1bmN0aW9uKHZlcnNpb24pIHtcbiAgICBmdW5jdGlvbiBpc0FueUllVmVyc2lvbigpIHtcbiAgICAgICAgdmFyIGFnZW50ID0gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICByZXR1cm4gYWdlbnQuaW5kZXhPZihcIm1zaWVcIikgIT09IC0xIHx8IGFnZW50LmluZGV4T2YoXCJ0cmlkZW50XCIpICE9PSAtMSB8fCBhZ2VudC5pbmRleE9mKFwiIGVkZ2UvXCIpICE9PSAtMTtcbiAgICB9XG5cbiAgICBpZighaXNBbnlJZVZlcnNpb24oKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYoIXZlcnNpb24pIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy9TaGFtZWxlc3NseSBzdG9sZW4gZnJvbSBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9wYWRvbHNleS81Mjc2ODNcbiAgICB2YXIgaWVWZXJzaW9uID0gKGZ1bmN0aW9uKCl7XG4gICAgICAgIHZhciB1bmRlZixcbiAgICAgICAgICAgIHYgPSAzLFxuICAgICAgICAgICAgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSxcbiAgICAgICAgICAgIGFsbCA9IGRpdi5nZXRFbGVtZW50c0J5VGFnTmFtZShcImlcIik7XG5cbiAgICAgICAgZG8ge1xuICAgICAgICAgICAgZGl2LmlubmVySFRNTCA9IFwiPCEtLVtpZiBndCBJRSBcIiArICgrK3YpICsgXCJdPjxpPjwvaT48IVtlbmRpZl0tLT5cIjtcbiAgICAgICAgfVxuICAgICAgICB3aGlsZSAoYWxsWzBdKTtcblxuICAgICAgICByZXR1cm4gdiA+IDQgPyB2IDogdW5kZWY7XG4gICAgfSgpKTtcblxuICAgIHJldHVybiB2ZXJzaW9uID09PSBpZVZlcnNpb247XG59O1xuXG5kZXRlY3Rvci5pc0xlZ2FjeU9wZXJhID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuICEhd2luZG93Lm9wZXJhO1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG4vKipcbiAqIExvb3BzIHRocm91Z2ggdGhlIGNvbGxlY3Rpb24gYW5kIGNhbGxzIHRoZSBjYWxsYmFjayBmb3IgZWFjaCBlbGVtZW50LiBpZiB0aGUgY2FsbGJhY2sgcmV0dXJucyB0cnV0aHksIHRoZSBsb29wIGlzIGJyb2tlbiBhbmQgcmV0dXJucyB0aGUgc2FtZSB2YWx1ZS5cbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSB7Kn0gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBsb29wIHRocm91Z2guIE5lZWRzIHRvIGhhdmUgYSBsZW5ndGggcHJvcGVydHkgc2V0IGFuZCBoYXZlIGluZGljZXMgc2V0IGZyb20gMCB0byBsZW5ndGggLSAxLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCBmb3IgZWFjaCBlbGVtZW50LiBUaGUgZWxlbWVudCB3aWxsIGJlIGdpdmVuIGFzIGEgcGFyYW1ldGVyIHRvIHRoZSBjYWxsYmFjay4gSWYgdGhpcyBjYWxsYmFjayByZXR1cm5zIHRydXRoeSwgdGhlIGxvb3AgaXMgYnJva2VuIGFuZCB0aGUgc2FtZSB2YWx1ZSBpcyByZXR1cm5lZC5cbiAqIEByZXR1cm5zIHsqfSBUaGUgdmFsdWUgdGhhdCBhIGNhbGxiYWNrIGhhcyByZXR1cm5lZCAoaWYgdHJ1dGh5KS4gT3RoZXJ3aXNlIG5vdGhpbmcuXG4gKi9cbnV0aWxzLmZvckVhY2ggPSBmdW5jdGlvbihjb2xsZWN0aW9uLCBjYWxsYmFjaykge1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBjb2xsZWN0aW9uLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBjYWxsYmFjayhjb2xsZWN0aW9uW2ldKTtcbiAgICAgICAgaWYocmVzdWx0KSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgfVxufTtcbiIsIi8qKlxuICogUmVzaXplIGRldGVjdGlvbiBzdHJhdGVneSB0aGF0IGluamVjdHMgb2JqZWN0cyB0byBlbGVtZW50cyBpbiBvcmRlciB0byBkZXRlY3QgcmVzaXplIGV2ZW50cy5cbiAqIEhlYXZpbHkgaW5zcGlyZWQgYnk6IGh0dHA6Ly93d3cuYmFja2FsbGV5Y29kZXIuY29tLzIwMTMvMDMvMTgvY3Jvc3MtYnJvd3Nlci1ldmVudC1iYXNlZC1lbGVtZW50LXJlc2l6ZS1kZXRlY3Rpb24vXG4gKi9cblxuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBicm93c2VyRGV0ZWN0b3IgPSByZXF1aXJlKFwiLi4vYnJvd3Nlci1kZXRlY3RvclwiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgb3B0aW9ucyAgICAgICAgICAgICA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIHJlcG9ydGVyICAgICAgICA9IG9wdGlvbnMucmVwb3J0ZXI7XG4gICAgdmFyIGJhdGNoUHJvY2Vzc29yICA9IG9wdGlvbnMuYmF0Y2hQcm9jZXNzb3I7XG4gICAgdmFyIGdldFN0YXRlICAgICAgICA9IG9wdGlvbnMuc3RhdGVIYW5kbGVyLmdldFN0YXRlO1xuXG4gICAgaWYoIXJlcG9ydGVyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk1pc3NpbmcgcmVxdWlyZWQgZGVwZW5kZW5jeTogcmVwb3J0ZXIuXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSByZXNpemUgZXZlbnQgbGlzdGVuZXIgdG8gdGhlIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0aGF0IHNob3VsZCBoYXZlIHRoZSBsaXN0ZW5lciBhZGRlZC5cbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBsaXN0ZW5lciBUaGUgbGlzdGVuZXIgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIGZvciBlYWNoIHJlc2l6ZSBldmVudCBvZiB0aGUgZWxlbWVudC4gVGhlIGVsZW1lbnQgd2lsbCBiZSBnaXZlbiBhcyBhIHBhcmFtZXRlciB0byB0aGUgbGlzdGVuZXIgY2FsbGJhY2suXG4gICAgICovXG4gICAgZnVuY3Rpb24gYWRkTGlzdGVuZXIoZWxlbWVudCwgbGlzdGVuZXIpIHtcbiAgICAgICAgaWYoIWdldE9iamVjdChlbGVtZW50KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRWxlbWVudCBpcyBub3QgZGV0ZWN0YWJsZSBieSB0aGlzIHN0cmF0ZWd5LlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGxpc3RlbmVyUHJveHkoKSB7XG4gICAgICAgICAgICBsaXN0ZW5lcihlbGVtZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGJyb3dzZXJEZXRlY3Rvci5pc0lFKDgpKSB7XG4gICAgICAgICAgICAvL0lFIDggZG9lcyBub3Qgc3VwcG9ydCBvYmplY3QsIGJ1dCBzdXBwb3J0cyB0aGUgcmVzaXplIGV2ZW50IGRpcmVjdGx5IG9uIGVsZW1lbnRzLlxuICAgICAgICAgICAgZ2V0U3RhdGUoZWxlbWVudCkub2JqZWN0ID0ge1xuICAgICAgICAgICAgICBwcm94eTogbGlzdGVuZXJQcm94eVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGVsZW1lbnQuYXR0YWNoRXZlbnQoXCJvbnJlc2l6ZVwiLCBsaXN0ZW5lclByb3h5KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBvYmplY3QgPSBnZXRPYmplY3QoZWxlbWVudCk7XG4gICAgICAgICAgICBvYmplY3QuY29udGVudERvY3VtZW50LmRlZmF1bHRWaWV3LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgbGlzdGVuZXJQcm94eSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNYWtlcyBhbiBlbGVtZW50IGRldGVjdGFibGUgYW5kIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgZXZlbnRzLiBXaWxsIGNhbGwgdGhlIGNhbGxiYWNrIHdoZW4gdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBjaGFuZ2VzLlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRvIG1ha2UgZGV0ZWN0YWJsZVxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIFRoZSBjYWxsYmFjayB0byBiZSBjYWxsZWQgd2hlbiB0aGUgZWxlbWVudCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGNoYW5nZXMuIFdpbGwgYmUgY2FsbGVkIHdpdGggdGhlIGVsZW1lbnQgYXMgZmlyc3QgcGFyYW1ldGVyLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIG1ha2VEZXRlY3RhYmxlKGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gICAgICAgIGZ1bmN0aW9uIGluamVjdE9iamVjdChlbGVtZW50LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgdmFyIE9CSkVDVF9TVFlMRSA9IFwiZGlzcGxheTogYmxvY2s7IHBvc2l0aW9uOiBhYnNvbHV0ZTsgdG9wOiAwOyBsZWZ0OiAwOyB3aWR0aDogMTAwJTsgaGVpZ2h0OiAxMDAlOyBib3JkZXI6IG5vbmU7IHBhZGRpbmc6IDA7IG1hcmdpbjogMDsgb3BhY2l0eTogMDsgei1pbmRleDogLTEwMDA7IHBvaW50ZXItZXZlbnRzOiBub25lO1wiO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBvbk9iamVjdExvYWQoKSB7XG4gICAgICAgICAgICAgICAgLypqc2hpbnQgdmFsaWR0aGlzOiB0cnVlICovXG5cbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBnZXREb2N1bWVudChlbGVtZW50LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgICAgICAvL09wZXJhIDEyIHNlZW0gdG8gY2FsbCB0aGUgb2JqZWN0Lm9ubG9hZCBiZWZvcmUgdGhlIGFjdHVhbCBkb2N1bWVudCBoYXMgYmVlbiBjcmVhdGVkLlxuICAgICAgICAgICAgICAgICAgICAvL1NvIGlmIGl0IGlzIG5vdCBwcmVzZW50LCBwb2xsIGl0IHdpdGggYW4gdGltZW91dCB1bnRpbCBpdCBpcyBwcmVzZW50LlxuICAgICAgICAgICAgICAgICAgICAvL1RPRE86IENvdWxkIG1heWJlIGJlIGhhbmRsZWQgYmV0dGVyIHdpdGggb2JqZWN0Lm9ucmVhZHlzdGF0ZWNoYW5nZSBvciBzaW1pbGFyLlxuICAgICAgICAgICAgICAgICAgICBpZighZWxlbWVudC5jb250ZW50RG9jdW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gY2hlY2tGb3JPYmplY3REb2N1bWVudCgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZXREb2N1bWVudChlbGVtZW50LCBjYWxsYmFjayk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCAxMDApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlbGVtZW50LmNvbnRlbnREb2N1bWVudCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy9NdXRhdGluZyB0aGUgb2JqZWN0IGVsZW1lbnQgaGVyZSBzZWVtcyB0byBmaXJlIGFub3RoZXIgbG9hZCBldmVudC5cbiAgICAgICAgICAgICAgICAvL011dGF0aW5nIHRoZSBpbm5lciBkb2N1bWVudCBvZiB0aGUgb2JqZWN0IGVsZW1lbnQgaXMgZmluZSB0aG91Z2guXG4gICAgICAgICAgICAgICAgdmFyIG9iamVjdEVsZW1lbnQgPSB0aGlzO1xuXG4gICAgICAgICAgICAgICAgLy9DcmVhdGUgdGhlIHN0eWxlIGVsZW1lbnQgdG8gYmUgYWRkZWQgdG8gdGhlIG9iamVjdC5cbiAgICAgICAgICAgICAgICBnZXREb2N1bWVudChvYmplY3RFbGVtZW50LCBmdW5jdGlvbiBvbk9iamVjdERvY3VtZW50UmVhZHkob2JqZWN0RG9jdW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy9Ob3RpZnkgdGhhdCB0aGUgZWxlbWVudCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCB0by5cbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vVGhlIHRhcmdldCBlbGVtZW50IG5lZWRzIHRvIGJlIHBvc2l0aW9uZWQgKGV2ZXJ5dGhpbmcgZXhjZXB0IHN0YXRpYykgc28gdGhlIGFic29sdXRlIHBvc2l0aW9uZWQgb2JqZWN0IHdpbGwgYmUgcG9zaXRpb25lZCByZWxhdGl2ZSB0byB0aGUgdGFyZ2V0IGVsZW1lbnQuXG4gICAgICAgICAgICB2YXIgc3R5bGUgPSBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuICAgICAgICAgICAgdmFyIHBvc2l0aW9uID0gc3R5bGUucG9zaXRpb247XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIG11dGF0ZURvbSgpIHtcbiAgICAgICAgICAgICAgICBpZihwb3NpdGlvbiA9PT0gXCJzdGF0aWNcIikge1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gXCJyZWxhdGl2ZVwiO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciByZW1vdmVSZWxhdGl2ZVN0eWxlcyA9IGZ1bmN0aW9uKHJlcG9ydGVyLCBlbGVtZW50LCBzdHlsZSwgcHJvcGVydHkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGdldE51bWVyaWNhbFZhbHVlKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1teLVxcZFxcLl0vZywgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IHN0eWxlW3Byb3BlcnR5XTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYodmFsdWUgIT09IFwiYXV0b1wiICYmIGdldE51bWVyaWNhbFZhbHVlKHZhbHVlKSAhPT0gXCIwXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRlci53YXJuKFwiQW4gZWxlbWVudCB0aGF0IGlzIHBvc2l0aW9uZWQgc3RhdGljIGhhcyBzdHlsZS5cIiArIHByb3BlcnR5ICsgXCI9XCIgKyB2YWx1ZSArIFwiIHdoaWNoIGlzIGlnbm9yZWQgZHVlIHRvIHRoZSBzdGF0aWMgcG9zaXRpb25pbmcuIFRoZSBlbGVtZW50IHdpbGwgbmVlZCB0byBiZSBwb3NpdGlvbmVkIHJlbGF0aXZlLCBzbyB0aGUgc3R5bGUuXCIgKyBwcm9wZXJ0eSArIFwiIHdpbGwgYmUgc2V0IHRvIDAuIEVsZW1lbnQ6IFwiLCBlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlW3Byb3BlcnR5XSA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgICAgLy9DaGVjayBzbyB0aGF0IHRoZXJlIGFyZSBubyBhY2NpZGVudGFsIHN0eWxlcyB0aGF0IHdpbGwgbWFrZSB0aGUgZWxlbWVudCBzdHlsZWQgZGlmZmVyZW50bHkgbm93IHRoYXQgaXMgaXMgcmVsYXRpdmUuXG4gICAgICAgICAgICAgICAgICAgIC8vSWYgdGhlcmUgYXJlIGFueSwgc2V0IHRoZW0gdG8gMCAodGhpcyBzaG91bGQgYmUgb2theSB3aXRoIHRoZSB1c2VyIHNpbmNlIHRoZSBzdHlsZSBwcm9wZXJ0aWVzIGRpZCBub3RoaW5nIGJlZm9yZSBbc2luY2UgdGhlIGVsZW1lbnQgd2FzIHBvc2l0aW9uZWQgc3RhdGljXSBhbnl3YXkpLlxuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIFwidG9wXCIpO1xuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgICAgIHJlbW92ZVJlbGF0aXZlU3R5bGVzKHJlcG9ydGVyLCBlbGVtZW50LCBzdHlsZSwgXCJib3R0b21cIik7XG4gICAgICAgICAgICAgICAgICAgIHJlbW92ZVJlbGF0aXZlU3R5bGVzKHJlcG9ydGVyLCBlbGVtZW50LCBzdHlsZSwgXCJsZWZ0XCIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vQWRkIGFuIG9iamVjdCBlbGVtZW50IGFzIGEgY2hpbGQgdG8gdGhlIHRhcmdldCBlbGVtZW50IHRoYXQgd2lsbCBiZSBsaXN0ZW5lZCB0byBmb3IgcmVzaXplIGV2ZW50cy5cbiAgICAgICAgICAgICAgICB2YXIgb2JqZWN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIm9iamVjdFwiKTtcbiAgICAgICAgICAgICAgICBvYmplY3Quc3R5bGUuY3NzVGV4dCA9IE9CSkVDVF9TVFlMRTtcbiAgICAgICAgICAgICAgICBvYmplY3QudHlwZSA9IFwidGV4dC9odG1sXCI7XG4gICAgICAgICAgICAgICAgb2JqZWN0Lm9ubG9hZCA9IG9uT2JqZWN0TG9hZDtcblxuICAgICAgICAgICAgICAgIC8vU2FmYXJpOiBUaGlzIG11c3Qgb2NjdXIgYmVmb3JlIGFkZGluZyB0aGUgb2JqZWN0IHRvIHRoZSBET00uXG4gICAgICAgICAgICAgICAgLy9JRTogRG9lcyBub3QgbGlrZSB0aGF0IHRoaXMgaGFwcGVucyBiZWZvcmUsIGV2ZW4gaWYgaXQgaXMgYWxzbyBhZGRlZCBhZnRlci5cbiAgICAgICAgICAgICAgICBpZighYnJvd3NlckRldGVjdG9yLmlzSUUoKSkge1xuICAgICAgICAgICAgICAgICAgICBvYmplY3QuZGF0YSA9IFwiYWJvdXQ6YmxhbmtcIjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBlbGVtZW50LmFwcGVuZENoaWxkKG9iamVjdCk7XG4gICAgICAgICAgICAgICAgZ2V0U3RhdGUoZWxlbWVudCkub2JqZWN0ID0gb2JqZWN0O1xuXG4gICAgICAgICAgICAgICAgLy9JRTogVGhpcyBtdXN0IG9jY3VyIGFmdGVyIGFkZGluZyB0aGUgb2JqZWN0IHRvIHRoZSBET00uXG4gICAgICAgICAgICAgICAgaWYoYnJvd3NlckRldGVjdG9yLmlzSUUoKSkge1xuICAgICAgICAgICAgICAgICAgICBvYmplY3QuZGF0YSA9IFwiYWJvdXQ6YmxhbmtcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKGJhdGNoUHJvY2Vzc29yKSB7XG4gICAgICAgICAgICAgICAgYmF0Y2hQcm9jZXNzb3IuYWRkKG11dGF0ZURvbSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG11dGF0ZURvbSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYoYnJvd3NlckRldGVjdG9yLmlzSUUoOCkpIHtcbiAgICAgICAgICAgIC8vSUUgOCBkb2VzIG5vdCBzdXBwb3J0IG9iamVjdHMgcHJvcGVybHkuIEx1Y2tpbHkgdGhleSBkbyBzdXBwb3J0IHRoZSByZXNpemUgZXZlbnQuXG4gICAgICAgICAgICAvL1NvIGRvIG5vdCBpbmplY3QgdGhlIG9iamVjdCBhbmQgbm90aWZ5IHRoYXQgdGhlIGVsZW1lbnQgaXMgYWxyZWFkeSByZWFkeSB0byBiZSBsaXN0ZW5lZCB0by5cbiAgICAgICAgICAgIC8vVGhlIGV2ZW50IGhhbmRsZXIgZm9yIHRoZSByZXNpemUgZXZlbnQgaXMgYXR0YWNoZWQgaW4gdGhlIHV0aWxzLmFkZExpc3RlbmVyIGluc3RlYWQuXG4gICAgICAgICAgICBjYWxsYmFjayhlbGVtZW50KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluamVjdE9iamVjdChlbGVtZW50LCBjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjaGlsZCBvYmplY3Qgb2YgdGhlIHRhcmdldCBlbGVtZW50LlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSB0YXJnZXQgZWxlbWVudC5cbiAgICAgKiBAcmV0dXJucyBUaGUgb2JqZWN0IGVsZW1lbnQgb2YgdGhlIHRhcmdldC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRPYmplY3QoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZ2V0U3RhdGUoZWxlbWVudCkub2JqZWN0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVuaW5zdGFsbChlbGVtZW50KSB7XG4gICAgICAgIGlmKGJyb3dzZXJEZXRlY3Rvci5pc0lFKDgpKSB7XG4gICAgICAgICAgICBlbGVtZW50LmRldGFjaEV2ZW50KFwib25yZXNpemVcIiwgZ2V0U3RhdGUoZWxlbWVudCkub2JqZWN0LnByb3h5KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQ2hpbGQoZ2V0T2JqZWN0KGVsZW1lbnQpKTtcbiAgICAgICAgfVxuICAgICAgICBkZWxldGUgZ2V0U3RhdGUoZWxlbWVudCkub2JqZWN0O1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIG1ha2VEZXRlY3RhYmxlOiBtYWtlRGV0ZWN0YWJsZSxcbiAgICAgICAgYWRkTGlzdGVuZXI6IGFkZExpc3RlbmVyLFxuICAgICAgICB1bmluc3RhbGw6IHVuaW5zdGFsbFxuICAgIH07XG59O1xuIiwiLyoqXG4gKiBSZXNpemUgZGV0ZWN0aW9uIHN0cmF0ZWd5IHRoYXQgaW5qZWN0cyBkaXZzIHRvIGVsZW1lbnRzIGluIG9yZGVyIHRvIGRldGVjdCByZXNpemUgZXZlbnRzIG9uIHNjcm9sbCBldmVudHMuXG4gKiBIZWF2aWx5IGluc3BpcmVkIGJ5OiBodHRwczovL2dpdGh1Yi5jb20vbWFyY2ovY3NzLWVsZW1lbnQtcXVlcmllcy9ibG9iL21hc3Rlci9zcmMvUmVzaXplU2Vuc29yLmpzXG4gKi9cblxuXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIG9wdGlvbnMgICAgICAgICAgICAgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciByZXBvcnRlciAgICAgICAgPSBvcHRpb25zLnJlcG9ydGVyO1xuICAgIHZhciBiYXRjaFByb2Nlc3NvciAgPSBvcHRpb25zLmJhdGNoUHJvY2Vzc29yO1xuICAgIHZhciBnZXRTdGF0ZSAgICAgICAgPSBvcHRpb25zLnN0YXRlSGFuZGxlci5nZXRTdGF0ZTtcblxuICAgIGlmKCFyZXBvcnRlcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJNaXNzaW5nIHJlcXVpcmVkIGRlcGVuZGVuY3k6IHJlcG9ydGVyLlwiKTtcbiAgICB9XG5cbiAgICAvL1RPRE86IENvdWxkIHRoaXMgcGVyaGFwcyBiZSBkb25lIGF0IGluc3RhbGxhdGlvbiB0aW1lP1xuICAgIHZhciBzY3JvbGxiYXJTaXplcyA9IGdldFNjcm9sbGJhclNpemVzKCk7XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgcmVzaXplIGV2ZW50IGxpc3RlbmVyIHRvIHRoZSBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdGhhdCBzaG91bGQgaGF2ZSB0aGUgbGlzdGVuZXIgYWRkZWQuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gbGlzdGVuZXIgVGhlIGxpc3RlbmVyIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCBmb3IgZWFjaCByZXNpemUgZXZlbnQgb2YgdGhlIGVsZW1lbnQuIFRoZSBlbGVtZW50IHdpbGwgYmUgZ2l2ZW4gYXMgYSBwYXJhbWV0ZXIgdG8gdGhlIGxpc3RlbmVyIGNhbGxiYWNrLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGFkZExpc3RlbmVyKGVsZW1lbnQsIGxpc3RlbmVyKSB7XG4gICAgICAgIHZhciBjaGFuZ2VkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2YXIgZWxlbWVudFN0eWxlICAgID0gZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcbiAgICAgICAgICAgIHZhciB3aWR0aCAgICAgICAgICAgPSBwYXJzZVNpemUoZWxlbWVudFN0eWxlLndpZHRoKTtcbiAgICAgICAgICAgIHZhciBoZWlnaHQgICAgICAgICAgPSBwYXJzZVNpemUoZWxlbWVudFN0eWxlLmhlaWdodCk7XG5cbiAgICAgICAgICAgIC8vIFN0b3JlIHRoZSBzaXplIG9mIHRoZSBlbGVtZW50IHN5bmMgaGVyZSwgc28gdGhhdCBtdWx0aXBsZSBzY3JvbGwgZXZlbnRzIG1heSBiZSBpZ25vcmVkIGluIHRoZSBldmVudCBsaXN0ZW5lcnMuXG4gICAgICAgICAgICAvLyBPdGhlcndpc2UgdGhlIGlmLWNoZWNrIGluIGhhbmRsZVNjcm9sbCBpcyB1c2VsZXNzLlxuICAgICAgICAgICAgc3RvcmVDdXJyZW50U2l6ZShlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KTtcblxuICAgICAgICAgICAgYmF0Y2hQcm9jZXNzb3IuYWRkKGZ1bmN0aW9uIHVwZGF0ZURldGVjdG9yRWxlbWVudHMoKSB7XG4gICAgICAgICAgICAgICAgdXBkYXRlQ2hpbGRTaXplcyhlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBiYXRjaFByb2Nlc3Nvci5hZGQoMSwgZnVuY3Rpb24gdXBkYXRlU2Nyb2xsYmFycygpIHtcbiAgICAgICAgICAgICAgICBwb3NpdGlvblNjcm9sbGJhcnMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIoZWxlbWVudCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBmdW5jdGlvbiBoYW5kbGVTY3JvbGwoKSB7XG4gICAgICAgICAgICB2YXIgc3R5bGUgPSBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuICAgICAgICAgICAgdmFyIHdpZHRoID0gcGFyc2VTaXplKHN0eWxlLndpZHRoKTtcbiAgICAgICAgICAgIHZhciBoZWlnaHQgPSBwYXJzZVNpemUoc3R5bGUuaGVpZ2h0KTtcblxuICAgICAgICAgICAgaWYgKHdpZHRoICE9PSBlbGVtZW50Lmxhc3RXaWR0aCB8fCBoZWlnaHQgIT09IGVsZW1lbnQubGFzdEhlaWdodCkge1xuICAgICAgICAgICAgICAgIGNoYW5nZWQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBleHBhbmQgPSBnZXRFeHBhbmRFbGVtZW50KGVsZW1lbnQpO1xuICAgICAgICB2YXIgc2hyaW5rID0gZ2V0U2hyaW5rRWxlbWVudChlbGVtZW50KTtcblxuICAgICAgICBhZGRFdmVudChleHBhbmQsIFwic2Nyb2xsXCIsIGhhbmRsZVNjcm9sbCk7XG4gICAgICAgIGFkZEV2ZW50KHNocmluaywgXCJzY3JvbGxcIiwgaGFuZGxlU2Nyb2xsKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNYWtlcyBhbiBlbGVtZW50IGRldGVjdGFibGUgYW5kIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgZXZlbnRzLiBXaWxsIGNhbGwgdGhlIGNhbGxiYWNrIHdoZW4gdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBjaGFuZ2VzLlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRvIG1ha2UgZGV0ZWN0YWJsZVxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIFRoZSBjYWxsYmFjayB0byBiZSBjYWxsZWQgd2hlbiB0aGUgZWxlbWVudCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGNoYW5nZXMuIFdpbGwgYmUgY2FsbGVkIHdpdGggdGhlIGVsZW1lbnQgYXMgZmlyc3QgcGFyYW1ldGVyLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIG1ha2VEZXRlY3RhYmxlKGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gICAgICAgIC8vIFJlYWRpbmcgcHJvcGVydGllcyBvZiBlbGVtZW50U3R5bGUgd2lsbCByZXN1bHQgaW4gYSBmb3JjZWQgZ2V0Q29tcHV0ZWRTdHlsZSBmb3Igc29tZSBicm93c2Vycywgc28gcmVhZCBhbGwgdmFsdWVzIGFuZCBzdG9yZSB0aGVtIGFzIHByaW1pdGl2ZXMgaGVyZS5cbiAgICAgICAgdmFyIGVsZW1lbnRTdHlsZSAgICAgICAgPSBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuICAgICAgICB2YXIgcG9zaXRpb24gICAgICAgICAgICA9IGVsZW1lbnRTdHlsZS5wb3NpdGlvbjtcbiAgICAgICAgdmFyIHdpZHRoICAgICAgICAgICAgICAgPSBwYXJzZVNpemUoZWxlbWVudFN0eWxlLndpZHRoKTtcbiAgICAgICAgdmFyIGhlaWdodCAgICAgICAgICAgICAgPSBwYXJzZVNpemUoZWxlbWVudFN0eWxlLmhlaWdodCk7XG4gICAgICAgIHZhciB0b3AgICAgICAgICAgICAgICAgID0gZWxlbWVudFN0eWxlLnRvcDtcbiAgICAgICAgdmFyIHJpZ2h0ICAgICAgICAgICAgICAgPSBlbGVtZW50U3R5bGUucmlnaHQ7XG4gICAgICAgIHZhciBib3R0b20gICAgICAgICAgICAgID0gZWxlbWVudFN0eWxlLmJvdHRvbTtcbiAgICAgICAgdmFyIGxlZnQgICAgICAgICAgICAgICAgPSBlbGVtZW50U3R5bGUubGVmdDtcbiAgICAgICAgdmFyIHJlYWR5RXhwYW5kU2Nyb2xsICAgPSBmYWxzZTtcbiAgICAgICAgdmFyIHJlYWR5U2hyaW5rU2Nyb2xsICAgPSBmYWxzZTtcbiAgICAgICAgdmFyIHJlYWR5T3ZlcmFsbCAgICAgICAgPSBmYWxzZTtcblxuICAgICAgICBmdW5jdGlvbiByZWFkeSgpIHtcbiAgICAgICAgICAgIGlmKHJlYWR5RXhwYW5kU2Nyb2xsICYmIHJlYWR5U2hyaW5rU2Nyb2xsICYmIHJlYWR5T3ZlcmFsbCkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gbXV0YXRlRG9tKCkge1xuICAgICAgICAgICAgaWYocG9zaXRpb24gPT09IFwic3RhdGljXCIpIHtcbiAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gXCJyZWxhdGl2ZVwiO1xuXG4gICAgICAgICAgICAgICAgdmFyIHJlbW92ZVJlbGF0aXZlU3R5bGVzID0gZnVuY3Rpb24ocmVwb3J0ZXIsIGVsZW1lbnQsIHZhbHVlLCBwcm9wZXJ0eSkge1xuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBnZXROdW1lcmljYWxWYWx1ZSh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1teLVxcZFxcLl0vZywgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZih2YWx1ZSAhPT0gXCJhdXRvXCIgJiYgZ2V0TnVtZXJpY2FsVmFsdWUodmFsdWUpICE9PSBcIjBcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0ZXIud2FybihcIkFuIGVsZW1lbnQgdGhhdCBpcyBwb3NpdGlvbmVkIHN0YXRpYyBoYXMgc3R5bGUuXCIgKyBwcm9wZXJ0eSArIFwiPVwiICsgdmFsdWUgKyBcIiB3aGljaCBpcyBpZ25vcmVkIGR1ZSB0byB0aGUgc3RhdGljIHBvc2l0aW9uaW5nLiBUaGUgZWxlbWVudCB3aWxsIG5lZWQgdG8gYmUgcG9zaXRpb25lZCByZWxhdGl2ZSwgc28gdGhlIHN0eWxlLlwiICsgcHJvcGVydHkgKyBcIiB3aWxsIGJlIHNldCB0byAwLiBFbGVtZW50OiBcIiwgZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlW3Byb3BlcnR5XSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgLy9DaGVjayBzbyB0aGF0IHRoZXJlIGFyZSBubyBhY2NpZGVudGFsIHN0eWxlcyB0aGF0IHdpbGwgbWFrZSB0aGUgZWxlbWVudCBzdHlsZWQgZGlmZmVyZW50bHkgbm93IHRoYXQgaXMgaXMgcmVsYXRpdmUuXG4gICAgICAgICAgICAgICAgLy9JZiB0aGVyZSBhcmUgYW55LCBzZXQgdGhlbSB0byAwICh0aGlzIHNob3VsZCBiZSBva2F5IHdpdGggdGhlIHVzZXIgc2luY2UgdGhlIHN0eWxlIHByb3BlcnRpZXMgZGlkIG5vdGhpbmcgYmVmb3JlIFtzaW5jZSB0aGUgZWxlbWVudCB3YXMgcG9zaXRpb25lZCBzdGF0aWNdIGFueXdheSkuXG4gICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIHRvcCwgXCJ0b3BcIik7XG4gICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIHJpZ2h0LCBcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgIHJlbW92ZVJlbGF0aXZlU3R5bGVzKHJlcG9ydGVyLCBlbGVtZW50LCBib3R0b20sIFwiYm90dG9tXCIpO1xuICAgICAgICAgICAgICAgIHJlbW92ZVJlbGF0aXZlU3R5bGVzKHJlcG9ydGVyLCBlbGVtZW50LCBsZWZ0LCBcImxlZnRcIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGdldENvbnRhaW5lckNzc1RleHQobGVmdCwgdG9wLCBib3R0b20sIHJpZ2h0KSB7XG4gICAgICAgICAgICAgICAgbGVmdCA9ICghbGVmdCA/IFwiMFwiIDogKGxlZnQgKyBcInB4XCIpKTtcbiAgICAgICAgICAgICAgICB0b3AgPSAoIXRvcCA/IFwiMFwiIDogKHRvcCArIFwicHhcIikpO1xuICAgICAgICAgICAgICAgIGJvdHRvbSA9ICghYm90dG9tID8gXCIwXCIgOiAoYm90dG9tICsgXCJweFwiKSk7XG4gICAgICAgICAgICAgICAgcmlnaHQgPSAoIXJpZ2h0ID8gXCIwXCIgOiAocmlnaHQgKyBcInB4XCIpKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBcInBvc2l0aW9uOiBhYnNvbHV0ZTsgbGVmdDogXCIgKyBsZWZ0ICsgXCI7IHRvcDogXCIgKyB0b3AgKyBcIjsgcmlnaHQ6IFwiICsgcmlnaHQgKyBcIjsgYm90dG9tOiBcIiArIGJvdHRvbSArIFwiOyBvdmVyZmxvdzogc2Nyb2xsOyB6LWluZGV4OiAtMTsgdmlzaWJpbGl0eTogaGlkZGVuO1wiO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgc2Nyb2xsYmFyV2lkdGggICAgICAgICAgPSBzY3JvbGxiYXJTaXplcy53aWR0aDtcbiAgICAgICAgICAgIHZhciBzY3JvbGxiYXJIZWlnaHQgICAgICAgICA9IHNjcm9sbGJhclNpemVzLmhlaWdodDtcbiAgICAgICAgICAgIHZhciBjb250YWluZXJTdHlsZSAgICAgICAgICA9IGdldENvbnRhaW5lckNzc1RleHQoLTEsIC0xLCAtc2Nyb2xsYmFySGVpZ2h0LCAtc2Nyb2xsYmFyV2lkdGgpO1xuICAgICAgICAgICAgdmFyIHNocmlua0V4cGFuZHN0eWxlICAgICAgID0gZ2V0Q29udGFpbmVyQ3NzVGV4dCgwLCAwLCAtc2Nyb2xsYmFySGVpZ2h0LCAtc2Nyb2xsYmFyV2lkdGgpO1xuICAgICAgICAgICAgdmFyIHNocmlua0V4cGFuZENoaWxkU3R5bGUgID0gXCJwb3NpdGlvbjogYWJzb2x1dGU7IGxlZnQ6IDA7IHRvcDogMDtcIjtcblxuICAgICAgICAgICAgdmFyIGNvbnRhaW5lciAgICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIHZhciBleHBhbmQgICAgICAgICAgICAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICB2YXIgZXhwYW5kQ2hpbGQgICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgdmFyIHNocmluayAgICAgICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIHZhciBzaHJpbmtDaGlsZCAgICAgICAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cbiAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5jc3NUZXh0ICAgICA9IGNvbnRhaW5lclN0eWxlO1xuICAgICAgICAgICAgZXhwYW5kLnN0eWxlLmNzc1RleHQgICAgICAgID0gc2hyaW5rRXhwYW5kc3R5bGU7XG4gICAgICAgICAgICBleHBhbmRDaGlsZC5zdHlsZS5jc3NUZXh0ICAgPSBzaHJpbmtFeHBhbmRDaGlsZFN0eWxlO1xuICAgICAgICAgICAgc2hyaW5rLnN0eWxlLmNzc1RleHQgICAgICAgID0gc2hyaW5rRXhwYW5kc3R5bGU7XG4gICAgICAgICAgICBzaHJpbmtDaGlsZC5zdHlsZS5jc3NUZXh0ICAgPSBzaHJpbmtFeHBhbmRDaGlsZFN0eWxlICsgXCIgd2lkdGg6IDIwMCU7IGhlaWdodDogMjAwJTtcIjtcblxuICAgICAgICAgICAgZXhwYW5kLmFwcGVuZENoaWxkKGV4cGFuZENoaWxkKTtcbiAgICAgICAgICAgIHNocmluay5hcHBlbmRDaGlsZChzaHJpbmtDaGlsZCk7XG4gICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZXhwYW5kKTtcbiAgICAgICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChzaHJpbmspO1xuICAgICAgICAgICAgZWxlbWVudC5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuICAgICAgICAgICAgZ2V0U3RhdGUoZWxlbWVudCkuZWxlbWVudCA9IGNvbnRhaW5lcjtcblxuICAgICAgICAgICAgYWRkRXZlbnQoZXhwYW5kLCBcInNjcm9sbFwiLCBmdW5jdGlvbiBvbkZpcnN0RXhwYW5kU2Nyb2xsKCkge1xuICAgICAgICAgICAgICAgIHJlbW92ZUV2ZW50KGV4cGFuZCwgXCJzY3JvbGxcIiwgb25GaXJzdEV4cGFuZFNjcm9sbCk7XG4gICAgICAgICAgICAgICAgcmVhZHlFeHBhbmRTY3JvbGwgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJlYWR5KCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgYWRkRXZlbnQoc2hyaW5rLCBcInNjcm9sbFwiLCBmdW5jdGlvbiBvbkZpcnN0U2hyaW5rU2Nyb2xsKCkge1xuICAgICAgICAgICAgICAgIHJlbW92ZUV2ZW50KHNocmluaywgXCJzY3JvbGxcIiwgb25GaXJzdFNocmlua1Njcm9sbCk7XG4gICAgICAgICAgICAgICAgcmVhZHlTaHJpbmtTY3JvbGwgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJlYWR5KCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdXBkYXRlQ2hpbGRTaXplcyhlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGZpbmFsaXplRG9tTXV0YXRpb24oKSB7XG4gICAgICAgICAgICBzdG9yZUN1cnJlbnRTaXplKGVsZW1lbnQsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICAgICAgcG9zaXRpb25TY3JvbGxiYXJzKGVsZW1lbnQsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICAgICAgcmVhZHlPdmVyYWxsID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlYWR5KCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZihiYXRjaFByb2Nlc3Nvcikge1xuICAgICAgICAgICAgYmF0Y2hQcm9jZXNzb3IuYWRkKG11dGF0ZURvbSk7XG4gICAgICAgICAgICBiYXRjaFByb2Nlc3Nvci5hZGQoMSwgZmluYWxpemVEb21NdXRhdGlvbik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBtdXRhdGVEb20oKTtcbiAgICAgICAgICAgIGZpbmFsaXplRG9tTXV0YXRpb24oKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEV4cGFuZEVsZW1lbnQoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZ2V0U3RhdGUoZWxlbWVudCkuZWxlbWVudC5jaGlsZE5vZGVzWzBdO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEV4cGFuZENoaWxkRWxlbWVudChlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBnZXRFeHBhbmRFbGVtZW50KGVsZW1lbnQpLmNoaWxkTm9kZXNbMF07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0U2hyaW5rRWxlbWVudChlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBnZXRTdGF0ZShlbGVtZW50KS5lbGVtZW50LmNoaWxkTm9kZXNbMV07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVtb3ZlRXJkRWxlbWVudChlbGVtZW50KSB7XG4gICAgICAgIGVsZW1lbnQucmVtb3ZlQ2hpbGQoZ2V0U3RhdGUoZWxlbWVudCkuZWxlbWVudCk7XG4gICAgICAgIGRlbGV0ZSBnZXRTdGF0ZShlbGVtZW50KS5lbGVtZW50O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEV4cGFuZFNpemUoc2l6ZSkge1xuICAgICAgICByZXR1cm4gc2l6ZSArIDEwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFNocmlua1NpemUoc2l6ZSkge1xuICAgICAgICByZXR1cm4gc2l6ZSAqIDI7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdXBkYXRlQ2hpbGRTaXplcyhlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICAgIHZhciBleHBhbmRDaGlsZCAgICAgICAgICAgICA9IGdldEV4cGFuZENoaWxkRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgdmFyIGV4cGFuZFdpZHRoICAgICAgICAgICAgID0gZ2V0RXhwYW5kU2l6ZSh3aWR0aCk7XG4gICAgICAgIHZhciBleHBhbmRIZWlnaHQgICAgICAgICAgICA9IGdldEV4cGFuZFNpemUoaGVpZ2h0KTtcbiAgICAgICAgZXhwYW5kQ2hpbGQuc3R5bGUud2lkdGggICAgID0gZXhwYW5kV2lkdGggKyBcInB4XCI7XG4gICAgICAgIGV4cGFuZENoaWxkLnN0eWxlLmhlaWdodCAgICA9IGV4cGFuZEhlaWdodCArIFwicHhcIjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdG9yZUN1cnJlbnRTaXplKGVsZW1lbnQsIHdpZHRoLCBoZWlnaHQpIHtcbiAgICAgICAgZWxlbWVudC5sYXN0V2lkdGggICA9IHdpZHRoO1xuICAgICAgICBlbGVtZW50Lmxhc3RIZWlnaHQgID0gaGVpZ2h0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBvc2l0aW9uU2Nyb2xsYmFycyhlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICAgIHZhciBleHBhbmQgICAgICAgICAgPSBnZXRFeHBhbmRFbGVtZW50KGVsZW1lbnQpO1xuICAgICAgICB2YXIgc2hyaW5rICAgICAgICAgID0gZ2V0U2hyaW5rRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgdmFyIGV4cGFuZFdpZHRoICAgICA9IGdldEV4cGFuZFNpemUod2lkdGgpO1xuICAgICAgICB2YXIgZXhwYW5kSGVpZ2h0ICAgID0gZ2V0RXhwYW5kU2l6ZShoZWlnaHQpO1xuICAgICAgICB2YXIgc2hyaW5rV2lkdGggICAgID0gZ2V0U2hyaW5rU2l6ZSh3aWR0aCk7XG4gICAgICAgIHZhciBzaHJpbmtIZWlnaHQgICAgPSBnZXRTaHJpbmtTaXplKGhlaWdodCk7XG4gICAgICAgIGV4cGFuZC5zY3JvbGxMZWZ0ICAgPSBleHBhbmRXaWR0aDtcbiAgICAgICAgZXhwYW5kLnNjcm9sbFRvcCAgICA9IGV4cGFuZEhlaWdodDtcbiAgICAgICAgc2hyaW5rLnNjcm9sbExlZnQgICA9IHNocmlua1dpZHRoO1xuICAgICAgICBzaHJpbmsuc2Nyb2xsVG9wICAgID0gc2hyaW5rSGVpZ2h0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGFkZEV2ZW50KGVsLCBuYW1lLCBjYikge1xuICAgICAgICBpZiAoZWwuYXR0YWNoRXZlbnQpIHtcbiAgICAgICAgICAgIGVsLmF0dGFjaEV2ZW50KFwib25cIiArIG5hbWUsIGNiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIobmFtZSwgY2IpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVtb3ZlRXZlbnQoZWwsIG5hbWUsIGNiKSB7XG4gICAgICAgIGlmKGVsLmF0dGFjaEV2ZW50KSB7XG4gICAgICAgICAgICBlbC5kZXRhY2hFdmVudChcIm9uXCIgKyBuYW1lLCBjYik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKG5hbWUsIGNiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBhcnNlU2l6ZShzaXplKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUZsb2F0KHNpemUucmVwbGFjZSgvcHgvLCBcIlwiKSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0U2Nyb2xsYmFyU2l6ZXMoKSB7XG4gICAgICAgIHZhciB3aWR0aCA9IDUwMDtcbiAgICAgICAgdmFyIGhlaWdodCA9IDUwMDtcblxuICAgICAgICB2YXIgY2hpbGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBjaGlsZC5zdHlsZS5jc3NUZXh0ID0gXCJwb3NpdGlvbjogYWJzb2x1dGU7IHdpZHRoOiBcIiArIHdpZHRoKjIgKyBcInB4OyBoZWlnaHQ6IFwiICsgaGVpZ2h0KjIgKyBcInB4OyB2aXNpYmlsaXR5OiBoaWRkZW47XCI7XG5cbiAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIGNvbnRhaW5lci5zdHlsZS5jc3NUZXh0ID0gXCJwb3NpdGlvbjogYWJzb2x1dGU7IHdpZHRoOiBcIiArIHdpZHRoICsgXCJweDsgaGVpZ2h0OiBcIiArIGhlaWdodCArIFwicHg7IG92ZXJmbG93OiBzY3JvbGw7IHZpc2liaWxpdHk6IG5vbmU7IHRvcDogXCIgKyAtd2lkdGgqMyArIFwicHg7IGxlZnQ6IFwiICsgLWhlaWdodCozICsgXCJweDsgdmlzaWJpbGl0eTogaGlkZGVuO1wiO1xuXG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChjaGlsZCk7XG5cbiAgICAgICAgZG9jdW1lbnQuYm9keS5pbnNlcnRCZWZvcmUoY29udGFpbmVyLCBkb2N1bWVudC5ib2R5LmZpcnN0Q2hpbGQpO1xuXG4gICAgICAgIHZhciB3aWR0aFNpemUgPSB3aWR0aCAtIGNvbnRhaW5lci5jbGllbnRXaWR0aDtcbiAgICAgICAgdmFyIGhlaWdodFNpemUgPSBoZWlnaHQgLSBjb250YWluZXIuY2xpZW50SGVpZ2h0O1xuXG4gICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQoY29udGFpbmVyKTtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgd2lkdGg6IHdpZHRoU2l6ZSxcbiAgICAgICAgICAgIGhlaWdodDogaGVpZ2h0U2l6ZVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVuaW5zdGFsbChlbGVtZW50LCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgc3RhdGUgPSBnZXRTdGF0ZShlbGVtZW50KTtcbiAgICAgICAgZWxlbWVudC5yZW1vdmVDaGlsZChzdGF0ZS5lbGVtZW50KTtcbiAgICAgICAgZGVsZXRlIHN0YXRlLmVsZW1lbnQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgbWFrZURldGVjdGFibGU6IG1ha2VEZXRlY3RhYmxlLFxuICAgICAgICBhZGRMaXN0ZW5lcjogYWRkTGlzdGVuZXIsXG4gICAgICAgIHVuaW5zdGFsbDogdW5pbnN0YWxsXG4gICAgfTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGZvckVhY2ggICAgICAgICAgICAgICAgID0gcmVxdWlyZShcIi4vY29sbGVjdGlvbi11dGlsc1wiKS5mb3JFYWNoO1xudmFyIGVsZW1lbnRVdGlsc01ha2VyICAgICAgID0gcmVxdWlyZShcIi4vZWxlbWVudC11dGlsc1wiKTtcbnZhciBsaXN0ZW5lckhhbmRsZXJNYWtlciAgICA9IHJlcXVpcmUoXCIuL2xpc3RlbmVyLWhhbmRsZXJcIik7XG52YXIgaWRHZW5lcmF0b3JNYWtlciAgICAgICAgPSByZXF1aXJlKFwiLi9pZC1nZW5lcmF0b3JcIik7XG52YXIgaWRIYW5kbGVyTWFrZXIgICAgICAgICAgPSByZXF1aXJlKFwiLi9pZC1oYW5kbGVyXCIpO1xudmFyIHJlcG9ydGVyTWFrZXIgICAgICAgICAgID0gcmVxdWlyZShcIi4vcmVwb3J0ZXJcIik7XG52YXIgYnJvd3NlckRldGVjdG9yICAgICAgICAgPSByZXF1aXJlKFwiLi9icm93c2VyLWRldGVjdG9yXCIpO1xudmFyIGJhdGNoUHJvY2Vzc29yTWFrZXIgICAgID0gcmVxdWlyZShcImJhdGNoLXByb2Nlc3NvclwiKTtcbnZhciBzdGF0ZUhhbmRsZXIgICAgICAgICAgICA9IHJlcXVpcmUoXCIuL3N0YXRlLWhhbmRsZXJcIik7XG5cbi8vRGV0ZWN0aW9uIHN0cmF0ZWdpZXMuXG52YXIgb2JqZWN0U3RyYXRlZ3lNYWtlciAgICAgPSByZXF1aXJlKFwiLi9kZXRlY3Rpb24tc3RyYXRlZ3kvb2JqZWN0LmpzXCIpO1xudmFyIHNjcm9sbFN0cmF0ZWd5TWFrZXIgICAgID0gcmVxdWlyZShcIi4vZGV0ZWN0aW9uLXN0cmF0ZWd5L3Njcm9sbC5qc1wiKTtcblxuLyoqXG4gKiBAdHlwZWRlZiBpZEhhbmRsZXJcbiAqIEB0eXBlIHtvYmplY3R9XG4gKiBAcHJvcGVydHkge2Z1bmN0aW9ufSBnZXQgR2V0cyB0aGUgcmVzaXplIGRldGVjdG9yIGlkIG9mIHRoZSBlbGVtZW50LlxuICogQHByb3BlcnR5IHtmdW5jdGlvbn0gc2V0IEdlbmVyYXRlIGFuZCBzZXRzIHRoZSByZXNpemUgZGV0ZWN0b3IgaWQgb2YgdGhlIGVsZW1lbnQuXG4gKi9cblxuLyoqXG4gKiBAdHlwZWRlZiBPcHRpb25zXG4gKiBAdHlwZSB7b2JqZWN0fVxuICogQHByb3BlcnR5IHtib29sZWFufSBjYWxsT25BZGQgICAgRGV0ZXJtaW5lcyBpZiBsaXN0ZW5lcnMgc2hvdWxkIGJlIGNhbGxlZCB3aGVuIHRoZXkgYXJlIGdldHRpbmcgYWRkZWQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBEZWZhdWx0IGlzIHRydWUuIElmIHRydWUsIHRoZSBsaXN0ZW5lciBpcyBndWFyYW50ZWVkIHRvIGJlIGNhbGxlZCB3aGVuIGl0IGhhcyBiZWVuIGFkZGVkLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSWYgZmFsc2UsIHRoZSBsaXN0ZW5lciB3aWxsIG5vdCBiZSBndWFyZW50ZWVkIHRvIGJlIGNhbGxlZCB3aGVuIGl0IGhhcyBiZWVuIGFkZGVkIChkb2VzIG5vdCBwcmV2ZW50IGl0IGZyb20gYmVpbmcgY2FsbGVkKS5cbiAqIEBwcm9wZXJ0eSB7aWRIYW5kbGVyfSBpZEhhbmRsZXIgIEEgY3VzdG9tIGlkIGhhbmRsZXIgdGhhdCBpcyByZXNwb25zaWJsZSBmb3IgZ2VuZXJhdGluZywgc2V0dGluZyBhbmQgcmV0cmlldmluZyBpZCdzIGZvciBlbGVtZW50cy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIElmIG5vdCBwcm92aWRlZCwgYSBkZWZhdWx0IGlkIGhhbmRsZXIgd2lsbCBiZSB1c2VkLlxuICogQHByb3BlcnR5IHtyZXBvcnRlcn0gcmVwb3J0ZXIgICAgQSBjdXN0b20gcmVwb3J0ZXIgdGhhdCBoYW5kbGVzIHJlcG9ydGluZyBsb2dzLCB3YXJuaW5ncyBhbmQgZXJyb3JzLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSWYgbm90IHByb3ZpZGVkLCBhIGRlZmF1bHQgaWQgaGFuZGxlciB3aWxsIGJlIHVzZWQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBJZiBzZXQgdG8gZmFsc2UsIHRoZW4gbm90aGluZyB3aWxsIGJlIHJlcG9ydGVkLlxuICovXG5cbi8qKlxuICogQ3JlYXRlcyBhbiBlbGVtZW50IHJlc2l6ZSBkZXRlY3RvciBpbnN0YW5jZS5cbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSB7T3B0aW9ucz99IG9wdGlvbnMgT3B0aW9uYWwgZ2xvYmFsIG9wdGlvbnMgb2JqZWN0IHRoYXQgd2lsbCBkZWNpZGUgaG93IHRoaXMgaW5zdGFuY2Ugd2lsbCB3b3JrLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgIC8vaWRIYW5kbGVyIGlzIGN1cnJlbnRseSBub3QgYW4gb3B0aW9uIHRvIHRoZSBsaXN0ZW5UbyBmdW5jdGlvbiwgc28gaXQgc2hvdWxkIG5vdCBiZSBhZGRlZCB0byBnbG9iYWxPcHRpb25zLlxuICAgIHZhciBpZEhhbmRsZXIgPSBvcHRpb25zLmlkSGFuZGxlcjtcblxuICAgIGlmKCFpZEhhbmRsZXIpIHtcbiAgICAgICAgdmFyIGlkR2VuZXJhdG9yID0gaWRHZW5lcmF0b3JNYWtlcigpO1xuICAgICAgICB2YXIgZGVmYXVsdElkSGFuZGxlciA9IGlkSGFuZGxlck1ha2VyKGlkR2VuZXJhdG9yKTtcbiAgICAgICAgaWRIYW5kbGVyID0gZGVmYXVsdElkSGFuZGxlcjtcbiAgICB9XG5cbiAgICAvL3JlcG9ydGVyIGlzIGN1cnJlbnRseSBub3QgYW4gb3B0aW9uIHRvIHRoZSBsaXN0ZW5UbyBmdW5jdGlvbiwgc28gaXQgc2hvdWxkIG5vdCBiZSBhZGRlZCB0byBnbG9iYWxPcHRpb25zLlxuICAgIHZhciByZXBvcnRlciA9IG9wdGlvbnMucmVwb3J0ZXI7XG5cbiAgICBpZighcmVwb3J0ZXIpIHtcbiAgICAgICAgLy9JZiBvcHRpb25zLnJlcG9ydGVyIGlzIGZhbHNlLCB0aGVuIHRoZSByZXBvcnRlciBzaG91bGQgYmUgcXVpZXQuXG4gICAgICAgIHZhciBxdWlldCA9IHJlcG9ydGVyID09PSBmYWxzZTtcbiAgICAgICAgcmVwb3J0ZXIgPSByZXBvcnRlck1ha2VyKHF1aWV0KTtcbiAgICB9XG5cbiAgICAvL2JhdGNoUHJvY2Vzc29yIGlzIGN1cnJlbnRseSBub3QgYW4gb3B0aW9uIHRvIHRoZSBsaXN0ZW5UbyBmdW5jdGlvbiwgc28gaXQgc2hvdWxkIG5vdCBiZSBhZGRlZCB0byBnbG9iYWxPcHRpb25zLlxuICAgIHZhciBiYXRjaFByb2Nlc3NvciA9IGdldE9wdGlvbihvcHRpb25zLCBcImJhdGNoUHJvY2Vzc29yXCIsIGJhdGNoUHJvY2Vzc29yTWFrZXIoeyByZXBvcnRlcjogcmVwb3J0ZXIgfSkpO1xuXG4gICAgLy9PcHRpb25zIHRvIGJlIHVzZWQgYXMgZGVmYXVsdCBmb3IgdGhlIGxpc3RlblRvIGZ1bmN0aW9uLlxuICAgIHZhciBnbG9iYWxPcHRpb25zID0ge307XG4gICAgZ2xvYmFsT3B0aW9ucy5jYWxsT25BZGQgICAgID0gISFnZXRPcHRpb24ob3B0aW9ucywgXCJjYWxsT25BZGRcIiwgdHJ1ZSk7XG5cbiAgICB2YXIgZXZlbnRMaXN0ZW5lckhhbmRsZXIgICAgPSBsaXN0ZW5lckhhbmRsZXJNYWtlcihpZEhhbmRsZXIpO1xuICAgIHZhciBlbGVtZW50VXRpbHMgICAgICAgICAgICA9IGVsZW1lbnRVdGlsc01ha2VyKHtcbiAgICAgICAgc3RhdGVIYW5kbGVyOiBzdGF0ZUhhbmRsZXJcbiAgICB9KTtcblxuICAgIC8vVGhlIGRldGVjdGlvbiBzdHJhdGVneSB0byBiZSB1c2VkLlxuICAgIHZhciBkZXRlY3Rpb25TdHJhdGVneTtcbiAgICB2YXIgZGVzaXJlZFN0cmF0ZWd5ID0gZ2V0T3B0aW9uKG9wdGlvbnMsIFwic3RyYXRlZ3lcIiwgXCJvYmplY3RcIik7XG4gICAgdmFyIHN0cmF0ZWd5T3B0aW9ucyA9IHtcbiAgICAgICAgcmVwb3J0ZXI6IHJlcG9ydGVyLFxuICAgICAgICBiYXRjaFByb2Nlc3NvcjogYmF0Y2hQcm9jZXNzb3IsXG4gICAgICAgIHN0YXRlSGFuZGxlcjogc3RhdGVIYW5kbGVyXG4gICAgfTtcblxuICAgIGlmKGRlc2lyZWRTdHJhdGVneSA9PT0gXCJzY3JvbGxcIiAmJiBicm93c2VyRGV0ZWN0b3IuaXNMZWdhY3lPcGVyYSgpKSB7XG4gICAgICAgIHJlcG9ydGVyLndhcm4oXCJTY3JvbGwgc3RyYXRlZ3kgaXMgbm90IHN1cHBvcnRlZCBvbiBsZWdhY3kgT3BlcmEuIENoYW5naW5nIHRvIG9iamVjdCBzdHJhdGVneS5cIik7XG4gICAgICAgIGRlc2lyZWRTdHJhdGVneSA9IFwib2JqZWN0XCI7XG4gICAgfVxuXG4gICAgaWYoZGVzaXJlZFN0cmF0ZWd5ID09PSBcInNjcm9sbFwiKSB7XG4gICAgICAgIGRldGVjdGlvblN0cmF0ZWd5ID0gc2Nyb2xsU3RyYXRlZ3lNYWtlcihzdHJhdGVneU9wdGlvbnMpO1xuICAgIH0gZWxzZSBpZihkZXNpcmVkU3RyYXRlZ3kgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgZGV0ZWN0aW9uU3RyYXRlZ3kgPSBvYmplY3RTdHJhdGVneU1ha2VyKHN0cmF0ZWd5T3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBzdHJhdGVneSBuYW1lOiBcIiArIGRlc2lyZWRTdHJhdGVneSk7XG4gICAgfVxuXG4gICAgLy9DYWxscyBjYW4gYmUgbWFkZSB0byBsaXN0ZW5UbyB3aXRoIGVsZW1lbnRzIHRoYXQgYXJlIHN0aWxsIGFyZSBiZWluZyBpbnN0YWxsZWQuXG4gICAgLy9BbHNvLCBzYW1lIGVsZW1lbnRzIGNhbiBvY2N1ciBpbiB0aGUgZWxlbWVudHMgbGlzdCBpbiB0aGUgbGlzdGVuVG8gZnVuY3Rpb24uXG4gICAgLy9XaXRoIHRoaXMgbWFwLCB0aGUgcmVhZHkgY2FsbGJhY2tzIGNhbiBiZSBzeW5jaHJvbml6ZWQgYmV0d2VlbiB0aGUgY2FsbHNcbiAgICAvL3NvIHRoYXQgdGhlIHJlYWR5IGNhbGxiYWNrIGNhbiBhbHdheXMgYmUgY2FsbGVkIHdoZW4gYW4gZWxlbWVudCBpcyByZWFkeSAtIGV2ZW4gaWZcbiAgICAvL2l0IHdhc24ndCBpbnN0YWxsZWQgZnJvbSB0aGUgZnVuY3Rpb24gaW50c2VsZi5cbiAgICB2YXIgb25SZWFkeUNhbGxiYWNrcyA9IHt9O1xuXG4gICAgLyoqXG4gICAgICogTWFrZXMgdGhlIGdpdmVuIGVsZW1lbnRzIHJlc2l6ZS1kZXRlY3RhYmxlIGFuZCBzdGFydHMgbGlzdGVuaW5nIHRvIHJlc2l6ZSBldmVudHMgb24gdGhlIGVsZW1lbnRzLiBDYWxscyB0aGUgZXZlbnQgY2FsbGJhY2sgZm9yIGVhY2ggZXZlbnQgZm9yIGVhY2ggZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtPcHRpb25zP30gb3B0aW9ucyBPcHRpb25hbCBvcHRpb25zIG9iamVjdC4gVGhlc2Ugb3B0aW9ucyB3aWxsIG92ZXJyaWRlIHRoZSBnbG9iYWwgb3B0aW9ucy4gU29tZSBvcHRpb25zIG1heSBub3QgYmUgb3ZlcnJpZGVuLCBzdWNoIGFzIGlkSGFuZGxlci5cbiAgICAgKiBAcGFyYW0ge2VsZW1lbnRbXXxlbGVtZW50fSBlbGVtZW50cyBUaGUgZ2l2ZW4gYXJyYXkgb2YgZWxlbWVudHMgdG8gZGV0ZWN0IHJlc2l6ZSBldmVudHMgb2YuIFNpbmdsZSBlbGVtZW50IGlzIGFsc28gdmFsaWQuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gbGlzdGVuZXIgVGhlIGNhbGxiYWNrIHRvIGJlIGV4ZWN1dGVkIGZvciBlYWNoIHJlc2l6ZSBldmVudCBmb3IgZWFjaCBlbGVtZW50LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGxpc3RlblRvKG9wdGlvbnMsIGVsZW1lbnRzLCBsaXN0ZW5lcikge1xuICAgICAgICBmdW5jdGlvbiBvblJlc2l6ZUNhbGxiYWNrKGVsZW1lbnQpIHtcbiAgICAgICAgICAgIHZhciBsaXN0ZW5lcnMgPSBldmVudExpc3RlbmVySGFuZGxlci5nZXQoZWxlbWVudCk7XG4gICAgICAgICAgICBmb3JFYWNoKGxpc3RlbmVycywgZnVuY3Rpb24gY2FsbExpc3RlbmVyUHJveHkobGlzdGVuZXIpIHtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcihlbGVtZW50KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkTGlzdGVuZXIoY2FsbE9uQWRkLCBlbGVtZW50LCBsaXN0ZW5lcikge1xuICAgICAgICAgICAgZXZlbnRMaXN0ZW5lckhhbmRsZXIuYWRkKGVsZW1lbnQsIGxpc3RlbmVyKTtcblxuICAgICAgICAgICAgaWYoY2FsbE9uQWRkKSB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIoZWxlbWVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvL09wdGlvbnMgb2JqZWN0IG1heSBiZSBvbWl0dGVkLlxuICAgICAgICBpZighbGlzdGVuZXIpIHtcbiAgICAgICAgICAgIGxpc3RlbmVyID0gZWxlbWVudHM7XG4gICAgICAgICAgICBlbGVtZW50cyA9IG9wdGlvbnM7XG4gICAgICAgICAgICBvcHRpb25zID0ge307XG4gICAgICAgIH1cblxuICAgICAgICBpZighZWxlbWVudHMpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkF0IGxlYXN0IG9uZSBlbGVtZW50IHJlcXVpcmVkLlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCFsaXN0ZW5lcikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTGlzdGVuZXIgcmVxdWlyZWQuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoZWxlbWVudHMubGVuZ3RoID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGVsZW1lbnRzID0gW2VsZW1lbnRzXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBlbGVtZW50c1JlYWR5ID0gMDtcblxuICAgICAgICB2YXIgY2FsbE9uQWRkID0gZ2V0T3B0aW9uKG9wdGlvbnMsIFwiY2FsbE9uQWRkXCIsIGdsb2JhbE9wdGlvbnMuY2FsbE9uQWRkKTtcbiAgICAgICAgdmFyIG9uUmVhZHlDYWxsYmFjayA9IGdldE9wdGlvbihvcHRpb25zLCBcIm9uUmVhZHlcIiwgZnVuY3Rpb24gbm9vcCgpIHt9KTtcblxuICAgICAgICBmb3JFYWNoKGVsZW1lbnRzLCBmdW5jdGlvbiBhdHRhY2hMaXN0ZW5lclRvRWxlbWVudChlbGVtZW50KSB7XG4gICAgICAgICAgICB2YXIgaWQgPSBpZEhhbmRsZXIuZ2V0KGVsZW1lbnQpO1xuXG4gICAgICAgICAgICBpZighZWxlbWVudFV0aWxzLmlzRGV0ZWN0YWJsZShlbGVtZW50KSkge1xuICAgICAgICAgICAgICAgIGlmKGVsZW1lbnRVdGlscy5pc0J1c3koZWxlbWVudCkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy9UaGUgZWxlbWVudCBpcyBiZWluZyBwcmVwYXJlZCB0byBiZSBkZXRlY3RhYmxlLiBEbyBub3QgbWFrZSBpdCBkZXRlY3RhYmxlLlxuICAgICAgICAgICAgICAgICAgICAvL0p1c3QgYWRkIHRoZSBsaXN0ZW5lciwgYmVjYXVzZSB0aGUgZWxlbWVudCB3aWxsIHNvb24gYmUgZGV0ZWN0YWJsZS5cbiAgICAgICAgICAgICAgICAgICAgYWRkTGlzdGVuZXIoY2FsbE9uQWRkLCBlbGVtZW50LCBsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgICAgIG9uUmVhZHlDYWxsYmFja3NbaWRdID0gb25SZWFkeUNhbGxiYWNrc1tpZF0gfHwgW107XG4gICAgICAgICAgICAgICAgICAgIG9uUmVhZHlDYWxsYmFja3NbaWRdLnB1c2goZnVuY3Rpb24gb25SZWFkeSgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzUmVhZHkrKztcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoZWxlbWVudHNSZWFkeSA9PT0gZWxlbWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb25SZWFkeUNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy9UaGUgZWxlbWVudCBpcyBub3QgcHJlcGFyZWQgdG8gYmUgZGV0ZWN0YWJsZSwgc28gZG8gcHJlcGFyZSBpdCBhbmQgYWRkIGEgbGlzdGVuZXIgdG8gaXQuXG4gICAgICAgICAgICAgICAgZWxlbWVudFV0aWxzLm1hcmtCdXN5KGVsZW1lbnQsIHRydWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiBkZXRlY3Rpb25TdHJhdGVneS5tYWtlRGV0ZWN0YWJsZShlbGVtZW50LCBmdW5jdGlvbiBvbkVsZW1lbnREZXRlY3RhYmxlKGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudFV0aWxzLm1hcmtBc0RldGVjdGFibGUoZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRVdGlscy5tYXJrQnVzeShlbGVtZW50LCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgIGRldGVjdGlvblN0cmF0ZWd5LmFkZExpc3RlbmVyKGVsZW1lbnQsIG9uUmVzaXplQ2FsbGJhY2spO1xuICAgICAgICAgICAgICAgICAgICBhZGRMaXN0ZW5lcihjYWxsT25BZGQsIGVsZW1lbnQsIGxpc3RlbmVyKTtcblxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50c1JlYWR5Kys7XG4gICAgICAgICAgICAgICAgICAgIGlmKGVsZW1lbnRzUmVhZHkgPT09IGVsZW1lbnRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgb25SZWFkeUNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZihvblJlYWR5Q2FsbGJhY2tzW2lkXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yRWFjaChvblJlYWR5Q2FsbGJhY2tzW2lkXSwgZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgb25SZWFkeUNhbGxiYWNrc1tpZF07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9UaGUgZWxlbWVudCBoYXMgYmVlbiBwcmVwYXJlZCB0byBiZSBkZXRlY3RhYmxlIGFuZCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCB0by5cbiAgICAgICAgICAgIGFkZExpc3RlbmVyKGNhbGxPbkFkZCwgZWxlbWVudCwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgZWxlbWVudHNSZWFkeSsrO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZihlbGVtZW50c1JlYWR5ID09PSBlbGVtZW50cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIG9uUmVhZHlDYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdW5pbnN0YWxsKGVsZW1lbnQpIHtcbiAgICAgIGV2ZW50TGlzdGVuZXJIYW5kbGVyLnJlbW92ZUFsbExpc3RlbmVycyhlbGVtZW50KTtcbiAgICAgIGRldGVjdGlvblN0cmF0ZWd5LnVuaW5zdGFsbChlbGVtZW50KTtcbiAgICAgIHN0YXRlSGFuZGxlci5jbGVhblN0YXRlKGVsZW1lbnQpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGxpc3RlblRvOiBsaXN0ZW5UbyxcbiAgICAgICAgcmVtb3ZlTGlzdGVuZXI6IGV2ZW50TGlzdGVuZXJIYW5kbGVyLnJlbW92ZUxpc3RlbmVyLFxuICAgICAgICByZW1vdmVBbGxMaXN0ZW5lcnM6IGV2ZW50TGlzdGVuZXJIYW5kbGVyLnJlbW92ZUFsbExpc3RlbmVycyxcbiAgICAgICAgdW5pbnN0YWxsOiB1bmluc3RhbGxcbiAgICB9O1xufTtcblxuZnVuY3Rpb24gZ2V0T3B0aW9uKG9wdGlvbnMsIG5hbWUsIGRlZmF1bHRWYWx1ZSkge1xuICAgIHZhciB2YWx1ZSA9IG9wdGlvbnNbbmFtZV07XG5cbiAgICBpZigodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkgJiYgZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdmFsdWU7XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgdmFyIGdldFN0YXRlID0gb3B0aW9ucy5zdGF0ZUhhbmRsZXIuZ2V0U3RhdGU7XG5cbiAgICAvKipcbiAgICAgKiBUZWxscyBpZiB0aGUgZWxlbWVudCBoYXMgYmVlbiBtYWRlIGRldGVjdGFibGUgYW5kIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgZXZlbnRzLlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IFRoZSBlbGVtZW50IHRvIGNoZWNrLlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIG9yIGZhbHNlIGRlcGVuZGluZyBvbiBpZiB0aGUgZWxlbWVudCBpcyBkZXRlY3RhYmxlIG9yIG5vdC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpc0RldGVjdGFibGUoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gISFnZXRTdGF0ZShlbGVtZW50KS5pc0RldGVjdGFibGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWFya3MgdGhlIGVsZW1lbnQgdGhhdCBpdCBoYXMgYmVlbiBtYWRlIGRldGVjdGFibGUgYW5kIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgZXZlbnRzLlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IFRoZSBlbGVtZW50IHRvIG1hcmsuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbWFya0FzRGV0ZWN0YWJsZShlbGVtZW50KSB7XG4gICAgICAgIGdldFN0YXRlKGVsZW1lbnQpLmlzRGV0ZWN0YWJsZSA9IHRydWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGVsbHMgaWYgdGhlIGVsZW1lbnQgaXMgYnVzeSBvciBub3QuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gVGhlIGVsZW1lbnQgdG8gY2hlY2suXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgb3IgZmFsc2UgZGVwZW5kaW5nIG9uIGlmIHRoZSBlbGVtZW50IGlzIGJ1c3kgb3Igbm90LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzQnVzeShlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiAhIWdldFN0YXRlKGVsZW1lbnQpLmJ1c3k7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWFya3MgdGhlIG9iamVjdCBpcyBidXN5IGFuZCBzaG91bGQgbm90IGJlIG1hZGUgZGV0ZWN0YWJsZS5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRvIG1hcmsuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBidXN5IElmIHRoZSBlbGVtZW50IGlzIGJ1c3kgb3Igbm90LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIG1hcmtCdXN5KGVsZW1lbnQsIGJ1c3kpIHtcbiAgICAgICAgZ2V0U3RhdGUoZWxlbWVudCkuYnVzeSA9ICEhYnVzeTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBpc0RldGVjdGFibGU6IGlzRGV0ZWN0YWJsZSxcbiAgICAgICAgbWFya0FzRGV0ZWN0YWJsZTogbWFya0FzRGV0ZWN0YWJsZSxcbiAgICAgICAgaXNCdXN5OiBpc0J1c3ksXG4gICAgICAgIG1hcmtCdXN5OiBtYXJrQnVzeVxuICAgIH07XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGlkQ291bnQgPSAxO1xuXG4gICAgLyoqXG4gICAgICogR2VuZXJhdGVzIGEgbmV3IHVuaXF1ZSBpZCBpbiB0aGUgY29udGV4dC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHJldHVybnMge251bWJlcn0gQSB1bmlxdWUgaWQgaW4gdGhlIGNvbnRleHQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2VuZXJhdGUoKSB7XG4gICAgICAgIHJldHVybiBpZENvdW50Kys7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ2VuZXJhdGU6IGdlbmVyYXRlXG4gICAgfTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihpZEdlbmVyYXRvcikge1xuICAgIHZhciBJRF9QUk9QX05BTUUgPSBcIl9lcmRUYXJnZXRJZFwiO1xuXG4gICAgLyoqXG4gICAgICogR2V0cyB0aGUgcmVzaXplIGRldGVjdG9yIGlkIG9mIHRoZSBlbGVtZW50LiBJZiB0aGUgZWxlbWVudCBkb2VzIG5vdCBoYXZlIGFuIGlkLCBvbmUgd2lsbCBiZSBhc3NpZ25lZCB0byB0aGUgZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSB0YXJnZXQgZWxlbWVudCB0byBnZXQgdGhlIGlkIG9mLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbj99IHJlYWRvbmx5IEFuIGlkIHdpbGwgbm90IGJlIGFzc2lnbmVkIHRvIHRoZSBlbGVtZW50IGlmIHRoZSByZWFkb25seSBwYXJhbWV0ZXIgaXMgdHJ1ZS4gRGVmYXVsdCBpcyBmYWxzZS5cbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfG51bWJlcn0gVGhlIGlkIG9mIHRoZSBlbGVtZW50LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldElkKGVsZW1lbnQsIHJlYWRvbmx5KSB7XG4gICAgICAgIGlmKCFyZWFkb25seSAmJiAhaGFzSWQoZWxlbWVudCkpIHtcbiAgICAgICAgICAgIHNldElkKGVsZW1lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGVsZW1lbnRbSURfUFJPUF9OQU1FXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRJZChlbGVtZW50KSB7XG4gICAgICAgIHZhciBpZCA9IGlkR2VuZXJhdG9yLmdlbmVyYXRlKCk7XG5cbiAgICAgICAgZWxlbWVudFtJRF9QUk9QX05BTUVdID0gaWQ7XG5cbiAgICAgICAgcmV0dXJuIGlkO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGhhc0lkKGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRbSURfUFJPUF9OQU1FXSAhPT0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbW92ZUlkKGVsZW1lbnQpIHtcbiAgICAgICAgZGVsZXRlIGVsZW1lbnRbSURfUFJPUF9OQU1FXTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBnZXQ6IGdldElkLFxuICAgICAgICByZW1vdmU6IHJlbW92ZUlkXG4gICAgfTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihpZEhhbmRsZXIpIHtcbiAgICB2YXIgZXZlbnRMaXN0ZW5lcnMgPSB7fTtcblxuICAgIC8qKlxuICAgICAqIEdldHMgYWxsIGxpc3RlbmVycyBmb3IgdGhlIGdpdmVuIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0byBnZXQgYWxsIGxpc3RlbmVycyBmb3IuXG4gICAgICogQHJldHVybnMgQWxsIGxpc3RlbmVycyBmb3IgdGhlIGdpdmVuIGVsZW1lbnQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0TGlzdGVuZXJzKGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGV2ZW50TGlzdGVuZXJzW2lkSGFuZGxlci5nZXQoZWxlbWVudCldO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN0b3JlcyB0aGUgZ2l2ZW4gbGlzdGVuZXIgZm9yIHRoZSBnaXZlbiBlbGVtZW50LiBXaWxsIG5vdCBhY3R1YWxseSBhZGQgdGhlIGxpc3RlbmVyIHRvIHRoZSBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdGhhdCBzaG91bGQgaGF2ZSB0aGUgbGlzdGVuZXIgYWRkZWQuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gbGlzdGVuZXIgVGhlIGNhbGxiYWNrIHRoYXQgdGhlIGVsZW1lbnQgaGFzIGFkZGVkLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGFkZExpc3RlbmVyKGVsZW1lbnQsIGxpc3RlbmVyKSB7XG4gICAgICAgIHZhciBpZCA9IGlkSGFuZGxlci5nZXQoZWxlbWVudCk7XG5cbiAgICAgICAgaWYoIWV2ZW50TGlzdGVuZXJzW2lkXSkge1xuICAgICAgICAgICAgZXZlbnRMaXN0ZW5lcnNbaWRdID0gW107XG4gICAgICAgIH1cblxuICAgICAgICBldmVudExpc3RlbmVyc1tpZF0ucHVzaChsaXN0ZW5lcik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVtb3ZlTGlzdGVuZXIoZWxlbWVudCwgbGlzdGVuZXIpIHtcbiAgICAgICAgdmFyIGxpc3RlbmVycyA9IGdldExpc3RlbmVycyhlbGVtZW50KTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGxpc3RlbmVycy5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgICAgICAgICAgaWYgKGxpc3RlbmVyc1tpXSA9PT0gbGlzdGVuZXIpIHtcbiAgICAgICAgICAgICAgbGlzdGVuZXJzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW1vdmVBbGxMaXN0ZW5lcnMoZWxlbWVudCkge1xuICAgICAgZXZlbnRMaXN0ZW5lcnNbaWRIYW5kbGVyLmdldChlbGVtZW50KV0ubGVuZ3RoID0gMDtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBnZXQ6IGdldExpc3RlbmVycyxcbiAgICAgICAgYWRkOiBhZGRMaXN0ZW5lcixcbiAgICAgICAgcmVtb3ZlTGlzdGVuZXI6IHJlbW92ZUxpc3RlbmVyLFxuICAgICAgICByZW1vdmVBbGxMaXN0ZW5lcnM6IHJlbW92ZUFsbExpc3RlbmVyc1xuICAgIH07XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8qIGdsb2JhbCBjb25zb2xlOiBmYWxzZSAqL1xuXG4vKipcbiAqIFJlcG9ydGVyIHRoYXQgaGFuZGxlcyB0aGUgcmVwb3J0aW5nIG9mIGxvZ3MsIHdhcm5pbmdzIGFuZCBlcnJvcnMuXG4gKiBAcHVibGljXG4gKiBAcGFyYW0ge2Jvb2xlYW59IHF1aWV0IFRlbGxzIGlmIHRoZSByZXBvcnRlciBzaG91bGQgYmUgcXVpZXQgb3Igbm90LlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHF1aWV0KSB7XG4gICAgZnVuY3Rpb24gbm9vcCgpIHtcbiAgICAgICAgLy9Eb2VzIG5vdGhpbmcuXG4gICAgfVxuXG4gICAgdmFyIHJlcG9ydGVyID0ge1xuICAgICAgICBsb2c6IG5vb3AsXG4gICAgICAgIHdhcm46IG5vb3AsXG4gICAgICAgIGVycm9yOiBub29wXG4gICAgfTtcblxuICAgIGlmKCFxdWlldCAmJiB3aW5kb3cuY29uc29sZSkge1xuICAgICAgICB2YXIgYXR0YWNoRnVuY3Rpb24gPSBmdW5jdGlvbihyZXBvcnRlciwgbmFtZSkge1xuICAgICAgICAgICAgLy9UaGUgcHJveHkgaXMgbmVlZGVkIHRvIGJlIGFibGUgdG8gY2FsbCB0aGUgbWV0aG9kIHdpdGggdGhlIGNvbnNvbGUgY29udGV4dCxcbiAgICAgICAgICAgIC8vc2luY2Ugd2UgY2Fubm90IHVzZSBiaW5kLlxuICAgICAgICAgICAgcmVwb3J0ZXJbbmFtZV0gPSBmdW5jdGlvbiByZXBvcnRlclByb3h5KCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGVbbmFtZV0uYXBwbHkoY29uc29sZSwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH07XG5cbiAgICAgICAgYXR0YWNoRnVuY3Rpb24ocmVwb3J0ZXIsIFwibG9nXCIpO1xuICAgICAgICBhdHRhY2hGdW5jdGlvbihyZXBvcnRlciwgXCJ3YXJuXCIpO1xuICAgICAgICBhdHRhY2hGdW5jdGlvbihyZXBvcnRlciwgXCJlcnJvclwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVwb3J0ZXI7XG59OyIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgcHJvcCA9IFwiX2VyZFwiO1xuXG5mdW5jdGlvbiBpbml0U3RhdGUoZWxlbWVudCkge1xuICAgIGVsZW1lbnRbcHJvcF0gPSB7fTtcbiAgICByZXR1cm4gZ2V0U3RhdGUoZWxlbWVudCk7XG59XG5cbmZ1bmN0aW9uIGdldFN0YXRlKGVsZW1lbnQpIHtcbiAgICByZXR1cm4gZWxlbWVudFtwcm9wXSB8fCBpbml0U3RhdGUoZWxlbWVudCk7XG59XG5cbmZ1bmN0aW9uIGNsZWFuU3RhdGUoZWxlbWVudCkge1xuICAgIGRlbGV0ZSBlbGVtZW50W3Byb3BdO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgaW5pdFN0YXRlOiBpbml0U3RhdGUsXG4gIGdldFN0YXRlOiBnZXRTdGF0ZSxcbiAgY2xlYW5TdGF0ZTogY2xlYW5TdGF0ZVxufTtcbiJdfQ==
