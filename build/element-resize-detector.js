(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.elementResizeDetectorMaker = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var utils = require("./utils");

module.exports = function batchProcessorMaker(options) {
    options         = options || {};
    var reporter    = options.reporter;
    var async       = utils.getOption(options, "async", true);
    var autoProcess = utils.getOption(options, "auto", true);

    if(autoProcess && !async) {
        reporter && reporter.warn("Invalid options combination. auto=true and async=false is invalid. Setting async=true.");
        async = true;
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

        if(autoProcess && async && batchSize === 0) {
            processBatchAsync();
        }

        batch[level].push(fn);
        batchSize++;
    }

    function forceProcessBatch(processAsync) {
        if(processAsync === undefined) {
            processAsync = async;
        }

        if(asyncFrameHandler) {
            cancelFrame(asyncFrameHandler);
            asyncFrameHandler = null;
        }

        if(async) {
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
        return agent.indexOf("msie") !== -1 || agent.indexOf("trident") !== -1;
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
                    var style = objectDocument.createElement("style");
                    style.innerHTML = "html, body { margin: 0; padding: 0 } div { -webkit-transition: opacity 0.01s; -ms-transition: opacity 0.01s; -o-transition: opacity 0.01s; transition: opacity 0.01s; opacity: 0; }";

                    //TODO: Remove any styles that has been set on the object. Only the style above should be styling the object.

                    //Append the style to the object.
                    objectDocument.head.appendChild(style);

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
        var changed = function() {
            var elementStyle    = getComputedStyle(element);
            var width           = parseSize(elementStyle.width);
            var height          = parseSize(elementStyle.height);

            batchProcessor.add(function updateDetectorElements() {
                updateChildSizes(element, width, height);
                storeCurrentSize(element, width, height);
            });

            batchProcessor.add(1, function updateScrollbars() {
                positionScrollbars(element, width, height);
                listener(element);
            });
        };

        var expand = getExpandElement(element);
        var shrink = getShrinkElement(element);

        addEvent(expand, "scroll", function onExpand() {
            var style = getComputedStyle(element);
            var width = parseSize(style.width);
            var height = parseSize(style.height);
            if (width > element.lastWidth || height > element.lastHeight) {
                changed();
            }
        });

        addEvent(shrink, "scroll", function onShrink() {
            var style = getComputedStyle(element);
            var width = parseSize(style.width);
            var height = parseSize(style.height);
            if (width < element.lastWidth || height < element.lastHeight) {
                changed();
            }
        });
    }

    /**
     * Makes an element detectable and ready to be listened for resize events. Will call the callback when the element is ready to be listened for resize changes.
     * @private
     * @param {element} element The element to make detectable
     * @param {function} callback The callback to be called when the element is ready to be listened for resize changes. Will be called with the element as first parameter.
     */
    function makeDetectable(element, callback) {
        var elementStyle        = getComputedStyle(element);
        var width               = parseSize(elementStyle.width);
        var height              = parseSize(elementStyle.height);
        var readyExpandScroll   = false;
        var readyShrinkScroll   = false;
        var readyOverall        = false;

        function ready() {
            if(readyExpandScroll && readyShrinkScroll && readyOverall) {
                callback(element);
            }
        }

        function mutateDom() {
            if(elementStyle.position === "static") {
                element.style.position = "relative";

                var removeRelativeStyles = function(reporter, element, style, property) {
                    function getNumericalValue(value) {
                        return value.replace(/[^-\d\.]/g, "");
                    }

                    var value = elementStyle[property];

                    if(value !== "auto" && getNumericalValue(value) !== "0") {
                        reporter.warn("An element that is positioned static has style." + property + "=" + value + " which is ignored due to the static positioning. The element will need to be positioned relative, so the style." + property + " will be set to 0. Element: ", element);
                        element.style[property] = 0;
                    }
                };

                //Check so that there are no accidental styles that will make the element styled differently now that is is relative.
                //If there are any, set them to 0 (this should be okay with the user since the style properties did nothing before [since the element was positioned static] anyway).
                removeRelativeStyles(reporter, element, elementStyle, "top");
                removeRelativeStyles(reporter, element, elementStyle, "right");
                removeRelativeStyles(reporter, element, elementStyle, "bottom");
                removeRelativeStyles(reporter, element, elementStyle, "left");
            }

            function getContainerCssText(left, top) {
                left = (!left ? "0" : (left + "px"));
                top = (!top ? "0" : (top + "px"));

                return "position: absolute; left: " + left + "; top: " + top + "; right: 0; bottom: 0; overflow: scroll; z-index: -1; visibility: hidden;";
            }

            var containerStyle          = getContainerCssText(-1, -1);
            var shrinkExpandstyle       = getContainerCssText(0, 0);
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

    return {
        makeDetectable: makeDetectable,
        addListener: addListener
    };
};

function parseSize(size) {
    return parseFloat(size.replace(/px/, ""));
}

},{}],7:[function(require,module,exports){
//Heavily inspired by http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/

"use strict";

var forEach                 = require("./collection-utils").forEach;
var elementUtilsMaker       = require("./element-utils");
var listenerHandlerMaker    = require("./listener-handler");
var idGeneratorMaker        = require("./id-generator");
var idHandlerMaker          = require("./id-handler");
var reporterMaker           = require("./reporter");
var batchProcessorMaker       = require("batch-processor");

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

},{"./collection-utils":4,"./detection-strategy/object.js":5,"./detection-strategy/scroll.js":6,"./element-utils":8,"./id-generator":9,"./id-handler":10,"./listener-handler":11,"./reporter":12,"batch-processor":1}],8:[function(require,module,exports){
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
},{}]},{},[7])(7)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYmF0Y2gtcHJvY2Vzc29yL3NyYy9iYXRjaC1wcm9jZXNzb3IuanMiLCJub2RlX21vZHVsZXMvYmF0Y2gtcHJvY2Vzc29yL3NyYy91dGlscy5qcyIsInNyYy9icm93c2VyLWRldGVjdG9yLmpzIiwic3JjL2NvbGxlY3Rpb24tdXRpbHMuanMiLCJzcmMvZGV0ZWN0aW9uLXN0cmF0ZWd5L29iamVjdC5qcyIsInNyYy9kZXRlY3Rpb24tc3RyYXRlZ3kvc2Nyb2xsLmpzIiwic3JjL2VsZW1lbnQtcmVzaXplLWRldGVjdG9yLmpzIiwic3JjL2VsZW1lbnQtdXRpbHMuanMiLCJzcmMvaWQtZ2VuZXJhdG9yLmpzIiwic3JjL2lkLWhhbmRsZXIuanMiLCJzcmMvbGlzdGVuZXItaGFuZGxlci5qcyIsInNyYy9yZXBvcnRlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBiYXRjaFByb2Nlc3Nvck1ha2VyKG9wdGlvbnMpIHtcbiAgICBvcHRpb25zICAgICAgICAgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciByZXBvcnRlciAgICA9IG9wdGlvbnMucmVwb3J0ZXI7XG4gICAgdmFyIGFzeW5jICAgICAgID0gdXRpbHMuZ2V0T3B0aW9uKG9wdGlvbnMsIFwiYXN5bmNcIiwgdHJ1ZSk7XG4gICAgdmFyIGF1dG9Qcm9jZXNzID0gdXRpbHMuZ2V0T3B0aW9uKG9wdGlvbnMsIFwiYXV0b1wiLCB0cnVlKTtcblxuICAgIGlmKGF1dG9Qcm9jZXNzICYmICFhc3luYykge1xuICAgICAgICByZXBvcnRlciAmJiByZXBvcnRlci53YXJuKFwiSW52YWxpZCBvcHRpb25zIGNvbWJpbmF0aW9uLiBhdXRvPXRydWUgYW5kIGFzeW5jPWZhbHNlIGlzIGludmFsaWQuIFNldHRpbmcgYXN5bmM9dHJ1ZS5cIik7XG4gICAgICAgIGFzeW5jID0gdHJ1ZTtcbiAgICB9XG5cbiAgICB2YXIgYmF0Y2g7XG4gICAgdmFyIGJhdGNoU2l6ZTtcbiAgICB2YXIgdG9wTGV2ZWw7XG4gICAgdmFyIGJvdHRvbUxldmVsO1xuXG4gICAgY2xlYXJCYXRjaCgpO1xuXG4gICAgdmFyIGFzeW5jRnJhbWVIYW5kbGVyO1xuXG4gICAgZnVuY3Rpb24gYWRkRnVuY3Rpb24obGV2ZWwsIGZuKSB7XG4gICAgICAgIGlmKCFmbikge1xuICAgICAgICAgICAgZm4gPSBsZXZlbDtcbiAgICAgICAgICAgIGxldmVsID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGxldmVsID4gdG9wTGV2ZWwpIHtcbiAgICAgICAgICAgIHRvcExldmVsID0gbGV2ZWw7XG4gICAgICAgIH0gZWxzZSBpZihsZXZlbCA8IGJvdHRvbUxldmVsKSB7XG4gICAgICAgICAgICBib3R0b21MZXZlbCA9IGxldmVsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIWJhdGNoW2xldmVsXSkge1xuICAgICAgICAgICAgYmF0Y2hbbGV2ZWxdID0gW107XG4gICAgICAgIH1cblxuICAgICAgICBpZihhdXRvUHJvY2VzcyAmJiBhc3luYyAmJiBiYXRjaFNpemUgPT09IDApIHtcbiAgICAgICAgICAgIHByb2Nlc3NCYXRjaEFzeW5jKCk7XG4gICAgICAgIH1cblxuICAgICAgICBiYXRjaFtsZXZlbF0ucHVzaChmbik7XG4gICAgICAgIGJhdGNoU2l6ZSsrO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZvcmNlUHJvY2Vzc0JhdGNoKHByb2Nlc3NBc3luYykge1xuICAgICAgICBpZihwcm9jZXNzQXN5bmMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcHJvY2Vzc0FzeW5jID0gYXN5bmM7XG4gICAgICAgIH1cblxuICAgICAgICBpZihhc3luY0ZyYW1lSGFuZGxlcikge1xuICAgICAgICAgICAgY2FuY2VsRnJhbWUoYXN5bmNGcmFtZUhhbmRsZXIpO1xuICAgICAgICAgICAgYXN5bmNGcmFtZUhhbmRsZXIgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoYXN5bmMpIHtcbiAgICAgICAgICAgIHByb2Nlc3NCYXRjaEFzeW5jKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm9jZXNzQmF0Y2goKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHByb2Nlc3NCYXRjaCgpIHtcbiAgICAgICAgZm9yKHZhciBsZXZlbCA9IGJvdHRvbUxldmVsOyBsZXZlbCA8PSB0b3BMZXZlbDsgbGV2ZWwrKykge1xuICAgICAgICAgICAgdmFyIGZucyA9IGJhdGNoW2xldmVsXTtcblxuICAgICAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IGZucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBmbiA9IGZuc1tpXTtcbiAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNsZWFyQmF0Y2goKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwcm9jZXNzQmF0Y2hBc3luYygpIHtcbiAgICAgICAgYXN5bmNGcmFtZUhhbmRsZXIgPSByZXF1ZXN0RnJhbWUocHJvY2Vzc0JhdGNoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjbGVhckJhdGNoKCkge1xuICAgICAgICBiYXRjaCAgICAgICAgICAgPSB7fTtcbiAgICAgICAgYmF0Y2hTaXplICAgICAgID0gMDtcbiAgICAgICAgdG9wTGV2ZWwgICAgICAgID0gMDtcbiAgICAgICAgYm90dG9tTGV2ZWwgICAgID0gMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjYW5jZWxGcmFtZShsaXN0ZW5lcikge1xuICAgICAgICAvLyB2YXIgY2FuY2VsID0gd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy5tb3pDYW5jZWxBbmltYXRpb25GcmFtZSB8fCB3aW5kb3cud2Via2l0Q2FuY2VsQW5pbWF0aW9uRnJhbWUgfHwgd2luZG93LmNsZWFyVGltZW91dDtcbiAgICAgICAgdmFyIGNhbmNlbCA9IHdpbmRvdy5jbGVhclRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBjYW5jZWwobGlzdGVuZXIpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlcXVlc3RGcmFtZShjYWxsYmFjaykge1xuICAgICAgICAvLyB2YXIgcmFmID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSB8fCB3aW5kb3cubW96UmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy53ZWJraXRSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHwgZnVuY3Rpb24oZm4pIHsgcmV0dXJuIHdpbmRvdy5zZXRUaW1lb3V0KGZuLCAyMCk7IH07XG4gICAgICAgIHZhciByYWYgPSBmdW5jdGlvbihmbikgeyByZXR1cm4gd2luZG93LnNldFRpbWVvdXQoZm4sIDApOyB9O1xuICAgICAgICByZXR1cm4gcmFmKGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBhZGQ6IGFkZEZ1bmN0aW9uLFxuICAgICAgICBmb3JjZTogZm9yY2VQcm9jZXNzQmF0Y2hcbiAgICB9O1xufTsiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxudXRpbHMuZ2V0T3B0aW9uID0gZ2V0T3B0aW9uO1xuXG5mdW5jdGlvbiBnZXRPcHRpb24ob3B0aW9ucywgbmFtZSwgZGVmYXVsdFZhbHVlKSB7XG4gICAgdmFyIHZhbHVlID0gb3B0aW9uc1tuYW1lXTtcblxuICAgIGlmKCh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSAmJiBkZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICAgIH1cblxuICAgIHJldHVybiB2YWx1ZTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZGV0ZWN0b3IgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG5kZXRlY3Rvci5pc0lFID0gZnVuY3Rpb24odmVyc2lvbikge1xuICAgIGZ1bmN0aW9uIGlzQW55SWVWZXJzaW9uKCkge1xuICAgICAgICB2YXIgYWdlbnQgPSBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIHJldHVybiBhZ2VudC5pbmRleE9mKFwibXNpZVwiKSAhPT0gLTEgfHwgYWdlbnQuaW5kZXhPZihcInRyaWRlbnRcIikgIT09IC0xO1xuICAgIH1cblxuICAgIGlmKCFpc0FueUllVmVyc2lvbigpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBpZighdmVyc2lvbikge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvL1NoYW1lbGVzc2x5IHN0b2xlbiBmcm9tIGh0dHBzOi8vZ2lzdC5naXRodWIuY29tL3BhZG9sc2V5LzUyNzY4M1xuICAgIHZhciBpZVZlcnNpb24gPSAoZnVuY3Rpb24oKXtcbiAgICAgICAgdmFyIHVuZGVmLFxuICAgICAgICAgICAgdiA9IDMsXG4gICAgICAgICAgICBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLFxuICAgICAgICAgICAgYWxsID0gZGl2LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiaVwiKTtcblxuICAgICAgICBkbyB7XG4gICAgICAgICAgICBkaXYuaW5uZXJIVE1MID0gXCI8IS0tW2lmIGd0IElFIFwiICsgKCsrdikgKyBcIl0+PGk+PC9pPjwhW2VuZGlmXS0tPlwiO1xuICAgICAgICB9XG4gICAgICAgIHdoaWxlIChhbGxbMF0pO1xuXG4gICAgICAgIHJldHVybiB2ID4gNCA/IHYgOiB1bmRlZjtcbiAgICB9KCkpO1xuXG4gICAgcmV0dXJuIHZlcnNpb24gPT09IGllVmVyc2lvbjtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLyoqXG4gKiBMb29wcyB0aHJvdWdoIHRoZSBjb2xsZWN0aW9uIGFuZCBjYWxscyB0aGUgY2FsbGJhY2sgZm9yIGVhY2ggZWxlbWVudC4gaWYgdGhlIGNhbGxiYWNrIHJldHVybnMgdHJ1dGh5LCB0aGUgbG9vcCBpcyBicm9rZW4gYW5kIHJldHVybnMgdGhlIHNhbWUgdmFsdWUuXG4gKiBAcHVibGljXG4gKiBAcGFyYW0geyp9IGNvbGxlY3Rpb24gVGhlIGNvbGxlY3Rpb24gdG8gbG9vcCB0aHJvdWdoLiBOZWVkcyB0byBoYXZlIGEgbGVuZ3RoIHByb3BlcnR5IHNldCBhbmQgaGF2ZSBpbmRpY2VzIHNldCBmcm9tIDAgdG8gbGVuZ3RoIC0gMS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIFRoZSBjYWxsYmFjayB0byBiZSBjYWxsZWQgZm9yIGVhY2ggZWxlbWVudC4gVGhlIGVsZW1lbnQgd2lsbCBiZSBnaXZlbiBhcyBhIHBhcmFtZXRlciB0byB0aGUgY2FsbGJhY2suIElmIHRoaXMgY2FsbGJhY2sgcmV0dXJucyB0cnV0aHksIHRoZSBsb29wIGlzIGJyb2tlbiBhbmQgdGhlIHNhbWUgdmFsdWUgaXMgcmV0dXJuZWQuXG4gKiBAcmV0dXJucyB7Kn0gVGhlIHZhbHVlIHRoYXQgYSBjYWxsYmFjayBoYXMgcmV0dXJuZWQgKGlmIHRydXRoeSkuIE90aGVyd2lzZSBub3RoaW5nLlxuICovXG51dGlscy5mb3JFYWNoID0gZnVuY3Rpb24oY29sbGVjdGlvbiwgY2FsbGJhY2spIHtcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgY29sbGVjdGlvbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgcmVzdWx0ID0gY2FsbGJhY2soY29sbGVjdGlvbltpXSk7XG4gICAgICAgIGlmKHJlc3VsdCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgIH1cbn07XG4iLCIvKipcbiAqIFJlc2l6ZSBkZXRlY3Rpb24gc3RyYXRlZ3kgdGhhdCBpbmplY3RzIG9iamVjdHMgdG8gZWxlbWVudHMgaW4gb3JkZXIgdG8gZGV0ZWN0IHJlc2l6ZSBldmVudHMuXG4gKiBIZWF2aWx5IGluc3BpcmVkIGJ5OiBodHRwOi8vd3d3LmJhY2thbGxleWNvZGVyLmNvbS8yMDEzLzAzLzE4L2Nyb3NzLWJyb3dzZXItZXZlbnQtYmFzZWQtZWxlbWVudC1yZXNpemUtZGV0ZWN0aW9uL1xuICovXG5cblwidXNlIHN0cmljdFwiO1xuXG52YXIgYnJvd3NlckRldGVjdG9yID0gcmVxdWlyZShcIi4uL2Jyb3dzZXItZGV0ZWN0b3JcIik7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIG9wdGlvbnMgICAgICAgICAgICAgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciByZXBvcnRlciAgICAgICAgPSBvcHRpb25zLnJlcG9ydGVyO1xuICAgIHZhciBiYXRjaFByb2Nlc3NvciAgPSBvcHRpb25zLmJhdGNoUHJvY2Vzc29yO1xuXG4gICAgaWYoIXJlcG9ydGVyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk1pc3NpbmcgcmVxdWlyZWQgZGVwZW5kZW5jeTogcmVwb3J0ZXIuXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSByZXNpemUgZXZlbnQgbGlzdGVuZXIgdG8gdGhlIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0aGF0IHNob3VsZCBoYXZlIHRoZSBsaXN0ZW5lciBhZGRlZC5cbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBsaXN0ZW5lciBUaGUgbGlzdGVuZXIgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIGZvciBlYWNoIHJlc2l6ZSBldmVudCBvZiB0aGUgZWxlbWVudC4gVGhlIGVsZW1lbnQgd2lsbCBiZSBnaXZlbiBhcyBhIHBhcmFtZXRlciB0byB0aGUgbGlzdGVuZXIgY2FsbGJhY2suXG4gICAgICovXG4gICAgZnVuY3Rpb24gYWRkTGlzdGVuZXIoZWxlbWVudCwgbGlzdGVuZXIpIHtcbiAgICAgICAgaWYoIWdldE9iamVjdChlbGVtZW50KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRWxlbWVudCBpcyBub3QgZGV0ZWN0YWJsZSBieSB0aGlzIHN0cmF0ZWd5LlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGxpc3RlbmVyUHJveHkoKSB7XG4gICAgICAgICAgICBsaXN0ZW5lcihlbGVtZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGJyb3dzZXJEZXRlY3Rvci5pc0lFKDgpKSB7XG4gICAgICAgICAgICAvL0lFIDggZG9lcyBub3Qgc3VwcG9ydCBvYmplY3QsIGJ1dCBzdXBwb3J0cyB0aGUgcmVzaXplIGV2ZW50IGRpcmVjdGx5IG9uIGVsZW1lbnRzLlxuICAgICAgICAgICAgZWxlbWVudC5hdHRhY2hFdmVudChcIm9ucmVzaXplXCIsIGxpc3RlbmVyUHJveHkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIG9iamVjdCA9IGdldE9iamVjdChlbGVtZW50KTtcbiAgICAgICAgICAgIG9iamVjdC5jb250ZW50RG9jdW1lbnQuZGVmYXVsdFZpZXcuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCBsaXN0ZW5lclByb3h5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1ha2VzIGFuIGVsZW1lbnQgZGV0ZWN0YWJsZSBhbmQgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBldmVudHMuIFdpbGwgY2FsbCB0aGUgY2FsbGJhY2sgd2hlbiB0aGUgZWxlbWVudCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGNoYW5nZXMuXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdG8gbWFrZSBkZXRlY3RhYmxlXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCB3aGVuIHRoZSBlbGVtZW50IGlzIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgY2hhbmdlcy4gV2lsbCBiZSBjYWxsZWQgd2l0aCB0aGUgZWxlbWVudCBhcyBmaXJzdCBwYXJhbWV0ZXIuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbWFrZURldGVjdGFibGUoZWxlbWVudCwgY2FsbGJhY2spIHtcbiAgICAgICAgZnVuY3Rpb24gaW5qZWN0T2JqZWN0KGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICB2YXIgT0JKRUNUX1NUWUxFID0gXCJkaXNwbGF5OiBibG9jazsgcG9zaXRpb246IGFic29sdXRlOyB0b3A6IDA7IGxlZnQ6IDA7IHdpZHRoOiAxMDAlOyBoZWlnaHQ6IDEwMCU7IGJvcmRlcjogbm9uZTsgcGFkZGluZzogMDsgbWFyZ2luOiAwOyBvcGFjaXR5OiAwOyB6LWluZGV4OiAtMTAwMDsgcG9pbnRlci1ldmVudHM6IG5vbmU7XCI7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIG9uT2JqZWN0TG9hZCgpIHtcbiAgICAgICAgICAgICAgICAvKmpzaGludCB2YWxpZHRoaXM6IHRydWUgKi9cblxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGdldERvY3VtZW50KGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vT3BlcmEgMTIgc2VlbSB0byBjYWxsIHRoZSBvYmplY3Qub25sb2FkIGJlZm9yZSB0aGUgYWN0dWFsIGRvY3VtZW50IGhhcyBiZWVuIGNyZWF0ZWQuXG4gICAgICAgICAgICAgICAgICAgIC8vU28gaWYgaXQgaXMgbm90IHByZXNlbnQsIHBvbGwgaXQgd2l0aCBhbiB0aW1lb3V0IHVudGlsIGl0IGlzIHByZXNlbnQuXG4gICAgICAgICAgICAgICAgICAgIC8vVE9ETzogQ291bGQgbWF5YmUgYmUgaGFuZGxlZCBiZXR0ZXIgd2l0aCBvYmplY3Qub25yZWFkeXN0YXRlY2hhbmdlIG9yIHNpbWlsYXIuXG4gICAgICAgICAgICAgICAgICAgIGlmKCFlbGVtZW50LmNvbnRlbnREb2N1bWVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiBjaGVja0Zvck9iamVjdERvY3VtZW50KCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdldERvY3VtZW50KGVsZW1lbnQsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIDEwMCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVsZW1lbnQuY29udGVudERvY3VtZW50KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvL011dGF0aW5nIHRoZSBvYmplY3QgZWxlbWVudCBoZXJlIHNlZW1zIHRvIGZpcmUgYW5vdGhlciBsb2FkIGV2ZW50LlxuICAgICAgICAgICAgICAgIC8vTXV0YXRpbmcgdGhlIGlubmVyIGRvY3VtZW50IG9mIHRoZSBvYmplY3QgZWxlbWVudCBpcyBmaW5lIHRob3VnaC5cbiAgICAgICAgICAgICAgICB2YXIgb2JqZWN0RWxlbWVudCA9IHRoaXM7XG5cbiAgICAgICAgICAgICAgICAvL0NyZWF0ZSB0aGUgc3R5bGUgZWxlbWVudCB0byBiZSBhZGRlZCB0byB0aGUgb2JqZWN0LlxuICAgICAgICAgICAgICAgIGdldERvY3VtZW50KG9iamVjdEVsZW1lbnQsIGZ1bmN0aW9uIG9uT2JqZWN0RG9jdW1lbnRSZWFkeShvYmplY3REb2N1bWVudCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3R5bGUgPSBvYmplY3REb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gICAgICAgICAgICAgICAgICAgIHN0eWxlLmlubmVySFRNTCA9IFwiaHRtbCwgYm9keSB7IG1hcmdpbjogMDsgcGFkZGluZzogMCB9IGRpdiB7IC13ZWJraXQtdHJhbnNpdGlvbjogb3BhY2l0eSAwLjAxczsgLW1zLXRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IC1vLXRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IHRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IG9wYWNpdHk6IDA7IH1cIjtcblxuICAgICAgICAgICAgICAgICAgICAvL1RPRE86IFJlbW92ZSBhbnkgc3R5bGVzIHRoYXQgaGFzIGJlZW4gc2V0IG9uIHRoZSBvYmplY3QuIE9ubHkgdGhlIHN0eWxlIGFib3ZlIHNob3VsZCBiZSBzdHlsaW5nIHRoZSBvYmplY3QuXG5cbiAgICAgICAgICAgICAgICAgICAgLy9BcHBlbmQgdGhlIHN0eWxlIHRvIHRoZSBvYmplY3QuXG4gICAgICAgICAgICAgICAgICAgIG9iamVjdERvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vTm90aWZ5IHRoYXQgdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgdG8uXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL1RoZSB0YXJnZXQgZWxlbWVudCBuZWVkcyB0byBiZSBwb3NpdGlvbmVkIChldmVyeXRoaW5nIGV4Y2VwdCBzdGF0aWMpIHNvIHRoZSBhYnNvbHV0ZSBwb3NpdGlvbmVkIG9iamVjdCB3aWxsIGJlIHBvc2l0aW9uZWQgcmVsYXRpdmUgdG8gdGhlIHRhcmdldCBlbGVtZW50LlxuICAgICAgICAgICAgdmFyIHN0eWxlID0gZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcbiAgICAgICAgICAgIHZhciBwb3NpdGlvbiA9IHN0eWxlLnBvc2l0aW9uO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBtdXRhdGVEb20oKSB7XG4gICAgICAgICAgICAgICAgaWYocG9zaXRpb24gPT09IFwic3RhdGljXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9IFwicmVsYXRpdmVcIjtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgcmVtb3ZlUmVsYXRpdmVTdHlsZXMgPSBmdW5jdGlvbihyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIHByb3BlcnR5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBnZXROdW1lcmljYWxWYWx1ZSh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bXi1cXGRcXC5dL2csIFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSBzdHlsZVtwcm9wZXJ0eV07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKHZhbHVlICE9PSBcImF1dG9cIiAmJiBnZXROdW1lcmljYWxWYWx1ZSh2YWx1ZSkgIT09IFwiMFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0ZXIud2FybihcIkFuIGVsZW1lbnQgdGhhdCBpcyBwb3NpdGlvbmVkIHN0YXRpYyBoYXMgc3R5bGUuXCIgKyBwcm9wZXJ0eSArIFwiPVwiICsgdmFsdWUgKyBcIiB3aGljaCBpcyBpZ25vcmVkIGR1ZSB0byB0aGUgc3RhdGljIHBvc2l0aW9uaW5nLiBUaGUgZWxlbWVudCB3aWxsIG5lZWQgdG8gYmUgcG9zaXRpb25lZCByZWxhdGl2ZSwgc28gdGhlIHN0eWxlLlwiICsgcHJvcGVydHkgKyBcIiB3aWxsIGJlIHNldCB0byAwLiBFbGVtZW50OiBcIiwgZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZVtwcm9wZXJ0eV0gPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIC8vQ2hlY2sgc28gdGhhdCB0aGVyZSBhcmUgbm8gYWNjaWRlbnRhbCBzdHlsZXMgdGhhdCB3aWxsIG1ha2UgdGhlIGVsZW1lbnQgc3R5bGVkIGRpZmZlcmVudGx5IG5vdyB0aGF0IGlzIGlzIHJlbGF0aXZlLlxuICAgICAgICAgICAgICAgICAgICAvL0lmIHRoZXJlIGFyZSBhbnksIHNldCB0aGVtIHRvIDAgKHRoaXMgc2hvdWxkIGJlIG9rYXkgd2l0aCB0aGUgdXNlciBzaW5jZSB0aGUgc3R5bGUgcHJvcGVydGllcyBkaWQgbm90aGluZyBiZWZvcmUgW3NpbmNlIHRoZSBlbGVtZW50IHdhcyBwb3NpdGlvbmVkIHN0YXRpY10gYW55d2F5KS5cbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIHN0eWxlLCBcInRvcFwiKTtcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIHN0eWxlLCBcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIFwiYm90dG9tXCIpO1xuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIFwibGVmdFwiKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvL0FkZCBhbiBvYmplY3QgZWxlbWVudCBhcyBhIGNoaWxkIHRvIHRoZSB0YXJnZXQgZWxlbWVudCB0aGF0IHdpbGwgYmUgbGlzdGVuZWQgdG8gZm9yIHJlc2l6ZSBldmVudHMuXG4gICAgICAgICAgICAgICAgdmFyIG9iamVjdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJvYmplY3RcIik7XG4gICAgICAgICAgICAgICAgb2JqZWN0LnN0eWxlLmNzc1RleHQgPSBPQkpFQ1RfU1RZTEU7XG4gICAgICAgICAgICAgICAgb2JqZWN0LnR5cGUgPSBcInRleHQvaHRtbFwiO1xuICAgICAgICAgICAgICAgIG9iamVjdC5vbmxvYWQgPSBvbk9iamVjdExvYWQ7XG5cbiAgICAgICAgICAgICAgICAvL1NhZmFyaTogVGhpcyBtdXN0IG9jY3VyIGJlZm9yZSBhZGRpbmcgdGhlIG9iamVjdCB0byB0aGUgRE9NLlxuICAgICAgICAgICAgICAgIC8vSUU6IERvZXMgbm90IGxpa2UgdGhhdCB0aGlzIGhhcHBlbnMgYmVmb3JlLCBldmVuIGlmIGl0IGlzIGFsc28gYWRkZWQgYWZ0ZXIuXG4gICAgICAgICAgICAgICAgaWYoIWJyb3dzZXJEZXRlY3Rvci5pc0lFKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgb2JqZWN0LmRhdGEgPSBcImFib3V0OmJsYW5rXCI7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZWxlbWVudC5hcHBlbmRDaGlsZChvYmplY3QpO1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuX2VyZE9iamVjdCA9IG9iamVjdDtcblxuICAgICAgICAgICAgICAgIC8vSUU6IFRoaXMgbXVzdCBvY2N1ciBhZnRlciBhZGRpbmcgdGhlIG9iamVjdCB0byB0aGUgRE9NLlxuICAgICAgICAgICAgICAgIGlmKGJyb3dzZXJEZXRlY3Rvci5pc0lFKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgb2JqZWN0LmRhdGEgPSBcImFib3V0OmJsYW5rXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZihiYXRjaFByb2Nlc3Nvcikge1xuICAgICAgICAgICAgICAgIGJhdGNoUHJvY2Vzc29yLmFkZChtdXRhdGVEb20pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtdXRhdGVEb20oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGJyb3dzZXJEZXRlY3Rvci5pc0lFKDgpKSB7XG4gICAgICAgICAgICAvL0lFIDggZG9lcyBub3Qgc3VwcG9ydCBvYmplY3RzIHByb3Blcmx5LiBMdWNraWx5IHRoZXkgZG8gc3VwcG9ydCB0aGUgcmVzaXplIGV2ZW50LlxuICAgICAgICAgICAgLy9TbyBkbyBub3QgaW5qZWN0IHRoZSBvYmplY3QgYW5kIG5vdGlmeSB0aGF0IHRoZSBlbGVtZW50IGlzIGFscmVhZHkgcmVhZHkgdG8gYmUgbGlzdGVuZWQgdG8uXG4gICAgICAgICAgICAvL1RoZSBldmVudCBoYW5kbGVyIGZvciB0aGUgcmVzaXplIGV2ZW50IGlzIGF0dGFjaGVkIGluIHRoZSB1dGlscy5hZGRMaXN0ZW5lciBpbnN0ZWFkLlxuICAgICAgICAgICAgY2FsbGJhY2soZWxlbWVudCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbmplY3RPYmplY3QoZWxlbWVudCwgY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY2hpbGQgb2JqZWN0IG9mIHRoZSB0YXJnZXQgZWxlbWVudC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgdGFyZ2V0IGVsZW1lbnQuXG4gICAgICogQHJldHVybnMgVGhlIG9iamVjdCBlbGVtZW50IG9mIHRoZSB0YXJnZXQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0T2JqZWN0KGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuX2VyZE9iamVjdDtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBtYWtlRGV0ZWN0YWJsZTogbWFrZURldGVjdGFibGUsXG4gICAgICAgIGFkZExpc3RlbmVyOiBhZGRMaXN0ZW5lclxuICAgIH07XG59O1xuIiwiLyoqXG4gKiBSZXNpemUgZGV0ZWN0aW9uIHN0cmF0ZWd5IHRoYXQgaW5qZWN0cyBkaXZzIHRvIGVsZW1lbnRzIGluIG9yZGVyIHRvIGRldGVjdCByZXNpemUgZXZlbnRzIG9uIHNjcm9sbCBldmVudHMuXG4gKiBIZWF2aWx5IGluc3BpcmVkIGJ5OiBodHRwczovL2dpdGh1Yi5jb20vbWFyY2ovY3NzLWVsZW1lbnQtcXVlcmllcy9ibG9iL21hc3Rlci9zcmMvUmVzaXplU2Vuc29yLmpzXG4gKi9cblxuXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIG9wdGlvbnMgICAgICAgICAgICAgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciByZXBvcnRlciAgICAgICAgPSBvcHRpb25zLnJlcG9ydGVyO1xuICAgIHZhciBiYXRjaFByb2Nlc3NvciAgPSBvcHRpb25zLmJhdGNoUHJvY2Vzc29yO1xuXG4gICAgaWYoIXJlcG9ydGVyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk1pc3NpbmcgcmVxdWlyZWQgZGVwZW5kZW5jeTogcmVwb3J0ZXIuXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSByZXNpemUgZXZlbnQgbGlzdGVuZXIgdG8gdGhlIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0aGF0IHNob3VsZCBoYXZlIHRoZSBsaXN0ZW5lciBhZGRlZC5cbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBsaXN0ZW5lciBUaGUgbGlzdGVuZXIgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIGZvciBlYWNoIHJlc2l6ZSBldmVudCBvZiB0aGUgZWxlbWVudC4gVGhlIGVsZW1lbnQgd2lsbCBiZSBnaXZlbiBhcyBhIHBhcmFtZXRlciB0byB0aGUgbGlzdGVuZXIgY2FsbGJhY2suXG4gICAgICovXG4gICAgZnVuY3Rpb24gYWRkTGlzdGVuZXIoZWxlbWVudCwgbGlzdGVuZXIpIHtcbiAgICAgICAgdmFyIGNoYW5nZWQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciBlbGVtZW50U3R5bGUgICAgPSBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuICAgICAgICAgICAgdmFyIHdpZHRoICAgICAgICAgICA9IHBhcnNlU2l6ZShlbGVtZW50U3R5bGUud2lkdGgpO1xuICAgICAgICAgICAgdmFyIGhlaWdodCAgICAgICAgICA9IHBhcnNlU2l6ZShlbGVtZW50U3R5bGUuaGVpZ2h0KTtcblxuICAgICAgICAgICAgYmF0Y2hQcm9jZXNzb3IuYWRkKGZ1bmN0aW9uIHVwZGF0ZURldGVjdG9yRWxlbWVudHMoKSB7XG4gICAgICAgICAgICAgICAgdXBkYXRlQ2hpbGRTaXplcyhlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgICAgICAgICBzdG9yZUN1cnJlbnRTaXplKGVsZW1lbnQsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGJhdGNoUHJvY2Vzc29yLmFkZCgxLCBmdW5jdGlvbiB1cGRhdGVTY3JvbGxiYXJzKCkge1xuICAgICAgICAgICAgICAgIHBvc2l0aW9uU2Nyb2xsYmFycyhlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcihlbGVtZW50KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIHZhciBleHBhbmQgPSBnZXRFeHBhbmRFbGVtZW50KGVsZW1lbnQpO1xuICAgICAgICB2YXIgc2hyaW5rID0gZ2V0U2hyaW5rRWxlbWVudChlbGVtZW50KTtcblxuICAgICAgICBhZGRFdmVudChleHBhbmQsIFwic2Nyb2xsXCIsIGZ1bmN0aW9uIG9uRXhwYW5kKCkge1xuICAgICAgICAgICAgdmFyIHN0eWxlID0gZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcbiAgICAgICAgICAgIHZhciB3aWR0aCA9IHBhcnNlU2l6ZShzdHlsZS53aWR0aCk7XG4gICAgICAgICAgICB2YXIgaGVpZ2h0ID0gcGFyc2VTaXplKHN0eWxlLmhlaWdodCk7XG4gICAgICAgICAgICBpZiAod2lkdGggPiBlbGVtZW50Lmxhc3RXaWR0aCB8fCBoZWlnaHQgPiBlbGVtZW50Lmxhc3RIZWlnaHQpIHtcbiAgICAgICAgICAgICAgICBjaGFuZ2VkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGFkZEV2ZW50KHNocmluaywgXCJzY3JvbGxcIiwgZnVuY3Rpb24gb25TaHJpbmsoKSB7XG4gICAgICAgICAgICB2YXIgc3R5bGUgPSBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuICAgICAgICAgICAgdmFyIHdpZHRoID0gcGFyc2VTaXplKHN0eWxlLndpZHRoKTtcbiAgICAgICAgICAgIHZhciBoZWlnaHQgPSBwYXJzZVNpemUoc3R5bGUuaGVpZ2h0KTtcbiAgICAgICAgICAgIGlmICh3aWR0aCA8IGVsZW1lbnQubGFzdFdpZHRoIHx8IGhlaWdodCA8IGVsZW1lbnQubGFzdEhlaWdodCkge1xuICAgICAgICAgICAgICAgIGNoYW5nZWQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWFrZXMgYW4gZWxlbWVudCBkZXRlY3RhYmxlIGFuZCByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGV2ZW50cy4gV2lsbCBjYWxsIHRoZSBjYWxsYmFjayB3aGVuIHRoZSBlbGVtZW50IGlzIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgY2hhbmdlcy5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0byBtYWtlIGRldGVjdGFibGVcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIHdoZW4gdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBjaGFuZ2VzLiBXaWxsIGJlIGNhbGxlZCB3aXRoIHRoZSBlbGVtZW50IGFzIGZpcnN0IHBhcmFtZXRlci5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBtYWtlRGV0ZWN0YWJsZShlbGVtZW50LCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZWxlbWVudFN0eWxlICAgICAgICA9IGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG4gICAgICAgIHZhciB3aWR0aCAgICAgICAgICAgICAgID0gcGFyc2VTaXplKGVsZW1lbnRTdHlsZS53aWR0aCk7XG4gICAgICAgIHZhciBoZWlnaHQgICAgICAgICAgICAgID0gcGFyc2VTaXplKGVsZW1lbnRTdHlsZS5oZWlnaHQpO1xuICAgICAgICB2YXIgcmVhZHlFeHBhbmRTY3JvbGwgICA9IGZhbHNlO1xuICAgICAgICB2YXIgcmVhZHlTaHJpbmtTY3JvbGwgICA9IGZhbHNlO1xuICAgICAgICB2YXIgcmVhZHlPdmVyYWxsICAgICAgICA9IGZhbHNlO1xuXG4gICAgICAgIGZ1bmN0aW9uIHJlYWR5KCkge1xuICAgICAgICAgICAgaWYocmVhZHlFeHBhbmRTY3JvbGwgJiYgcmVhZHlTaHJpbmtTY3JvbGwgJiYgcmVhZHlPdmVyYWxsKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZWxlbWVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBtdXRhdGVEb20oKSB7XG4gICAgICAgICAgICBpZihlbGVtZW50U3R5bGUucG9zaXRpb24gPT09IFwic3RhdGljXCIpIHtcbiAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gXCJyZWxhdGl2ZVwiO1xuXG4gICAgICAgICAgICAgICAgdmFyIHJlbW92ZVJlbGF0aXZlU3R5bGVzID0gZnVuY3Rpb24ocmVwb3J0ZXIsIGVsZW1lbnQsIHN0eWxlLCBwcm9wZXJ0eSkge1xuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBnZXROdW1lcmljYWxWYWx1ZSh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1teLVxcZFxcLl0vZywgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSBlbGVtZW50U3R5bGVbcHJvcGVydHldO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmKHZhbHVlICE9PSBcImF1dG9cIiAmJiBnZXROdW1lcmljYWxWYWx1ZSh2YWx1ZSkgIT09IFwiMFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRlci53YXJuKFwiQW4gZWxlbWVudCB0aGF0IGlzIHBvc2l0aW9uZWQgc3RhdGljIGhhcyBzdHlsZS5cIiArIHByb3BlcnR5ICsgXCI9XCIgKyB2YWx1ZSArIFwiIHdoaWNoIGlzIGlnbm9yZWQgZHVlIHRvIHRoZSBzdGF0aWMgcG9zaXRpb25pbmcuIFRoZSBlbGVtZW50IHdpbGwgbmVlZCB0byBiZSBwb3NpdGlvbmVkIHJlbGF0aXZlLCBzbyB0aGUgc3R5bGUuXCIgKyBwcm9wZXJ0eSArIFwiIHdpbGwgYmUgc2V0IHRvIDAuIEVsZW1lbnQ6IFwiLCBlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuc3R5bGVbcHJvcGVydHldID0gMDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAvL0NoZWNrIHNvIHRoYXQgdGhlcmUgYXJlIG5vIGFjY2lkZW50YWwgc3R5bGVzIHRoYXQgd2lsbCBtYWtlIHRoZSBlbGVtZW50IHN0eWxlZCBkaWZmZXJlbnRseSBub3cgdGhhdCBpcyBpcyByZWxhdGl2ZS5cbiAgICAgICAgICAgICAgICAvL0lmIHRoZXJlIGFyZSBhbnksIHNldCB0aGVtIHRvIDAgKHRoaXMgc2hvdWxkIGJlIG9rYXkgd2l0aCB0aGUgdXNlciBzaW5jZSB0aGUgc3R5bGUgcHJvcGVydGllcyBkaWQgbm90aGluZyBiZWZvcmUgW3NpbmNlIHRoZSBlbGVtZW50IHdhcyBwb3NpdGlvbmVkIHN0YXRpY10gYW55d2F5KS5cbiAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgZWxlbWVudFN0eWxlLCBcInRvcFwiKTtcbiAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgZWxlbWVudFN0eWxlLCBcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgIHJlbW92ZVJlbGF0aXZlU3R5bGVzKHJlcG9ydGVyLCBlbGVtZW50LCBlbGVtZW50U3R5bGUsIFwiYm90dG9tXCIpO1xuICAgICAgICAgICAgICAgIHJlbW92ZVJlbGF0aXZlU3R5bGVzKHJlcG9ydGVyLCBlbGVtZW50LCBlbGVtZW50U3R5bGUsIFwibGVmdFwiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gZ2V0Q29udGFpbmVyQ3NzVGV4dChsZWZ0LCB0b3ApIHtcbiAgICAgICAgICAgICAgICBsZWZ0ID0gKCFsZWZ0ID8gXCIwXCIgOiAobGVmdCArIFwicHhcIikpO1xuICAgICAgICAgICAgICAgIHRvcCA9ICghdG9wID8gXCIwXCIgOiAodG9wICsgXCJweFwiKSk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gXCJwb3NpdGlvbjogYWJzb2x1dGU7IGxlZnQ6IFwiICsgbGVmdCArIFwiOyB0b3A6IFwiICsgdG9wICsgXCI7IHJpZ2h0OiAwOyBib3R0b206IDA7IG92ZXJmbG93OiBzY3JvbGw7IHotaW5kZXg6IC0xOyB2aXNpYmlsaXR5OiBoaWRkZW47XCI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBjb250YWluZXJTdHlsZSAgICAgICAgICA9IGdldENvbnRhaW5lckNzc1RleHQoLTEsIC0xKTtcbiAgICAgICAgICAgIHZhciBzaHJpbmtFeHBhbmRzdHlsZSAgICAgICA9IGdldENvbnRhaW5lckNzc1RleHQoMCwgMCk7XG4gICAgICAgICAgICB2YXIgc2hyaW5rRXhwYW5kQ2hpbGRTdHlsZSAgPSBcInBvc2l0aW9uOiBhYnNvbHV0ZTsgbGVmdDogMDsgdG9wOiAwO1wiO1xuXG4gICAgICAgICAgICB2YXIgY29udGFpbmVyICAgICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgdmFyIGV4cGFuZCAgICAgICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIHZhciBleHBhbmRDaGlsZCAgICAgICAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICB2YXIgc2hyaW5rICAgICAgICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgdmFyIHNocmlua0NoaWxkICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblxuICAgICAgICAgICAgY29udGFpbmVyLnN0eWxlLmNzc1RleHQgICAgID0gY29udGFpbmVyU3R5bGU7XG4gICAgICAgICAgICBleHBhbmQuc3R5bGUuY3NzVGV4dCAgICAgICAgPSBzaHJpbmtFeHBhbmRzdHlsZTtcbiAgICAgICAgICAgIGV4cGFuZENoaWxkLnN0eWxlLmNzc1RleHQgICA9IHNocmlua0V4cGFuZENoaWxkU3R5bGU7XG4gICAgICAgICAgICBzaHJpbmsuc3R5bGUuY3NzVGV4dCAgICAgICAgPSBzaHJpbmtFeHBhbmRzdHlsZTtcbiAgICAgICAgICAgIHNocmlua0NoaWxkLnN0eWxlLmNzc1RleHQgICA9IHNocmlua0V4cGFuZENoaWxkU3R5bGUgKyBcIiB3aWR0aDogMjAwJTsgaGVpZ2h0OiAyMDAlO1wiO1xuXG4gICAgICAgICAgICBleHBhbmQuYXBwZW5kQ2hpbGQoZXhwYW5kQ2hpbGQpO1xuICAgICAgICAgICAgc2hyaW5rLmFwcGVuZENoaWxkKHNocmlua0NoaWxkKTtcbiAgICAgICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChleHBhbmQpO1xuICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHNocmluayk7XG4gICAgICAgICAgICBlbGVtZW50LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG4gICAgICAgICAgICBlbGVtZW50Ll9lcmRFbGVtZW50ID0gY29udGFpbmVyO1xuXG4gICAgICAgICAgICBhZGRFdmVudChleHBhbmQsIFwic2Nyb2xsXCIsIGZ1bmN0aW9uIG9uRmlyc3RFeHBhbmRTY3JvbGwoKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlRXZlbnQoZXhwYW5kLCBcInNjcm9sbFwiLCBvbkZpcnN0RXhwYW5kU2Nyb2xsKTtcbiAgICAgICAgICAgICAgICByZWFkeUV4cGFuZFNjcm9sbCA9IHRydWU7XG4gICAgICAgICAgICAgICAgcmVhZHkoKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBhZGRFdmVudChzaHJpbmssIFwic2Nyb2xsXCIsIGZ1bmN0aW9uIG9uRmlyc3RTaHJpbmtTY3JvbGwoKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlRXZlbnQoc2hyaW5rLCBcInNjcm9sbFwiLCBvbkZpcnN0U2hyaW5rU2Nyb2xsKTtcbiAgICAgICAgICAgICAgICByZWFkeVNocmlua1Njcm9sbCA9IHRydWU7XG4gICAgICAgICAgICAgICAgcmVhZHkoKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB1cGRhdGVDaGlsZFNpemVzKGVsZW1lbnQsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZmluYWxpemVEb21NdXRhdGlvbigpIHtcbiAgICAgICAgICAgIHN0b3JlQ3VycmVudFNpemUoZWxlbWVudCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgICAgICBwb3NpdGlvblNjcm9sbGJhcnMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgICAgICByZWFkeU92ZXJhbGwgPSB0cnVlO1xuICAgICAgICAgICAgcmVhZHkoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGJhdGNoUHJvY2Vzc29yKSB7XG4gICAgICAgICAgICBiYXRjaFByb2Nlc3Nvci5hZGQobXV0YXRlRG9tKTtcbiAgICAgICAgICAgIGJhdGNoUHJvY2Vzc29yLmFkZCgxLCBmaW5hbGl6ZURvbU11dGF0aW9uKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG11dGF0ZURvbSgpO1xuICAgICAgICAgICAgZmluYWxpemVEb21NdXRhdGlvbigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0RXhwYW5kRWxlbWVudChlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50Ll9lcmRFbGVtZW50LmNoaWxkTm9kZXNbMF07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0RXhwYW5kQ2hpbGRFbGVtZW50KGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGdldEV4cGFuZEVsZW1lbnQoZWxlbWVudCkuY2hpbGROb2Rlc1swXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRTaHJpbmtFbGVtZW50KGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuX2VyZEVsZW1lbnQuY2hpbGROb2Rlc1sxXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRFeHBhbmRTaXplKHNpemUpIHtcbiAgICAgICAgcmV0dXJuIHNpemUgKyAxMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRTaHJpbmtTaXplKHNpemUpIHtcbiAgICAgICAgcmV0dXJuIHNpemUgKiAyO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVwZGF0ZUNoaWxkU2l6ZXMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICB2YXIgZXhwYW5kQ2hpbGQgICAgICAgICAgICAgPSBnZXRFeHBhbmRDaGlsZEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgIHZhciBleHBhbmRXaWR0aCAgICAgICAgICAgICA9IGdldEV4cGFuZFNpemUod2lkdGgpO1xuICAgICAgICB2YXIgZXhwYW5kSGVpZ2h0ICAgICAgICAgICAgPSBnZXRFeHBhbmRTaXplKGhlaWdodCk7XG4gICAgICAgIGV4cGFuZENoaWxkLnN0eWxlLndpZHRoICAgICA9IGV4cGFuZFdpZHRoICsgXCJweFwiO1xuICAgICAgICBleHBhbmRDaGlsZC5zdHlsZS5oZWlnaHQgICAgPSBleHBhbmRIZWlnaHQgKyBcInB4XCI7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3RvcmVDdXJyZW50U2l6ZShlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICAgIGVsZW1lbnQubGFzdFdpZHRoICAgPSB3aWR0aDtcbiAgICAgICAgZWxlbWVudC5sYXN0SGVpZ2h0ICA9IGhlaWdodDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwb3NpdGlvblNjcm9sbGJhcnMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICB2YXIgZXhwYW5kICAgICAgICAgID0gZ2V0RXhwYW5kRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgdmFyIHNocmluayAgICAgICAgICA9IGdldFNocmlua0VsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgIHZhciBleHBhbmRXaWR0aCAgICAgPSBnZXRFeHBhbmRTaXplKHdpZHRoKTtcbiAgICAgICAgdmFyIGV4cGFuZEhlaWdodCAgICA9IGdldEV4cGFuZFNpemUoaGVpZ2h0KTtcbiAgICAgICAgdmFyIHNocmlua1dpZHRoICAgICA9IGdldFNocmlua1NpemUod2lkdGgpO1xuICAgICAgICB2YXIgc2hyaW5rSGVpZ2h0ICAgID0gZ2V0U2hyaW5rU2l6ZShoZWlnaHQpO1xuICAgICAgICBleHBhbmQuc2Nyb2xsTGVmdCAgID0gZXhwYW5kV2lkdGg7XG4gICAgICAgIGV4cGFuZC5zY3JvbGxUb3AgICAgPSBleHBhbmRIZWlnaHQ7XG4gICAgICAgIHNocmluay5zY3JvbGxMZWZ0ICAgPSBzaHJpbmtXaWR0aDtcbiAgICAgICAgc2hyaW5rLnNjcm9sbFRvcCAgICA9IHNocmlua0hlaWdodDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBhZGRFdmVudChlbCwgbmFtZSwgY2IpIHtcbiAgICAgICAgaWYgKGVsLmF0dGFjaEV2ZW50KSB7XG4gICAgICAgICAgICBlbC5hdHRhY2hFdmVudChcIm9uXCIgKyBuYW1lLCBjYik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKG5hbWUsIGNiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbW92ZUV2ZW50KGVsLCBuYW1lLCBjYikge1xuICAgICAgICBpZihlbC5hdHRhY2hFdmVudCkge1xuICAgICAgICAgICAgZWwuZGV0YWNoRXZlbnQoXCJvblwiICsgbmFtZSwgY2IpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihuYW1lLCBjYik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBtYWtlRGV0ZWN0YWJsZTogbWFrZURldGVjdGFibGUsXG4gICAgICAgIGFkZExpc3RlbmVyOiBhZGRMaXN0ZW5lclxuICAgIH07XG59O1xuXG5mdW5jdGlvbiBwYXJzZVNpemUoc2l6ZSkge1xuICAgIHJldHVybiBwYXJzZUZsb2F0KHNpemUucmVwbGFjZSgvcHgvLCBcIlwiKSk7XG59XG4iLCIvL0hlYXZpbHkgaW5zcGlyZWQgYnkgaHR0cDovL3d3dy5iYWNrYWxsZXljb2Rlci5jb20vMjAxMy8wMy8xOC9jcm9zcy1icm93c2VyLWV2ZW50LWJhc2VkLWVsZW1lbnQtcmVzaXplLWRldGVjdGlvbi9cblxuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBmb3JFYWNoICAgICAgICAgICAgICAgICA9IHJlcXVpcmUoXCIuL2NvbGxlY3Rpb24tdXRpbHNcIikuZm9yRWFjaDtcbnZhciBlbGVtZW50VXRpbHNNYWtlciAgICAgICA9IHJlcXVpcmUoXCIuL2VsZW1lbnQtdXRpbHNcIik7XG52YXIgbGlzdGVuZXJIYW5kbGVyTWFrZXIgICAgPSByZXF1aXJlKFwiLi9saXN0ZW5lci1oYW5kbGVyXCIpO1xudmFyIGlkR2VuZXJhdG9yTWFrZXIgICAgICAgID0gcmVxdWlyZShcIi4vaWQtZ2VuZXJhdG9yXCIpO1xudmFyIGlkSGFuZGxlck1ha2VyICAgICAgICAgID0gcmVxdWlyZShcIi4vaWQtaGFuZGxlclwiKTtcbnZhciByZXBvcnRlck1ha2VyICAgICAgICAgICA9IHJlcXVpcmUoXCIuL3JlcG9ydGVyXCIpO1xudmFyIGJhdGNoUHJvY2Vzc29yTWFrZXIgICAgICAgPSByZXF1aXJlKFwiYmF0Y2gtcHJvY2Vzc29yXCIpO1xuXG4vL0RldGVjdGlvbiBzdHJhdGVnaWVzLlxudmFyIG9iamVjdFN0cmF0ZWd5TWFrZXIgICAgID0gcmVxdWlyZShcIi4vZGV0ZWN0aW9uLXN0cmF0ZWd5L29iamVjdC5qc1wiKTtcbnZhciBzY3JvbGxTdHJhdGVneU1ha2VyICAgICA9IHJlcXVpcmUoXCIuL2RldGVjdGlvbi1zdHJhdGVneS9zY3JvbGwuanNcIik7XG5cbi8qKlxuICogQHR5cGVkZWYgaWRIYW5kbGVyXG4gKiBAdHlwZSB7b2JqZWN0fVxuICogQHByb3BlcnR5IHtmdW5jdGlvbn0gZ2V0IEdldHMgdGhlIHJlc2l6ZSBkZXRlY3RvciBpZCBvZiB0aGUgZWxlbWVudC5cbiAqIEBwcm9wZXJ0eSB7ZnVuY3Rpb259IHNldCBHZW5lcmF0ZSBhbmQgc2V0cyB0aGUgcmVzaXplIGRldGVjdG9yIGlkIG9mIHRoZSBlbGVtZW50LlxuICovXG5cbi8qKlxuICogQHR5cGVkZWYgT3B0aW9uc1xuICogQHR5cGUge29iamVjdH1cbiAqIEBwcm9wZXJ0eSB7Ym9vbGVhbn0gY2FsbE9uQWRkICAgIERldGVybWluZXMgaWYgbGlzdGVuZXJzIHNob3VsZCBiZSBjYWxsZWQgd2hlbiB0aGV5IGFyZSBnZXR0aW5nIGFkZGVkLiBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIERlZmF1bHQgaXMgdHJ1ZS4gSWYgdHJ1ZSwgdGhlIGxpc3RlbmVyIGlzIGd1YXJhbnRlZWQgdG8gYmUgY2FsbGVkIHdoZW4gaXQgaGFzIGJlZW4gYWRkZWQuIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSWYgZmFsc2UsIHRoZSBsaXN0ZW5lciB3aWxsIG5vdCBiZSBndWFyZW50ZWVkIHRvIGJlIGNhbGxlZCB3aGVuIGl0IGhhcyBiZWVuIGFkZGVkIChkb2VzIG5vdCBwcmV2ZW50IGl0IGZyb20gYmVpbmcgY2FsbGVkKS5cbiAqIEBwcm9wZXJ0eSB7aWRIYW5kbGVyfSBpZEhhbmRsZXIgIEEgY3VzdG9tIGlkIGhhbmRsZXIgdGhhdCBpcyByZXNwb25zaWJsZSBmb3IgZ2VuZXJhdGluZywgc2V0dGluZyBhbmQgcmV0cmlldmluZyBpZCdzIGZvciBlbGVtZW50cy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIElmIG5vdCBwcm92aWRlZCwgYSBkZWZhdWx0IGlkIGhhbmRsZXIgd2lsbCBiZSB1c2VkLlxuICogQHByb3BlcnR5IHtyZXBvcnRlcn0gcmVwb3J0ZXIgICAgQSBjdXN0b20gcmVwb3J0ZXIgdGhhdCBoYW5kbGVzIHJlcG9ydGluZyBsb2dzLCB3YXJuaW5ncyBhbmQgZXJyb3JzLiBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIElmIG5vdCBwcm92aWRlZCwgYSBkZWZhdWx0IGlkIGhhbmRsZXIgd2lsbCBiZSB1c2VkLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSWYgc2V0IHRvIGZhbHNlLCB0aGVuIG5vdGhpbmcgd2lsbCBiZSByZXBvcnRlZC5cbiAqL1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gZWxlbWVudCByZXNpemUgZGV0ZWN0b3IgaW5zdGFuY2UuXG4gKiBAcHVibGljXG4gKiBAcGFyYW0ge09wdGlvbnM/fSBvcHRpb25zIE9wdGlvbmFsIGdsb2JhbCBvcHRpb25zIG9iamVjdCB0aGF0IHdpbGwgZGVjaWRlIGhvdyB0aGlzIGluc3RhbmNlIHdpbGwgd29yay5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICAvL2lkSGFuZGxlciBpcyBjdXJyZW50bHkgbm90IGFuIG9wdGlvbiB0byB0aGUgbGlzdGVuVG8gZnVuY3Rpb24sIHNvIGl0IHNob3VsZCBub3QgYmUgYWRkZWQgdG8gZ2xvYmFsT3B0aW9ucy5cbiAgICB2YXIgaWRIYW5kbGVyID0gb3B0aW9ucy5pZEhhbmRsZXI7XG5cbiAgICBpZighaWRIYW5kbGVyKSB7XG4gICAgICAgIHZhciBpZEdlbmVyYXRvciA9IGlkR2VuZXJhdG9yTWFrZXIoKTtcbiAgICAgICAgdmFyIGRlZmF1bHRJZEhhbmRsZXIgPSBpZEhhbmRsZXJNYWtlcihpZEdlbmVyYXRvcik7XG4gICAgICAgIGlkSGFuZGxlciA9IGRlZmF1bHRJZEhhbmRsZXI7XG4gICAgfVxuXG4gICAgLy9yZXBvcnRlciBpcyBjdXJyZW50bHkgbm90IGFuIG9wdGlvbiB0byB0aGUgbGlzdGVuVG8gZnVuY3Rpb24sIHNvIGl0IHNob3VsZCBub3QgYmUgYWRkZWQgdG8gZ2xvYmFsT3B0aW9ucy5cbiAgICB2YXIgcmVwb3J0ZXIgPSBvcHRpb25zLnJlcG9ydGVyO1xuXG4gICAgaWYoIXJlcG9ydGVyKSB7XG4gICAgICAgIC8vSWYgb3B0aW9ucy5yZXBvcnRlciBpcyBmYWxzZSwgdGhlbiB0aGUgcmVwb3J0ZXIgc2hvdWxkIGJlIHF1aWV0LlxuICAgICAgICB2YXIgcXVpZXQgPSByZXBvcnRlciA9PT0gZmFsc2U7XG4gICAgICAgIHJlcG9ydGVyID0gcmVwb3J0ZXJNYWtlcihxdWlldCk7XG4gICAgfVxuXG4gICAgLy9iYXRjaFByb2Nlc3NvciBpcyBjdXJyZW50bHkgbm90IGFuIG9wdGlvbiB0byB0aGUgbGlzdGVuVG8gZnVuY3Rpb24sIHNvIGl0IHNob3VsZCBub3QgYmUgYWRkZWQgdG8gZ2xvYmFsT3B0aW9ucy5cbiAgICB2YXIgYmF0Y2hQcm9jZXNzb3IgPSBnZXRPcHRpb24ob3B0aW9ucywgXCJiYXRjaFByb2Nlc3NvclwiLCBiYXRjaFByb2Nlc3Nvck1ha2VyKHsgcmVwb3J0ZXI6IHJlcG9ydGVyIH0pKTtcblxuICAgIC8vT3B0aW9ucyB0byBiZSB1c2VkIGFzIGRlZmF1bHQgZm9yIHRoZSBsaXN0ZW5UbyBmdW5jdGlvbi5cbiAgICB2YXIgZ2xvYmFsT3B0aW9ucyA9IHt9O1xuICAgIGdsb2JhbE9wdGlvbnMuY2FsbE9uQWRkICAgICA9ICEhZ2V0T3B0aW9uKG9wdGlvbnMsIFwiY2FsbE9uQWRkXCIsIHRydWUpO1xuXG4gICAgdmFyIGV2ZW50TGlzdGVuZXJIYW5kbGVyICAgID0gbGlzdGVuZXJIYW5kbGVyTWFrZXIoaWRIYW5kbGVyKTtcbiAgICB2YXIgZWxlbWVudFV0aWxzICAgICAgICAgICAgPSBlbGVtZW50VXRpbHNNYWtlcigpO1xuXG4gICAgLy9UaGUgZGV0ZWN0aW9uIHN0cmF0ZWd5IHRvIGJlIHVzZWQuXG4gICAgdmFyIGRldGVjdGlvblN0cmF0ZWd5O1xuICAgIHZhciBkZXNpcmVkU3RyYXRlZ3kgPSBnZXRPcHRpb24ob3B0aW9ucywgXCJzdHJhdGVneVwiLCBcIm9iamVjdFwiKTtcbiAgICB2YXIgc3RyYXRlZ3lPcHRpb25zID0ge1xuICAgICAgICByZXBvcnRlcjogcmVwb3J0ZXIsXG4gICAgICAgIGJhdGNoUHJvY2Vzc29yOiBiYXRjaFByb2Nlc3NvclxuICAgIH07XG5cbiAgICBpZihkZXNpcmVkU3RyYXRlZ3kgPT09IFwic2Nyb2xsXCIpIHtcbiAgICAgICAgZGV0ZWN0aW9uU3RyYXRlZ3kgPSBzY3JvbGxTdHJhdGVneU1ha2VyKHN0cmF0ZWd5T3B0aW9ucyk7XG4gICAgfSBlbHNlIGlmKGRlc2lyZWRTdHJhdGVneSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICBkZXRlY3Rpb25TdHJhdGVneSA9IG9iamVjdFN0cmF0ZWd5TWFrZXIoc3RyYXRlZ3lPcHRpb25zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHN0cmF0ZWd5IG5hbWU6IFwiICsgZGVzaXJlZFN0cmF0ZWd5KTtcbiAgICB9XG5cbiAgICAvL0NhbGxzIGNhbiBiZSBtYWRlIHRvIGxpc3RlblRvIHdpdGggZWxlbWVudHMgdGhhdCBhcmUgc3RpbGwgYXJlIGJlaW5nIGluc3RhbGxlZC5cbiAgICAvL0Fsc28sIHNhbWUgZWxlbWVudHMgY2FuIG9jY3VyIGluIHRoZSBlbGVtZW50cyBsaXN0IGluIHRoZSBsaXN0ZW5UbyBmdW5jdGlvbi5cbiAgICAvL1dpdGggdGhpcyBtYXAsIHRoZSByZWFkeSBjYWxsYmFja3MgY2FuIGJlIHN5bmNocm9uaXplZCBiZXR3ZWVuIHRoZSBjYWxsc1xuICAgIC8vc28gdGhhdCB0aGUgcmVhZHkgY2FsbGJhY2sgY2FuIGFsd2F5cyBiZSBjYWxsZWQgd2hlbiBhbiBlbGVtZW50IGlzIHJlYWR5IC0gZXZlbiBpZlxuICAgIC8vaXQgd2Fzbid0IGluc3RhbGxlZCBmcm9tIHRoZSBmdW5jdGlvbiBpbnRzZWxmLlxuICAgIHZhciBvblJlYWR5Q2FsbGJhY2tzID0ge307XG5cbiAgICAvKipcbiAgICAgKiBNYWtlcyB0aGUgZ2l2ZW4gZWxlbWVudHMgcmVzaXplLWRldGVjdGFibGUgYW5kIHN0YXJ0cyBsaXN0ZW5pbmcgdG8gcmVzaXplIGV2ZW50cyBvbiB0aGUgZWxlbWVudHMuIENhbGxzIHRoZSBldmVudCBjYWxsYmFjayBmb3IgZWFjaCBldmVudCBmb3IgZWFjaCBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge09wdGlvbnM/fSBvcHRpb25zIE9wdGlvbmFsIG9wdGlvbnMgb2JqZWN0LiBUaGVzZSBvcHRpb25zIHdpbGwgb3ZlcnJpZGUgdGhlIGdsb2JhbCBvcHRpb25zLiBTb21lIG9wdGlvbnMgbWF5IG5vdCBiZSBvdmVycmlkZW4sIHN1Y2ggYXMgaWRIYW5kbGVyLlxuICAgICAqIEBwYXJhbSB7ZWxlbWVudFtdfGVsZW1lbnR9IGVsZW1lbnRzIFRoZSBnaXZlbiBhcnJheSBvZiBlbGVtZW50cyB0byBkZXRlY3QgcmVzaXplIGV2ZW50cyBvZi4gU2luZ2xlIGVsZW1lbnQgaXMgYWxzbyB2YWxpZC5cbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBsaXN0ZW5lciBUaGUgY2FsbGJhY2sgdG8gYmUgZXhlY3V0ZWQgZm9yIGVhY2ggcmVzaXplIGV2ZW50IGZvciBlYWNoIGVsZW1lbnQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbGlzdGVuVG8ob3B0aW9ucywgZWxlbWVudHMsIGxpc3RlbmVyKSB7XG4gICAgICAgIGZ1bmN0aW9uIG9uUmVzaXplQ2FsbGJhY2soZWxlbWVudCkge1xuICAgICAgICAgICAgdmFyIGxpc3RlbmVycyA9IGV2ZW50TGlzdGVuZXJIYW5kbGVyLmdldChlbGVtZW50KTtcblxuICAgICAgICAgICAgZm9yRWFjaChsaXN0ZW5lcnMsIGZ1bmN0aW9uIGNhbGxMaXN0ZW5lclByb3h5KGxpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIoZWxlbWVudCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGFkZExpc3RlbmVyKGNhbGxPbkFkZCwgZWxlbWVudCwgbGlzdGVuZXIpIHtcbiAgICAgICAgICAgIGV2ZW50TGlzdGVuZXJIYW5kbGVyLmFkZChlbGVtZW50LCBsaXN0ZW5lcik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmKGNhbGxPbkFkZCkge1xuICAgICAgICAgICAgICAgIGxpc3RlbmVyKGVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy9PcHRpb25zIG9iamVjdCBtYXkgYmUgb21pdHRlZC5cbiAgICAgICAgaWYoIWxpc3RlbmVyKSB7XG4gICAgICAgICAgICBsaXN0ZW5lciA9IGVsZW1lbnRzO1xuICAgICAgICAgICAgZWxlbWVudHMgPSBvcHRpb25zO1xuICAgICAgICAgICAgb3B0aW9ucyA9IHt9O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIWVsZW1lbnRzKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBdCBsZWFzdCBvbmUgZWxlbWVudCByZXF1aXJlZC5cIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZighbGlzdGVuZXIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkxpc3RlbmVyIHJlcXVpcmVkLlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGVsZW1lbnRzLmxlbmd0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBlbGVtZW50cyA9IFtlbGVtZW50c107XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZWxlbWVudHNSZWFkeSA9IDA7XG5cbiAgICAgICAgdmFyIGNhbGxPbkFkZCA9IGdldE9wdGlvbihvcHRpb25zLCBcImNhbGxPbkFkZFwiLCBnbG9iYWxPcHRpb25zLmNhbGxPbkFkZCk7XG4gICAgICAgIHZhciBvblJlYWR5Q2FsbGJhY2sgPSBnZXRPcHRpb24ob3B0aW9ucywgXCJvblJlYWR5XCIsIGZ1bmN0aW9uIG5vb3AoKSB7fSk7XG5cbiAgICAgICAgZm9yRWFjaChlbGVtZW50cywgZnVuY3Rpb24gYXR0YWNoTGlzdGVuZXJUb0VsZW1lbnQoZWxlbWVudCkge1xuICAgICAgICAgICAgdmFyIGlkID0gaWRIYW5kbGVyLmdldChlbGVtZW50KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYoIWVsZW1lbnRVdGlscy5pc0RldGVjdGFibGUoZWxlbWVudCkpIHtcbiAgICAgICAgICAgICAgICBpZihlbGVtZW50VXRpbHMuaXNCdXN5KGVsZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vVGhlIGVsZW1lbnQgaXMgYmVpbmcgcHJlcGFyZWQgdG8gYmUgZGV0ZWN0YWJsZS4gRG8gbm90IG1ha2UgaXQgZGV0ZWN0YWJsZS5cbiAgICAgICAgICAgICAgICAgICAgLy9KdXN0IGFkZCB0aGUgbGlzdGVuZXIsIGJlY2F1c2UgdGhlIGVsZW1lbnQgd2lsbCBzb29uIGJlIGRldGVjdGFibGUuXG4gICAgICAgICAgICAgICAgICAgIGFkZExpc3RlbmVyKGNhbGxPbkFkZCwgZWxlbWVudCwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgICAgICBvblJlYWR5Q2FsbGJhY2tzW2lkXSA9IG9uUmVhZHlDYWxsYmFja3NbaWRdIHx8IFtdO1xuICAgICAgICAgICAgICAgICAgICBvblJlYWR5Q2FsbGJhY2tzW2lkXS5wdXNoKGZ1bmN0aW9uIG9uUmVhZHkoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50c1JlYWR5Kys7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKGVsZW1lbnRzUmVhZHkgPT09IGVsZW1lbnRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9uUmVhZHlDYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vVGhlIGVsZW1lbnQgaXMgbm90IHByZXBhcmVkIHRvIGJlIGRldGVjdGFibGUsIHNvIGRvIHByZXBhcmUgaXQgYW5kIGFkZCBhIGxpc3RlbmVyIHRvIGl0LlxuICAgICAgICAgICAgICAgIGVsZW1lbnRVdGlscy5tYXJrQnVzeShlbGVtZW50LCB0cnVlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZGV0ZWN0aW9uU3RyYXRlZ3kubWFrZURldGVjdGFibGUoZWxlbWVudCwgZnVuY3Rpb24gb25FbGVtZW50RGV0ZWN0YWJsZShlbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRVdGlscy5tYXJrQXNEZXRlY3RhYmxlKGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50VXRpbHMubWFya0J1c3koZWxlbWVudCwgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICBkZXRlY3Rpb25TdHJhdGVneS5hZGRMaXN0ZW5lcihlbGVtZW50LCBvblJlc2l6ZUNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkTGlzdGVuZXIoY2FsbE9uQWRkLCBlbGVtZW50LCBsaXN0ZW5lcik7XG5cbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudHNSZWFkeSsrO1xuICAgICAgICAgICAgICAgICAgICBpZihlbGVtZW50c1JlYWR5ID09PSBlbGVtZW50cy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9uUmVhZHlDYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYob25SZWFkeUNhbGxiYWNrc1tpZF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvckVhY2gob25SZWFkeUNhbGxiYWNrc1tpZF0sIGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIG9uUmVhZHlDYWxsYmFja3NbaWRdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vVGhlIGVsZW1lbnQgaGFzIGJlZW4gcHJlcGFyZWQgdG8gYmUgZGV0ZWN0YWJsZSBhbmQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgdG8uXG4gICAgICAgICAgICBhZGRMaXN0ZW5lcihjYWxsT25BZGQsIGVsZW1lbnQsIGxpc3RlbmVyKTtcbiAgICAgICAgICAgIGVsZW1lbnRzUmVhZHkrKztcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYoZWxlbWVudHNSZWFkeSA9PT0gZWxlbWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICBvblJlYWR5Q2FsbGJhY2soKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGxpc3RlblRvOiBsaXN0ZW5Ub1xuICAgIH07XG59O1xuXG5mdW5jdGlvbiBnZXRPcHRpb24ob3B0aW9ucywgbmFtZSwgZGVmYXVsdFZhbHVlKSB7XG4gICAgdmFyIHZhbHVlID0gb3B0aW9uc1tuYW1lXTtcblxuICAgIGlmKCh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSAmJiBkZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICAgIH1cblxuICAgIHJldHVybiB2YWx1ZTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgIC8qKlxuICAgICAqIFRlbGxzIGlmIHRoZSBlbGVtZW50IGhhcyBiZWVuIG1hZGUgZGV0ZWN0YWJsZSBhbmQgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBldmVudHMuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gVGhlIGVsZW1lbnQgdG8gY2hlY2suXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgb3IgZmFsc2UgZGVwZW5kaW5nIG9uIGlmIHRoZSBlbGVtZW50IGlzIGRldGVjdGFibGUgb3Igbm90LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzRGV0ZWN0YWJsZShlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiAhIWVsZW1lbnQuX2VyZElzRGV0ZWN0YWJsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNYXJrcyB0aGUgZWxlbWVudCB0aGF0IGl0IGhhcyBiZWVuIG1hZGUgZGV0ZWN0YWJsZSBhbmQgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBldmVudHMuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gVGhlIGVsZW1lbnQgdG8gbWFyay5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBtYXJrQXNEZXRlY3RhYmxlKGVsZW1lbnQpIHtcbiAgICAgICAgZWxlbWVudC5fZXJkSXNEZXRlY3RhYmxlID0gdHJ1ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUZWxscyBpZiB0aGUgZWxlbWVudCBpcyBidXN5IG9yIG5vdC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBUaGUgZWxlbWVudCB0byBjaGVjay5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBvciBmYWxzZSBkZXBlbmRpbmcgb24gaWYgdGhlIGVsZW1lbnQgaXMgYnVzeSBvciBub3QuXG4gICAgICovXG4gICAgZnVuY3Rpb24gaXNCdXN5KGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuICEhZWxlbWVudC5fZXJkQnVzeTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNYXJrcyB0aGUgb2JqZWN0IGlzIGJ1c3kgYW5kIHNob3VsZCBub3QgYmUgbWFkZSBkZXRlY3RhYmxlLlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdG8gbWFyay5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGJ1c3kgSWYgdGhlIGVsZW1lbnQgaXMgYnVzeSBvciBub3QuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbWFya0J1c3koZWxlbWVudCwgYnVzeSkge1xuICAgICAgICBlbGVtZW50Ll9lcmRCdXN5ID0gISFidXN5O1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGlzRGV0ZWN0YWJsZTogaXNEZXRlY3RhYmxlLFxuICAgICAgICBtYXJrQXNEZXRlY3RhYmxlOiBtYXJrQXNEZXRlY3RhYmxlLFxuICAgICAgICBpc0J1c3k6IGlzQnVzeSxcbiAgICAgICAgbWFya0J1c3k6IG1hcmtCdXN5XG4gICAgfTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgaWRDb3VudCA9IDE7XG5cbiAgICAvKipcbiAgICAgKiBHZW5lcmF0ZXMgYSBuZXcgdW5pcXVlIGlkIGluIHRoZSBjb250ZXh0LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSBBIHVuaXF1ZSBpZCBpbiB0aGUgY29udGV4dC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZW5lcmF0ZSgpIHtcbiAgICAgICAgcmV0dXJuIGlkQ291bnQrKztcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBnZW5lcmF0ZTogZ2VuZXJhdGVcbiAgICB9O1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGlkR2VuZXJhdG9yKSB7XG4gICAgdmFyIElEX1BST1BfTkFNRSA9IFwiX2VyZFRhcmdldElkXCI7XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSByZXNpemUgZGV0ZWN0b3IgaWQgb2YgdGhlIGVsZW1lbnQuIElmIHRoZSBlbGVtZW50IGRvZXMgbm90IGhhdmUgYW4gaWQsIG9uZSB3aWxsIGJlIGFzc2lnbmVkIHRvIHRoZSBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIHRhcmdldCBlbGVtZW50IHRvIGdldCB0aGUgaWQgb2YuXG4gICAgICogQHBhcmFtIHtib29sZWFuP30gcmVhZG9ubHkgQW4gaWQgd2lsbCBub3QgYmUgYXNzaWduZWQgdG8gdGhlIGVsZW1lbnQgaWYgdGhlIHJlYWRvbmx5IHBhcmFtZXRlciBpcyB0cnVlLiBEZWZhdWx0IGlzIGZhbHNlLlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd8bnVtYmVyfSBUaGUgaWQgb2YgdGhlIGVsZW1lbnQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0SWQoZWxlbWVudCwgcmVhZG9ubHkpIHtcbiAgICAgICAgaWYoIXJlYWRvbmx5ICYmICFoYXNJZChlbGVtZW50KSkge1xuICAgICAgICAgICAgc2V0SWQoZWxlbWVudCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWxlbWVudFtJRF9QUk9QX05BTUVdO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNldElkKGVsZW1lbnQpIHtcbiAgICAgICAgdmFyIGlkID0gaWRHZW5lcmF0b3IuZ2VuZXJhdGUoKTtcblxuICAgICAgICBlbGVtZW50W0lEX1BST1BfTkFNRV0gPSBpZDtcblxuICAgICAgICByZXR1cm4gaWQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaGFzSWQoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZWxlbWVudFtJRF9QUk9QX05BTUVdICE9PSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ2V0OiBnZXRJZFxuICAgIH07XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oaWRIYW5kbGVyKSB7XG4gICAgdmFyIGV2ZW50TGlzdGVuZXJzID0ge307XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIGFsbCBsaXN0ZW5lcnMgZm9yIHRoZSBnaXZlbiBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdG8gZ2V0IGFsbCBsaXN0ZW5lcnMgZm9yLlxuICAgICAqIEByZXR1cm5zIEFsbCBsaXN0ZW5lcnMgZm9yIHRoZSBnaXZlbiBlbGVtZW50LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldExpc3RlbmVycyhlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBldmVudExpc3RlbmVyc1tpZEhhbmRsZXIuZ2V0KGVsZW1lbnQpXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdG9yZXMgdGhlIGdpdmVuIGxpc3RlbmVyIGZvciB0aGUgZ2l2ZW4gZWxlbWVudC4gV2lsbCBub3QgYWN0dWFsbHkgYWRkIHRoZSBsaXN0ZW5lciB0byB0aGUgZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRoYXQgc2hvdWxkIGhhdmUgdGhlIGxpc3RlbmVyIGFkZGVkLlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGxpc3RlbmVyIFRoZSBjYWxsYmFjayB0aGF0IHRoZSBlbGVtZW50IGhhcyBhZGRlZC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhZGRMaXN0ZW5lcihlbGVtZW50LCBsaXN0ZW5lcikge1xuICAgICAgICB2YXIgaWQgPSBpZEhhbmRsZXIuZ2V0KGVsZW1lbnQpO1xuXG4gICAgICAgIGlmKCFldmVudExpc3RlbmVyc1tpZF0pIHtcbiAgICAgICAgICAgIGV2ZW50TGlzdGVuZXJzW2lkXSA9IFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgZXZlbnRMaXN0ZW5lcnNbaWRdLnB1c2gobGlzdGVuZXIpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGdldDogZ2V0TGlzdGVuZXJzLFxuICAgICAgICBhZGQ6IGFkZExpc3RlbmVyXG4gICAgfTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuLyogZ2xvYmFsIGNvbnNvbGU6IGZhbHNlICovXG5cbi8qKlxuICogUmVwb3J0ZXIgdGhhdCBoYW5kbGVzIHRoZSByZXBvcnRpbmcgb2YgbG9ncywgd2FybmluZ3MgYW5kIGVycm9ycy5cbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gcXVpZXQgVGVsbHMgaWYgdGhlIHJlcG9ydGVyIHNob3VsZCBiZSBxdWlldCBvciBub3QuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocXVpZXQpIHtcbiAgICBmdW5jdGlvbiBub29wKCkge1xuICAgICAgICAvL0RvZXMgbm90aGluZy5cbiAgICB9XG5cbiAgICB2YXIgcmVwb3J0ZXIgPSB7XG4gICAgICAgIGxvZzogbm9vcCxcbiAgICAgICAgd2Fybjogbm9vcCxcbiAgICAgICAgZXJyb3I6IG5vb3BcbiAgICB9O1xuXG4gICAgaWYoIXF1aWV0ICYmIHdpbmRvdy5jb25zb2xlKSB7XG4gICAgICAgIHZhciBhdHRhY2hGdW5jdGlvbiA9IGZ1bmN0aW9uKHJlcG9ydGVyLCBuYW1lKSB7XG4gICAgICAgICAgICAvL1RoZSBwcm94eSBpcyBuZWVkZWQgdG8gYmUgYWJsZSB0byBjYWxsIHRoZSBtZXRob2Qgd2l0aCB0aGUgY29uc29sZSBjb250ZXh0LFxuICAgICAgICAgICAgLy9zaW5jZSB3ZSBjYW5ub3QgdXNlIGJpbmQuXG4gICAgICAgICAgICByZXBvcnRlcltuYW1lXSA9IGZ1bmN0aW9uIHJlcG9ydGVyUHJveHkoKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZVtuYW1lXS5hcHBseShjb25zb2xlLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfTtcblxuICAgICAgICBhdHRhY2hGdW5jdGlvbihyZXBvcnRlciwgXCJsb2dcIik7XG4gICAgICAgIGF0dGFjaEZ1bmN0aW9uKHJlcG9ydGVyLCBcIndhcm5cIik7XG4gICAgICAgIGF0dGFjaEZ1bmN0aW9uKHJlcG9ydGVyLCBcImVycm9yXCIpO1xuICAgIH1cblxuICAgIHJldHVybiByZXBvcnRlcjtcbn07Il19
