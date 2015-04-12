(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.elementResizeDetectorMaker = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var utils = require("./utils");

module.exports = function batchUpdaterMaker(options) {
    options = options || {};

    var reporter    = options.reporter;
    var async       = utils.getOption(options, "async", true);
    var autoUpdate  = utils.getOption(options, "auto", true);

    if(autoUpdate && !async) {
        reporter.warn("Invalid options combination. auto=true and async=false is invalid. Setting async=true.");
        async = true;
    }

    if(!reporter) {
        throw new Error("Reporter required.");
    }

    var batchSize = 0;
    var batch = {};
    var handler;
    var onProcessedCallback = function() {};

    function queueUpdate(element, updater) {
        if(autoUpdate && async && batchSize === 0) {
            updateBatchAsync();
        }

        if(!batch[element]) {
            batch[element] = [];
        }

        batch[element].push(updater);
        batchSize++;
    }

    function forceUpdateBatch(updateAsync) {
        if(updateAsync === undefined) {
            updateAsync = async;
        }

        if(handler) {
            cancelFrame(handler);
            handler = null;
        }

        if(async) {
            updateBatchAsync();
        } else {
            updateBatch();
        }
    }

    function updateBatch() {
        for(var element in batch) {
            if(batch.hasOwnProperty(element)) {
                var updaters = batch[element];

                for(var i = 0; i < updaters.length; i++) {
                    var updater = updaters[i];
                    updater();
                }
            }
        }
        clearBatch();
        onProcessedCallback();
    }

    function updateBatchAsync() {
        handler = requestFrame(function performUpdate() {
            updateBatch();
        });
    }

    function clearBatch() {
        batchSize = 0;
        batch = {};
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

    function onProcessed(callback) {
        onProcessedCallback = callback || function() {};
    }

    return {
        update: queueUpdate,
        force: forceUpdateBatch,
        onProcessed: onProcessed
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
        function injectObject(id, element, callback) {
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
                object._erdObjectId = id;

                //Safari: This must occur before adding the object to the DOM.
                //IE: Does not like that this happens before, even if it is also added after.
                if(!browserDetector.isIE()) {
                    object.data = "about:blank";
                }

                element.appendChild(object);

                //IE: This must occur after adding the object to the DOM.
                if(browserDetector.isIE()) {
                    object.data = "about:blank";
                }
            }

            if(batchUpdater) {
                batchUpdater.update(id, mutateDom);
            } else {
                mutateDom();
            }
        }

        //Obtain the id of the element (will be generated if not present), so that event listeners can be identified to this element.
        var id = idHandler.get(element);

        if(browserDetector.isIE(8)) {
            //IE 8 does not support objects properly. Luckily they do support the resize event.
            //So do not inject the object and notify that the element is already ready to be listened to.
            //The event handler for the resize event is attached in the utils.addListener instead.
            callback(element);
        } else {
            injectObject(id, element, callback);
        }
    }

    /**
     * Returns the child object of the target element.
     * @private
     * @param {element} element The target element.
     * @returns The object element of the target.
     */
    function getObject(element) {
        return forEach(element.children, function isObject(child) {
            if(child._erdObjectId !== undefined && child._erdObjectId !== null) {
                return child;
            }
        });
    }

    return {
        makeDetectable: makeDetectable,
        addListener: addListener
    };
};

},{"../browser-detector":3,"../collection-utils":4}],6:[function(require,module,exports){
/**
 * Resize detection strategy that injects divs to elements in order to detect resize events on scroll events.
 * Heavily inspired by: https://github.com/marcj/css-element-queries/blob/master/src/ResizeSensor.js
 */

"use strict";

var batchUpdaterMaker = require("batch-updater");

module.exports = function(options) {
    options             = options || {};
    var idHandler       = options.idHandler;
    var reporter        = options.reporter;
    var batchUpdater    = options.batchUpdater;

    //TODO: This is ugly. The batch updator should support leveled batches or something similar.
    var testBatchUpdater = batchUpdaterMaker({
        reporter: reporter
    });
    var testBatchUpdater2 = batchUpdaterMaker({
        reporter: reporter
    });

    //TODO: This should probably be DI, or atleast the maker function so that other frameworks can share the batch-updater code. It might not make sense to share a batch updater, since batches can interfere with each other.
    var scrollbarsBatchUpdater = batchUpdaterMaker({
        reporter: reporter
    });

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
        var changed = function() {
            var elementStyle    = getComputedStyle(element);
            var width           = parseSize(elementStyle.width);
            var height          = parseSize(elementStyle.height);
            var id              = idHandler.get(element);

            testBatchUpdater.update(id, function updateDetectorElements() {
                updateChildSizes(element, width, height);
                storeCurrentSize(element, width, height);
                testBatchUpdater2.update(id, function updateScrollbars() {
                    positionScrollbars(element, width, height);
                    listener(element);
                });
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
        var elementStyle = getComputedStyle(element);
        var width = parseSize(elementStyle.width);
        var height = parseSize(elementStyle.height);

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

            var readyExpandScroll = false;
            var readyShrinkScroll = false;
            var readyOverall = false;

            function ready() {
                if(readyExpandScroll && readyShrinkScroll && readyOverall) {
                    callback(element);
                }
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

            scrollbarsBatchUpdater.update(id, function finalize() {
                storeCurrentSize(element, width, height);
                positionScrollbars(element, width, height);
                readyOverall = true;
                ready();
            });
        }

        var id = idHandler.get(element);

        if(batchUpdater) {
            batchUpdater.update(id, mutateDom);
        } else {
            mutateDom();
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

},{"batch-updater":1}],7:[function(require,module,exports){
//Heavily inspired by http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/

"use strict";

var forEach                 = require("./collection-utils").forEach;
var elementUtilsMaker       = require("./element-utils");
var listenerHandlerMaker    = require("./listener-handler");
var idGeneratorMaker        = require("./id-generator");
var idHandlerMaker          = require("./id-handler");
var reporterMaker           = require("./reporter");
var batchUpdaterMaker       = require("batch-updater");

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

    //batchUpdater is currently not an option to the listenTo function, so it should not be added to globalOptions.
    var batchUpdater = getOption(options, "batchUpdater", batchUpdaterMaker({ reporter: reporter }));

    //Options to be used as default for the listenTo function.
    var globalOptions = {};
    globalOptions.callOnAdd     = !!getOption(options, "callOnAdd", true);

    var eventListenerHandler    = listenerHandlerMaker(idHandler);
    var elementUtils            = elementUtilsMaker();

    //The detection strategy to be used.
    var detectionStrategy;
    var desiredStrategy = getOption(options, "strategy", "object");
    var strategyOptions = {
        idHandler: idHandler,
        reporter: reporter,
        batchUpdater: batchUpdater
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
            if(!elementUtils.isDetectable(element)) {
                if(elementUtils.isBusy(element)) {
                    //The element is being prepared to be detectable. Do not make it detectable.
                    //Just add the listener, because the element will soon be detectable.
                    addListener(callOnAdd, element, listener);
                    var id = idHandler.get(element);
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

                    var id = idHandler.get(element);
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

},{"./collection-utils":4,"./detection-strategy/object.js":5,"./detection-strategy/scroll.js":6,"./element-utils":8,"./id-generator":9,"./id-handler":10,"./listener-handler":11,"./reporter":12,"batch-updater":1}],8:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYmF0Y2gtdXBkYXRlci9zcmMvYmF0Y2gtdXBkYXRlci5qcyIsIm5vZGVfbW9kdWxlcy9iYXRjaC11cGRhdGVyL3NyYy91dGlscy5qcyIsInNyYy9icm93c2VyLWRldGVjdG9yLmpzIiwic3JjL2NvbGxlY3Rpb24tdXRpbHMuanMiLCJzcmMvZGV0ZWN0aW9uLXN0cmF0ZWd5L29iamVjdC5qcyIsInNyYy9kZXRlY3Rpb24tc3RyYXRlZ3kvc2Nyb2xsLmpzIiwic3JjL2VsZW1lbnQtcmVzaXplLWRldGVjdG9yLmpzIiwic3JjL2VsZW1lbnQtdXRpbHMuanMiLCJzcmMvaWQtZ2VuZXJhdG9yLmpzIiwic3JjL2lkLWhhbmRsZXIuanMiLCJzcmMvbGlzdGVuZXItaGFuZGxlci5qcyIsInNyYy9yZXBvcnRlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDblFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBiYXRjaFVwZGF0ZXJNYWtlcihvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICB2YXIgcmVwb3J0ZXIgICAgPSBvcHRpb25zLnJlcG9ydGVyO1xuICAgIHZhciBhc3luYyAgICAgICA9IHV0aWxzLmdldE9wdGlvbihvcHRpb25zLCBcImFzeW5jXCIsIHRydWUpO1xuICAgIHZhciBhdXRvVXBkYXRlICA9IHV0aWxzLmdldE9wdGlvbihvcHRpb25zLCBcImF1dG9cIiwgdHJ1ZSk7XG5cbiAgICBpZihhdXRvVXBkYXRlICYmICFhc3luYykge1xuICAgICAgICByZXBvcnRlci53YXJuKFwiSW52YWxpZCBvcHRpb25zIGNvbWJpbmF0aW9uLiBhdXRvPXRydWUgYW5kIGFzeW5jPWZhbHNlIGlzIGludmFsaWQuIFNldHRpbmcgYXN5bmM9dHJ1ZS5cIik7XG4gICAgICAgIGFzeW5jID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZighcmVwb3J0ZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUmVwb3J0ZXIgcmVxdWlyZWQuXCIpO1xuICAgIH1cblxuICAgIHZhciBiYXRjaFNpemUgPSAwO1xuICAgIHZhciBiYXRjaCA9IHt9O1xuICAgIHZhciBoYW5kbGVyO1xuICAgIHZhciBvblByb2Nlc3NlZENhbGxiYWNrID0gZnVuY3Rpb24oKSB7fTtcblxuICAgIGZ1bmN0aW9uIHF1ZXVlVXBkYXRlKGVsZW1lbnQsIHVwZGF0ZXIpIHtcbiAgICAgICAgaWYoYXV0b1VwZGF0ZSAmJiBhc3luYyAmJiBiYXRjaFNpemUgPT09IDApIHtcbiAgICAgICAgICAgIHVwZGF0ZUJhdGNoQXN5bmMoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCFiYXRjaFtlbGVtZW50XSkge1xuICAgICAgICAgICAgYmF0Y2hbZWxlbWVudF0gPSBbXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJhdGNoW2VsZW1lbnRdLnB1c2godXBkYXRlcik7XG4gICAgICAgIGJhdGNoU2l6ZSsrO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZvcmNlVXBkYXRlQmF0Y2godXBkYXRlQXN5bmMpIHtcbiAgICAgICAgaWYodXBkYXRlQXN5bmMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdXBkYXRlQXN5bmMgPSBhc3luYztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGhhbmRsZXIpIHtcbiAgICAgICAgICAgIGNhbmNlbEZyYW1lKGhhbmRsZXIpO1xuICAgICAgICAgICAgaGFuZGxlciA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZihhc3luYykge1xuICAgICAgICAgICAgdXBkYXRlQmF0Y2hBc3luYygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdXBkYXRlQmF0Y2goKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVwZGF0ZUJhdGNoKCkge1xuICAgICAgICBmb3IodmFyIGVsZW1lbnQgaW4gYmF0Y2gpIHtcbiAgICAgICAgICAgIGlmKGJhdGNoLmhhc093blByb3BlcnR5KGVsZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgdmFyIHVwZGF0ZXJzID0gYmF0Y2hbZWxlbWVudF07XG5cbiAgICAgICAgICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgdXBkYXRlcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHVwZGF0ZXIgPSB1cGRhdGVyc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjbGVhckJhdGNoKCk7XG4gICAgICAgIG9uUHJvY2Vzc2VkQ2FsbGJhY2soKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB1cGRhdGVCYXRjaEFzeW5jKCkge1xuICAgICAgICBoYW5kbGVyID0gcmVxdWVzdEZyYW1lKGZ1bmN0aW9uIHBlcmZvcm1VcGRhdGUoKSB7XG4gICAgICAgICAgICB1cGRhdGVCYXRjaCgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjbGVhckJhdGNoKCkge1xuICAgICAgICBiYXRjaFNpemUgPSAwO1xuICAgICAgICBiYXRjaCA9IHt9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNhbmNlbEZyYW1lKGxpc3RlbmVyKSB7XG4gICAgICAgIC8vIHZhciBjYW5jZWwgPSB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUgfHwgd2luZG93Lm1vekNhbmNlbEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy53ZWJraXRDYW5jZWxBbmltYXRpb25GcmFtZSB8fCB3aW5kb3cuY2xlYXJUaW1lb3V0O1xuICAgICAgICB2YXIgY2FuY2VsID0gd2luZG93LmNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNhbmNlbChsaXN0ZW5lcik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVxdWVzdEZyYW1lKGNhbGxiYWNrKSB7XG4gICAgICAgIC8vIHZhciByYWYgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHwgd2luZG93LndlYmtpdFJlcXVlc3RBbmltYXRpb25GcmFtZSB8fCBmdW5jdGlvbihmbikgeyByZXR1cm4gd2luZG93LnNldFRpbWVvdXQoZm4sIDIwKTsgfTtcbiAgICAgICAgdmFyIHJhZiA9IGZ1bmN0aW9uKGZuKSB7IHJldHVybiB3aW5kb3cuc2V0VGltZW91dChmbiwgMCk7IH07XG4gICAgICAgIHJldHVybiByYWYoY2FsbGJhY2spO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uUHJvY2Vzc2VkKGNhbGxiYWNrKSB7XG4gICAgICAgIG9uUHJvY2Vzc2VkQ2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbigpIHt9O1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIHVwZGF0ZTogcXVldWVVcGRhdGUsXG4gICAgICAgIGZvcmNlOiBmb3JjZVVwZGF0ZUJhdGNoLFxuICAgICAgICBvblByb2Nlc3NlZDogb25Qcm9jZXNzZWRcbiAgICB9O1xufTsiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxudXRpbHMuZ2V0T3B0aW9uID0gZ2V0T3B0aW9uO1xuXG5mdW5jdGlvbiBnZXRPcHRpb24ob3B0aW9ucywgbmFtZSwgZGVmYXVsdFZhbHVlKSB7XG4gICAgdmFyIHZhbHVlID0gb3B0aW9uc1tuYW1lXTtcblxuICAgIGlmKCh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSAmJiBkZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICAgIH1cblxuICAgIHJldHVybiB2YWx1ZTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZGV0ZWN0b3IgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG5kZXRlY3Rvci5pc0lFID0gZnVuY3Rpb24odmVyc2lvbikge1xuICAgIGZ1bmN0aW9uIGlzQW55SWVWZXJzaW9uKCkge1xuICAgICAgICB2YXIgYWdlbnQgPSBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIHJldHVybiBhZ2VudC5pbmRleE9mKFwibXNpZVwiKSAhPT0gLTEgfHwgYWdlbnQuaW5kZXhPZihcInRyaWRlbnRcIikgIT09IC0xO1xuICAgIH1cblxuICAgIGlmKCFpc0FueUllVmVyc2lvbigpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBpZighdmVyc2lvbikge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvL1NoYW1lbGVzc2x5IHN0b2xlbiBmcm9tIGh0dHBzOi8vZ2lzdC5naXRodWIuY29tL3BhZG9sc2V5LzUyNzY4M1xuICAgIHZhciBpZVZlcnNpb24gPSAoZnVuY3Rpb24oKXtcbiAgICAgICAgdmFyIHVuZGVmLFxuICAgICAgICAgICAgdiA9IDMsXG4gICAgICAgICAgICBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLFxuICAgICAgICAgICAgYWxsID0gZGl2LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiaVwiKTtcblxuICAgICAgICBkbyB7XG4gICAgICAgICAgICBkaXYuaW5uZXJIVE1MID0gXCI8IS0tW2lmIGd0IElFIFwiICsgKCsrdikgKyBcIl0+PGk+PC9pPjwhW2VuZGlmXS0tPlwiO1xuICAgICAgICB9XG4gICAgICAgIHdoaWxlIChhbGxbMF0pO1xuXG4gICAgICAgIHJldHVybiB2ID4gNCA/IHYgOiB1bmRlZjtcbiAgICB9KCkpO1xuXG4gICAgcmV0dXJuIHZlcnNpb24gPT09IGllVmVyc2lvbjtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLyoqXG4gKiBMb29wcyB0aHJvdWdoIHRoZSBjb2xsZWN0aW9uIGFuZCBjYWxscyB0aGUgY2FsbGJhY2sgZm9yIGVhY2ggZWxlbWVudC4gaWYgdGhlIGNhbGxiYWNrIHJldHVybnMgdHJ1dGh5LCB0aGUgbG9vcCBpcyBicm9rZW4gYW5kIHJldHVybnMgdGhlIHNhbWUgdmFsdWUuXG4gKiBAcHVibGljXG4gKiBAcGFyYW0geyp9IGNvbGxlY3Rpb24gVGhlIGNvbGxlY3Rpb24gdG8gbG9vcCB0aHJvdWdoLiBOZWVkcyB0byBoYXZlIGEgbGVuZ3RoIHByb3BlcnR5IHNldCBhbmQgaGF2ZSBpbmRpY2VzIHNldCBmcm9tIDAgdG8gbGVuZ3RoIC0gMS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIFRoZSBjYWxsYmFjayB0byBiZSBjYWxsZWQgZm9yIGVhY2ggZWxlbWVudC4gVGhlIGVsZW1lbnQgd2lsbCBiZSBnaXZlbiBhcyBhIHBhcmFtZXRlciB0byB0aGUgY2FsbGJhY2suIElmIHRoaXMgY2FsbGJhY2sgcmV0dXJucyB0cnV0aHksIHRoZSBsb29wIGlzIGJyb2tlbiBhbmQgdGhlIHNhbWUgdmFsdWUgaXMgcmV0dXJuZWQuXG4gKiBAcmV0dXJucyB7Kn0gVGhlIHZhbHVlIHRoYXQgYSBjYWxsYmFjayBoYXMgcmV0dXJuZWQgKGlmIHRydXRoeSkuIE90aGVyd2lzZSBub3RoaW5nLlxuICovXG51dGlscy5mb3JFYWNoID0gZnVuY3Rpb24oY29sbGVjdGlvbiwgY2FsbGJhY2spIHtcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgY29sbGVjdGlvbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgcmVzdWx0ID0gY2FsbGJhY2soY29sbGVjdGlvbltpXSk7XG4gICAgICAgIGlmKHJlc3VsdCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgIH1cbn07XG4iLCIvKipcbiAqIFJlc2l6ZSBkZXRlY3Rpb24gc3RyYXRlZ3kgdGhhdCBpbmplY3RzIG9iamVjdHMgdG8gZWxlbWVudHMgaW4gb3JkZXIgdG8gZGV0ZWN0IHJlc2l6ZSBldmVudHMuXG4gKiBIZWF2aWx5IGluc3BpcmVkIGJ5OiBodHRwOi8vd3d3LmJhY2thbGxleWNvZGVyLmNvbS8yMDEzLzAzLzE4L2Nyb3NzLWJyb3dzZXItZXZlbnQtYmFzZWQtZWxlbWVudC1yZXNpemUtZGV0ZWN0aW9uL1xuICovXG5cblwidXNlIHN0cmljdFwiO1xuXG52YXIgZm9yRWFjaCA9IHJlcXVpcmUoXCIuLi9jb2xsZWN0aW9uLXV0aWxzXCIpLmZvckVhY2g7XG52YXIgYnJvd3NlckRldGVjdG9yID0gcmVxdWlyZShcIi4uL2Jyb3dzZXItZGV0ZWN0b3JcIik7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIG9wdGlvbnMgICAgICAgICAgICAgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciBpZEhhbmRsZXIgICAgICAgPSBvcHRpb25zLmlkSGFuZGxlcjtcbiAgICB2YXIgcmVwb3J0ZXIgICAgICAgID0gb3B0aW9ucy5yZXBvcnRlcjtcbiAgICB2YXIgYmF0Y2hVcGRhdGVyICAgID0gb3B0aW9ucy5iYXRjaFVwZGF0ZXI7XG5cbiAgICBpZighaWRIYW5kbGVyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk1pc3NpbmcgcmVxdWlyZWQgZGVwZW5kZW5jeTogaWRIYW5kbGVyLlwiKTtcbiAgICB9XG5cbiAgICBpZighcmVwb3J0ZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTWlzc2luZyByZXF1aXJlZCBkZXBlbmRlbmN5OiByZXBvcnRlci5cIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIHJlc2l6ZSBldmVudCBsaXN0ZW5lciB0byB0aGUgZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRoYXQgc2hvdWxkIGhhdmUgdGhlIGxpc3RlbmVyIGFkZGVkLlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGxpc3RlbmVyIFRoZSBsaXN0ZW5lciBjYWxsYmFjayB0byBiZSBjYWxsZWQgZm9yIGVhY2ggcmVzaXplIGV2ZW50IG9mIHRoZSBlbGVtZW50LiBUaGUgZWxlbWVudCB3aWxsIGJlIGdpdmVuIGFzIGEgcGFyYW1ldGVyIHRvIHRoZSBsaXN0ZW5lciBjYWxsYmFjay5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhZGRMaXN0ZW5lcihlbGVtZW50LCBsaXN0ZW5lcikge1xuICAgICAgICBpZighZ2V0T2JqZWN0KGVsZW1lbnQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFbGVtZW50IGlzIG5vdCBkZXRlY3RhYmxlIGJ5IHRoaXMgc3RyYXRlZ3kuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gbGlzdGVuZXJQcm94eSgpIHtcbiAgICAgICAgICAgIGxpc3RlbmVyKGVsZW1lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoYnJvd3NlckRldGVjdG9yLmlzSUUoOCkpIHtcbiAgICAgICAgICAgIC8vSUUgOCBkb2VzIG5vdCBzdXBwb3J0IG9iamVjdCwgYnV0IHN1cHBvcnRzIHRoZSByZXNpemUgZXZlbnQgZGlyZWN0bHkgb24gZWxlbWVudHMuXG4gICAgICAgICAgICBlbGVtZW50LmF0dGFjaEV2ZW50KFwib25yZXNpemVcIiwgbGlzdGVuZXJQcm94eSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgb2JqZWN0ID0gZ2V0T2JqZWN0KGVsZW1lbnQpO1xuICAgICAgICAgICAgb2JqZWN0LmNvbnRlbnREb2N1bWVudC5kZWZhdWx0Vmlldy5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIGxpc3RlbmVyUHJveHkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWFrZXMgYW4gZWxlbWVudCBkZXRlY3RhYmxlIGFuZCByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGV2ZW50cy4gV2lsbCBjYWxsIHRoZSBjYWxsYmFjayB3aGVuIHRoZSBlbGVtZW50IGlzIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgY2hhbmdlcy5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0byBtYWtlIGRldGVjdGFibGVcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIHdoZW4gdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBjaGFuZ2VzLiBXaWxsIGJlIGNhbGxlZCB3aXRoIHRoZSBlbGVtZW50IGFzIGZpcnN0IHBhcmFtZXRlci5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBtYWtlRGV0ZWN0YWJsZShlbGVtZW50LCBjYWxsYmFjaykge1xuICAgICAgICBmdW5jdGlvbiBpbmplY3RPYmplY3QoaWQsIGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICB2YXIgT0JKRUNUX1NUWUxFID0gXCJkaXNwbGF5OiBibG9jazsgcG9zaXRpb246IGFic29sdXRlOyB0b3A6IDA7IGxlZnQ6IDA7IHdpZHRoOiAxMDAlOyBoZWlnaHQ6IDEwMCU7IGJvcmRlcjogbm9uZTsgcGFkZGluZzogMDsgbWFyZ2luOiAwOyBvcGFjaXR5OiAwOyB6LWluZGV4OiAtMTAwMDsgcG9pbnRlci1ldmVudHM6IG5vbmU7XCI7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIG9uT2JqZWN0TG9hZCgpIHtcbiAgICAgICAgICAgICAgICAvKmpzaGludCB2YWxpZHRoaXM6IHRydWUgKi9cblxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGdldERvY3VtZW50KGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vT3BlcmEgMTIgc2VlbSB0byBjYWxsIHRoZSBvYmplY3Qub25sb2FkIGJlZm9yZSB0aGUgYWN0dWFsIGRvY3VtZW50IGhhcyBiZWVuIGNyZWF0ZWQuXG4gICAgICAgICAgICAgICAgICAgIC8vU28gaWYgaXQgaXMgbm90IHByZXNlbnQsIHBvbGwgaXQgd2l0aCBhbiB0aW1lb3V0IHVudGlsIGl0IGlzIHByZXNlbnQuXG4gICAgICAgICAgICAgICAgICAgIC8vVE9ETzogQ291bGQgbWF5YmUgYmUgaGFuZGxlZCBiZXR0ZXIgd2l0aCBvYmplY3Qub25yZWFkeXN0YXRlY2hhbmdlIG9yIHNpbWlsYXIuXG4gICAgICAgICAgICAgICAgICAgIGlmKCFlbGVtZW50LmNvbnRlbnREb2N1bWVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiBjaGVja0Zvck9iamVjdERvY3VtZW50KCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdldERvY3VtZW50KGVsZW1lbnQsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIDEwMCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVsZW1lbnQuY29udGVudERvY3VtZW50KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvL011dGF0aW5nIHRoZSBvYmplY3QgZWxlbWVudCBoZXJlIHNlZW1zIHRvIGZpcmUgYW5vdGhlciBsb2FkIGV2ZW50LlxuICAgICAgICAgICAgICAgIC8vTXV0YXRpbmcgdGhlIGlubmVyIGRvY3VtZW50IG9mIHRoZSBvYmplY3QgZWxlbWVudCBpcyBmaW5lIHRob3VnaC5cbiAgICAgICAgICAgICAgICB2YXIgb2JqZWN0RWxlbWVudCA9IHRoaXM7XG5cbiAgICAgICAgICAgICAgICAvL0NyZWF0ZSB0aGUgc3R5bGUgZWxlbWVudCB0byBiZSBhZGRlZCB0byB0aGUgb2JqZWN0LlxuICAgICAgICAgICAgICAgIGdldERvY3VtZW50KG9iamVjdEVsZW1lbnQsIGZ1bmN0aW9uIG9uT2JqZWN0RG9jdW1lbnRSZWFkeShvYmplY3REb2N1bWVudCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3R5bGUgPSBvYmplY3REb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gICAgICAgICAgICAgICAgICAgIHN0eWxlLmlubmVySFRNTCA9IFwiaHRtbCwgYm9keSB7IG1hcmdpbjogMDsgcGFkZGluZzogMCB9IGRpdiB7IC13ZWJraXQtdHJhbnNpdGlvbjogb3BhY2l0eSAwLjAxczsgLW1zLXRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IC1vLXRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IHRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IG9wYWNpdHk6IDA7IH1cIjtcblxuICAgICAgICAgICAgICAgICAgICAvL1RPRE86IFJlbW92ZSBhbnkgc3R5bGVzIHRoYXQgaGFzIGJlZW4gc2V0IG9uIHRoZSBvYmplY3QuIE9ubHkgdGhlIHN0eWxlIGFib3ZlIHNob3VsZCBiZSBzdHlsaW5nIHRoZSBvYmplY3QuXG5cbiAgICAgICAgICAgICAgICAgICAgLy9BcHBlbmQgdGhlIHN0eWxlIHRvIHRoZSBvYmplY3QuXG4gICAgICAgICAgICAgICAgICAgIG9iamVjdERvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vTm90aWZ5IHRoYXQgdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgdG8uXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL1RoZSB0YXJnZXQgZWxlbWVudCBuZWVkcyB0byBiZSBwb3NpdGlvbmVkIChldmVyeXRoaW5nIGV4Y2VwdCBzdGF0aWMpIHNvIHRoZSBhYnNvbHV0ZSBwb3NpdGlvbmVkIG9iamVjdCB3aWxsIGJlIHBvc2l0aW9uZWQgcmVsYXRpdmUgdG8gdGhlIHRhcmdldCBlbGVtZW50LlxuICAgICAgICAgICAgdmFyIHN0eWxlID0gZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcbiAgICAgICAgICAgIHZhciBwb3NpdGlvbiA9IHN0eWxlLnBvc2l0aW9uO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBtdXRhdGVEb20oKSB7XG4gICAgICAgICAgICAgICAgaWYocG9zaXRpb24gPT09IFwic3RhdGljXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9IFwicmVsYXRpdmVcIjtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgcmVtb3ZlUmVsYXRpdmVTdHlsZXMgPSBmdW5jdGlvbihyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIHByb3BlcnR5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBnZXROdW1lcmljYWxWYWx1ZSh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bXi1cXGRcXC5dL2csIFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSBzdHlsZVtwcm9wZXJ0eV07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKHZhbHVlICE9PSBcImF1dG9cIiAmJiBnZXROdW1lcmljYWxWYWx1ZSh2YWx1ZSkgIT09IFwiMFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0ZXIud2FybihcIkFuIGVsZW1lbnQgdGhhdCBpcyBwb3NpdGlvbmVkIHN0YXRpYyBoYXMgc3R5bGUuXCIgKyBwcm9wZXJ0eSArIFwiPVwiICsgdmFsdWUgKyBcIiB3aGljaCBpcyBpZ25vcmVkIGR1ZSB0byB0aGUgc3RhdGljIHBvc2l0aW9uaW5nLiBUaGUgZWxlbWVudCB3aWxsIG5lZWQgdG8gYmUgcG9zaXRpb25lZCByZWxhdGl2ZSwgc28gdGhlIHN0eWxlLlwiICsgcHJvcGVydHkgKyBcIiB3aWxsIGJlIHNldCB0byAwLiBFbGVtZW50OiBcIiwgZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZVtwcm9wZXJ0eV0gPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIC8vQ2hlY2sgc28gdGhhdCB0aGVyZSBhcmUgbm8gYWNjaWRlbnRhbCBzdHlsZXMgdGhhdCB3aWxsIG1ha2UgdGhlIGVsZW1lbnQgc3R5bGVkIGRpZmZlcmVudGx5IG5vdyB0aGF0IGlzIGlzIHJlbGF0aXZlLlxuICAgICAgICAgICAgICAgICAgICAvL0lmIHRoZXJlIGFyZSBhbnksIHNldCB0aGVtIHRvIDAgKHRoaXMgc2hvdWxkIGJlIG9rYXkgd2l0aCB0aGUgdXNlciBzaW5jZSB0aGUgc3R5bGUgcHJvcGVydGllcyBkaWQgbm90aGluZyBiZWZvcmUgW3NpbmNlIHRoZSBlbGVtZW50IHdhcyBwb3NpdGlvbmVkIHN0YXRpY10gYW55d2F5KS5cbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIHN0eWxlLCBcInRvcFwiKTtcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIHN0eWxlLCBcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIFwiYm90dG9tXCIpO1xuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIFwibGVmdFwiKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvL0FkZCBhbiBvYmplY3QgZWxlbWVudCBhcyBhIGNoaWxkIHRvIHRoZSB0YXJnZXQgZWxlbWVudCB0aGF0IHdpbGwgYmUgbGlzdGVuZWQgdG8gZm9yIHJlc2l6ZSBldmVudHMuXG4gICAgICAgICAgICAgICAgdmFyIG9iamVjdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJvYmplY3RcIik7XG4gICAgICAgICAgICAgICAgb2JqZWN0LnN0eWxlLmNzc1RleHQgPSBPQkpFQ1RfU1RZTEU7XG4gICAgICAgICAgICAgICAgb2JqZWN0LnR5cGUgPSBcInRleHQvaHRtbFwiO1xuICAgICAgICAgICAgICAgIG9iamVjdC5vbmxvYWQgPSBvbk9iamVjdExvYWQ7XG4gICAgICAgICAgICAgICAgb2JqZWN0Ll9lcmRPYmplY3RJZCA9IGlkO1xuXG4gICAgICAgICAgICAgICAgLy9TYWZhcmk6IFRoaXMgbXVzdCBvY2N1ciBiZWZvcmUgYWRkaW5nIHRoZSBvYmplY3QgdG8gdGhlIERPTS5cbiAgICAgICAgICAgICAgICAvL0lFOiBEb2VzIG5vdCBsaWtlIHRoYXQgdGhpcyBoYXBwZW5zIGJlZm9yZSwgZXZlbiBpZiBpdCBpcyBhbHNvIGFkZGVkIGFmdGVyLlxuICAgICAgICAgICAgICAgIGlmKCFicm93c2VyRGV0ZWN0b3IuaXNJRSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIG9iamVjdC5kYXRhID0gXCJhYm91dDpibGFua1wiO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGVsZW1lbnQuYXBwZW5kQ2hpbGQob2JqZWN0KTtcblxuICAgICAgICAgICAgICAgIC8vSUU6IFRoaXMgbXVzdCBvY2N1ciBhZnRlciBhZGRpbmcgdGhlIG9iamVjdCB0byB0aGUgRE9NLlxuICAgICAgICAgICAgICAgIGlmKGJyb3dzZXJEZXRlY3Rvci5pc0lFKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgb2JqZWN0LmRhdGEgPSBcImFib3V0OmJsYW5rXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZihiYXRjaFVwZGF0ZXIpIHtcbiAgICAgICAgICAgICAgICBiYXRjaFVwZGF0ZXIudXBkYXRlKGlkLCBtdXRhdGVEb20pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtdXRhdGVEb20oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vT2J0YWluIHRoZSBpZCBvZiB0aGUgZWxlbWVudCAod2lsbCBiZSBnZW5lcmF0ZWQgaWYgbm90IHByZXNlbnQpLCBzbyB0aGF0IGV2ZW50IGxpc3RlbmVycyBjYW4gYmUgaWRlbnRpZmllZCB0byB0aGlzIGVsZW1lbnQuXG4gICAgICAgIHZhciBpZCA9IGlkSGFuZGxlci5nZXQoZWxlbWVudCk7XG5cbiAgICAgICAgaWYoYnJvd3NlckRldGVjdG9yLmlzSUUoOCkpIHtcbiAgICAgICAgICAgIC8vSUUgOCBkb2VzIG5vdCBzdXBwb3J0IG9iamVjdHMgcHJvcGVybHkuIEx1Y2tpbHkgdGhleSBkbyBzdXBwb3J0IHRoZSByZXNpemUgZXZlbnQuXG4gICAgICAgICAgICAvL1NvIGRvIG5vdCBpbmplY3QgdGhlIG9iamVjdCBhbmQgbm90aWZ5IHRoYXQgdGhlIGVsZW1lbnQgaXMgYWxyZWFkeSByZWFkeSB0byBiZSBsaXN0ZW5lZCB0by5cbiAgICAgICAgICAgIC8vVGhlIGV2ZW50IGhhbmRsZXIgZm9yIHRoZSByZXNpemUgZXZlbnQgaXMgYXR0YWNoZWQgaW4gdGhlIHV0aWxzLmFkZExpc3RlbmVyIGluc3RlYWQuXG4gICAgICAgICAgICBjYWxsYmFjayhlbGVtZW50KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluamVjdE9iamVjdChpZCwgZWxlbWVudCwgY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY2hpbGQgb2JqZWN0IG9mIHRoZSB0YXJnZXQgZWxlbWVudC5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgdGFyZ2V0IGVsZW1lbnQuXG4gICAgICogQHJldHVybnMgVGhlIG9iamVjdCBlbGVtZW50IG9mIHRoZSB0YXJnZXQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0T2JqZWN0KGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGZvckVhY2goZWxlbWVudC5jaGlsZHJlbiwgZnVuY3Rpb24gaXNPYmplY3QoY2hpbGQpIHtcbiAgICAgICAgICAgIGlmKGNoaWxkLl9lcmRPYmplY3RJZCAhPT0gdW5kZWZpbmVkICYmIGNoaWxkLl9lcmRPYmplY3RJZCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjaGlsZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgbWFrZURldGVjdGFibGU6IG1ha2VEZXRlY3RhYmxlLFxuICAgICAgICBhZGRMaXN0ZW5lcjogYWRkTGlzdGVuZXJcbiAgICB9O1xufTtcbiIsIi8qKlxuICogUmVzaXplIGRldGVjdGlvbiBzdHJhdGVneSB0aGF0IGluamVjdHMgZGl2cyB0byBlbGVtZW50cyBpbiBvcmRlciB0byBkZXRlY3QgcmVzaXplIGV2ZW50cyBvbiBzY3JvbGwgZXZlbnRzLlxuICogSGVhdmlseSBpbnNwaXJlZCBieTogaHR0cHM6Ly9naXRodWIuY29tL21hcmNqL2Nzcy1lbGVtZW50LXF1ZXJpZXMvYmxvYi9tYXN0ZXIvc3JjL1Jlc2l6ZVNlbnNvci5qc1xuICovXG5cblwidXNlIHN0cmljdFwiO1xuXG52YXIgYmF0Y2hVcGRhdGVyTWFrZXIgPSByZXF1aXJlKFwiYmF0Y2gtdXBkYXRlclwiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgb3B0aW9ucyAgICAgICAgICAgICA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIGlkSGFuZGxlciAgICAgICA9IG9wdGlvbnMuaWRIYW5kbGVyO1xuICAgIHZhciByZXBvcnRlciAgICAgICAgPSBvcHRpb25zLnJlcG9ydGVyO1xuICAgIHZhciBiYXRjaFVwZGF0ZXIgICAgPSBvcHRpb25zLmJhdGNoVXBkYXRlcjtcblxuICAgIC8vVE9ETzogVGhpcyBpcyB1Z2x5LiBUaGUgYmF0Y2ggdXBkYXRvciBzaG91bGQgc3VwcG9ydCBsZXZlbGVkIGJhdGNoZXMgb3Igc29tZXRoaW5nIHNpbWlsYXIuXG4gICAgdmFyIHRlc3RCYXRjaFVwZGF0ZXIgPSBiYXRjaFVwZGF0ZXJNYWtlcih7XG4gICAgICAgIHJlcG9ydGVyOiByZXBvcnRlclxuICAgIH0pO1xuICAgIHZhciB0ZXN0QmF0Y2hVcGRhdGVyMiA9IGJhdGNoVXBkYXRlck1ha2VyKHtcbiAgICAgICAgcmVwb3J0ZXI6IHJlcG9ydGVyXG4gICAgfSk7XG5cbiAgICAvL1RPRE86IFRoaXMgc2hvdWxkIHByb2JhYmx5IGJlIERJLCBvciBhdGxlYXN0IHRoZSBtYWtlciBmdW5jdGlvbiBzbyB0aGF0IG90aGVyIGZyYW1ld29ya3MgY2FuIHNoYXJlIHRoZSBiYXRjaC11cGRhdGVyIGNvZGUuIEl0IG1pZ2h0IG5vdCBtYWtlIHNlbnNlIHRvIHNoYXJlIGEgYmF0Y2ggdXBkYXRlciwgc2luY2UgYmF0Y2hlcyBjYW4gaW50ZXJmZXJlIHdpdGggZWFjaCBvdGhlci5cbiAgICB2YXIgc2Nyb2xsYmFyc0JhdGNoVXBkYXRlciA9IGJhdGNoVXBkYXRlck1ha2VyKHtcbiAgICAgICAgcmVwb3J0ZXI6IHJlcG9ydGVyXG4gICAgfSk7XG5cbiAgICBpZighaWRIYW5kbGVyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk1pc3NpbmcgcmVxdWlyZWQgZGVwZW5kZW5jeTogaWRIYW5kbGVyLlwiKTtcbiAgICB9XG5cbiAgICBpZighcmVwb3J0ZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTWlzc2luZyByZXF1aXJlZCBkZXBlbmRlbmN5OiByZXBvcnRlci5cIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIHJlc2l6ZSBldmVudCBsaXN0ZW5lciB0byB0aGUgZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRoYXQgc2hvdWxkIGhhdmUgdGhlIGxpc3RlbmVyIGFkZGVkLlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGxpc3RlbmVyIFRoZSBsaXN0ZW5lciBjYWxsYmFjayB0byBiZSBjYWxsZWQgZm9yIGVhY2ggcmVzaXplIGV2ZW50IG9mIHRoZSBlbGVtZW50LiBUaGUgZWxlbWVudCB3aWxsIGJlIGdpdmVuIGFzIGEgcGFyYW1ldGVyIHRvIHRoZSBsaXN0ZW5lciBjYWxsYmFjay5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhZGRMaXN0ZW5lcihlbGVtZW50LCBsaXN0ZW5lcikge1xuICAgICAgICB2YXIgY2hhbmdlZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIGVsZW1lbnRTdHlsZSAgICA9IGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG4gICAgICAgICAgICB2YXIgd2lkdGggICAgICAgICAgID0gcGFyc2VTaXplKGVsZW1lbnRTdHlsZS53aWR0aCk7XG4gICAgICAgICAgICB2YXIgaGVpZ2h0ICAgICAgICAgID0gcGFyc2VTaXplKGVsZW1lbnRTdHlsZS5oZWlnaHQpO1xuICAgICAgICAgICAgdmFyIGlkICAgICAgICAgICAgICA9IGlkSGFuZGxlci5nZXQoZWxlbWVudCk7XG5cbiAgICAgICAgICAgIHRlc3RCYXRjaFVwZGF0ZXIudXBkYXRlKGlkLCBmdW5jdGlvbiB1cGRhdGVEZXRlY3RvckVsZW1lbnRzKCkge1xuICAgICAgICAgICAgICAgIHVwZGF0ZUNoaWxkU2l6ZXMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgICAgICAgICAgc3RvcmVDdXJyZW50U2l6ZShlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgICAgICAgICB0ZXN0QmF0Y2hVcGRhdGVyMi51cGRhdGUoaWQsIGZ1bmN0aW9uIHVwZGF0ZVNjcm9sbGJhcnMoKSB7XG4gICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uU2Nyb2xsYmFycyhlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXIoZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICB2YXIgZXhwYW5kID0gZ2V0RXhwYW5kRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgdmFyIHNocmluayA9IGdldFNocmlua0VsZW1lbnQoZWxlbWVudCk7XG5cbiAgICAgICAgYWRkRXZlbnQoZXhwYW5kLCBcInNjcm9sbFwiLCBmdW5jdGlvbiBvbkV4cGFuZCgpIHtcbiAgICAgICAgICAgIHZhciBzdHlsZSA9IGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG4gICAgICAgICAgICB2YXIgd2lkdGggPSBwYXJzZVNpemUoc3R5bGUud2lkdGgpO1xuICAgICAgICAgICAgdmFyIGhlaWdodCA9IHBhcnNlU2l6ZShzdHlsZS5oZWlnaHQpO1xuICAgICAgICAgICAgaWYgKHdpZHRoID4gZWxlbWVudC5sYXN0V2lkdGggfHwgaGVpZ2h0ID4gZWxlbWVudC5sYXN0SGVpZ2h0KSB7XG4gICAgICAgICAgICAgICAgY2hhbmdlZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBhZGRFdmVudChzaHJpbmssIFwic2Nyb2xsXCIsIGZ1bmN0aW9uIG9uU2hyaW5rKCkge1xuICAgICAgICAgICAgdmFyIHN0eWxlID0gZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcbiAgICAgICAgICAgIHZhciB3aWR0aCA9IHBhcnNlU2l6ZShzdHlsZS53aWR0aCk7XG4gICAgICAgICAgICB2YXIgaGVpZ2h0ID0gcGFyc2VTaXplKHN0eWxlLmhlaWdodCk7XG4gICAgICAgICAgICBpZiAod2lkdGggPCBlbGVtZW50Lmxhc3RXaWR0aCB8fCBoZWlnaHQgPCBlbGVtZW50Lmxhc3RIZWlnaHQpIHtcbiAgICAgICAgICAgICAgICBjaGFuZ2VkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1ha2VzIGFuIGVsZW1lbnQgZGV0ZWN0YWJsZSBhbmQgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBldmVudHMuIFdpbGwgY2FsbCB0aGUgY2FsbGJhY2sgd2hlbiB0aGUgZWxlbWVudCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGNoYW5nZXMuXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdG8gbWFrZSBkZXRlY3RhYmxlXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCB3aGVuIHRoZSBlbGVtZW50IGlzIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgY2hhbmdlcy4gV2lsbCBiZSBjYWxsZWQgd2l0aCB0aGUgZWxlbWVudCBhcyBmaXJzdCBwYXJhbWV0ZXIuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbWFrZURldGVjdGFibGUoZWxlbWVudCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGVsZW1lbnRTdHlsZSA9IGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG4gICAgICAgIHZhciB3aWR0aCA9IHBhcnNlU2l6ZShlbGVtZW50U3R5bGUud2lkdGgpO1xuICAgICAgICB2YXIgaGVpZ2h0ID0gcGFyc2VTaXplKGVsZW1lbnRTdHlsZS5oZWlnaHQpO1xuXG4gICAgICAgIGZ1bmN0aW9uIG11dGF0ZURvbSgpIHtcbiAgICAgICAgICAgIGlmKGVsZW1lbnRTdHlsZS5wb3NpdGlvbiA9PT0gXCJzdGF0aWNcIikge1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSBcInJlbGF0aXZlXCI7XG5cbiAgICAgICAgICAgICAgICB2YXIgcmVtb3ZlUmVsYXRpdmVTdHlsZXMgPSBmdW5jdGlvbihyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIHByb3BlcnR5KSB7XG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGdldE51bWVyaWNhbFZhbHVlKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWUucmVwbGFjZSgvW14tXFxkXFwuXS9nLCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IGVsZW1lbnRTdHlsZVtwcm9wZXJ0eV07XG5cbiAgICAgICAgICAgICAgICAgICAgaWYodmFsdWUgIT09IFwiYXV0b1wiICYmIGdldE51bWVyaWNhbFZhbHVlKHZhbHVlKSAhPT0gXCIwXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlcG9ydGVyLndhcm4oXCJBbiBlbGVtZW50IHRoYXQgaXMgcG9zaXRpb25lZCBzdGF0aWMgaGFzIHN0eWxlLlwiICsgcHJvcGVydHkgKyBcIj1cIiArIHZhbHVlICsgXCIgd2hpY2ggaXMgaWdub3JlZCBkdWUgdG8gdGhlIHN0YXRpYyBwb3NpdGlvbmluZy4gVGhlIGVsZW1lbnQgd2lsbCBuZWVkIHRvIGJlIHBvc2l0aW9uZWQgcmVsYXRpdmUsIHNvIHRoZSBzdHlsZS5cIiArIHByb3BlcnR5ICsgXCIgd2lsbCBiZSBzZXQgdG8gMC4gRWxlbWVudDogXCIsIGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZVtwcm9wZXJ0eV0gPSAwO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIC8vQ2hlY2sgc28gdGhhdCB0aGVyZSBhcmUgbm8gYWNjaWRlbnRhbCBzdHlsZXMgdGhhdCB3aWxsIG1ha2UgdGhlIGVsZW1lbnQgc3R5bGVkIGRpZmZlcmVudGx5IG5vdyB0aGF0IGlzIGlzIHJlbGF0aXZlLlxuICAgICAgICAgICAgICAgIC8vSWYgdGhlcmUgYXJlIGFueSwgc2V0IHRoZW0gdG8gMCAodGhpcyBzaG91bGQgYmUgb2theSB3aXRoIHRoZSB1c2VyIHNpbmNlIHRoZSBzdHlsZSBwcm9wZXJ0aWVzIGRpZCBub3RoaW5nIGJlZm9yZSBbc2luY2UgdGhlIGVsZW1lbnQgd2FzIHBvc2l0aW9uZWQgc3RhdGljXSBhbnl3YXkpLlxuICAgICAgICAgICAgICAgIHJlbW92ZVJlbGF0aXZlU3R5bGVzKHJlcG9ydGVyLCBlbGVtZW50LCBlbGVtZW50U3R5bGUsIFwidG9wXCIpO1xuICAgICAgICAgICAgICAgIHJlbW92ZVJlbGF0aXZlU3R5bGVzKHJlcG9ydGVyLCBlbGVtZW50LCBlbGVtZW50U3R5bGUsIFwicmlnaHRcIik7XG4gICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIGVsZW1lbnRTdHlsZSwgXCJib3R0b21cIik7XG4gICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIGVsZW1lbnRTdHlsZSwgXCJsZWZ0XCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBnZXRDb250YWluZXJDc3NUZXh0KGxlZnQsIHRvcCkge1xuICAgICAgICAgICAgICAgIGxlZnQgPSAoIWxlZnQgPyBcIjBcIiA6IChsZWZ0ICsgXCJweFwiKSk7XG4gICAgICAgICAgICAgICAgdG9wID0gKCF0b3AgPyBcIjBcIiA6ICh0b3AgKyBcInB4XCIpKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBcInBvc2l0aW9uOiBhYnNvbHV0ZTsgbGVmdDogXCIgKyBsZWZ0ICsgXCI7IHRvcDogXCIgKyB0b3AgKyBcIjsgcmlnaHQ6IDA7IGJvdHRvbTogMDsgb3ZlcmZsb3c6IHNjcm9sbDsgei1pbmRleDogLTE7IHZpc2liaWxpdHk6IGhpZGRlbjtcIjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHJlYWR5RXhwYW5kU2Nyb2xsID0gZmFsc2U7XG4gICAgICAgICAgICB2YXIgcmVhZHlTaHJpbmtTY3JvbGwgPSBmYWxzZTtcbiAgICAgICAgICAgIHZhciByZWFkeU92ZXJhbGwgPSBmYWxzZTtcblxuICAgICAgICAgICAgZnVuY3Rpb24gcmVhZHkoKSB7XG4gICAgICAgICAgICAgICAgaWYocmVhZHlFeHBhbmRTY3JvbGwgJiYgcmVhZHlTaHJpbmtTY3JvbGwgJiYgcmVhZHlPdmVyYWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGNvbnRhaW5lclN0eWxlICAgICAgICAgID0gZ2V0Q29udGFpbmVyQ3NzVGV4dCgtMSwgLTEpO1xuICAgICAgICAgICAgdmFyIHNocmlua0V4cGFuZHN0eWxlICAgICAgID0gZ2V0Q29udGFpbmVyQ3NzVGV4dCgwLCAwKTtcbiAgICAgICAgICAgIHZhciBzaHJpbmtFeHBhbmRDaGlsZFN0eWxlICA9IFwicG9zaXRpb246IGFic29sdXRlOyBsZWZ0OiAwOyB0b3A6IDA7XCI7XG5cbiAgICAgICAgICAgIHZhciBjb250YWluZXIgICAgICAgICAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICB2YXIgZXhwYW5kICAgICAgICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgdmFyIGV4cGFuZENoaWxkICAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIHZhciBzaHJpbmsgICAgICAgICAgICAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICB2YXIgc2hyaW5rQ2hpbGQgICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXG4gICAgICAgICAgICBjb250YWluZXIuc3R5bGUuY3NzVGV4dCAgICAgPSBjb250YWluZXJTdHlsZTtcbiAgICAgICAgICAgIGV4cGFuZC5zdHlsZS5jc3NUZXh0ICAgICAgICA9IHNocmlua0V4cGFuZHN0eWxlO1xuICAgICAgICAgICAgZXhwYW5kQ2hpbGQuc3R5bGUuY3NzVGV4dCAgID0gc2hyaW5rRXhwYW5kQ2hpbGRTdHlsZTtcbiAgICAgICAgICAgIHNocmluay5zdHlsZS5jc3NUZXh0ICAgICAgICA9IHNocmlua0V4cGFuZHN0eWxlO1xuICAgICAgICAgICAgc2hyaW5rQ2hpbGQuc3R5bGUuY3NzVGV4dCAgID0gc2hyaW5rRXhwYW5kQ2hpbGRTdHlsZSArIFwiIHdpZHRoOiAyMDAlOyBoZWlnaHQ6IDIwMCU7XCI7XG5cbiAgICAgICAgICAgIGV4cGFuZC5hcHBlbmRDaGlsZChleHBhbmRDaGlsZCk7XG4gICAgICAgICAgICBzaHJpbmsuYXBwZW5kQ2hpbGQoc2hyaW5rQ2hpbGQpO1xuICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGV4cGFuZCk7XG4gICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoc2hyaW5rKTtcbiAgICAgICAgICAgIGVsZW1lbnQuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcbiAgICAgICAgICAgIGVsZW1lbnQuX2VyZEVsZW1lbnQgPSBjb250YWluZXI7XG5cbiAgICAgICAgICAgIGFkZEV2ZW50KGV4cGFuZCwgXCJzY3JvbGxcIiwgZnVuY3Rpb24gb25GaXJzdEV4cGFuZFNjcm9sbCgpIHtcbiAgICAgICAgICAgICAgICByZW1vdmVFdmVudChleHBhbmQsIFwic2Nyb2xsXCIsIG9uRmlyc3RFeHBhbmRTY3JvbGwpO1xuICAgICAgICAgICAgICAgIHJlYWR5RXhwYW5kU2Nyb2xsID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICByZWFkeSgpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGFkZEV2ZW50KHNocmluaywgXCJzY3JvbGxcIiwgZnVuY3Rpb24gb25GaXJzdFNocmlua1Njcm9sbCgpIHtcbiAgICAgICAgICAgICAgICByZW1vdmVFdmVudChzaHJpbmssIFwic2Nyb2xsXCIsIG9uRmlyc3RTaHJpbmtTY3JvbGwpO1xuICAgICAgICAgICAgICAgIHJlYWR5U2hyaW5rU2Nyb2xsID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICByZWFkeSgpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHVwZGF0ZUNoaWxkU2l6ZXMoZWxlbWVudCwgd2lkdGgsIGhlaWdodCk7XG5cbiAgICAgICAgICAgIHNjcm9sbGJhcnNCYXRjaFVwZGF0ZXIudXBkYXRlKGlkLCBmdW5jdGlvbiBmaW5hbGl6ZSgpIHtcbiAgICAgICAgICAgICAgICBzdG9yZUN1cnJlbnRTaXplKGVsZW1lbnQsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICAgICAgICAgIHBvc2l0aW9uU2Nyb2xsYmFycyhlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgICAgICAgICByZWFkeU92ZXJhbGwgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJlYWR5KCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpZCA9IGlkSGFuZGxlci5nZXQoZWxlbWVudCk7XG5cbiAgICAgICAgaWYoYmF0Y2hVcGRhdGVyKSB7XG4gICAgICAgICAgICBiYXRjaFVwZGF0ZXIudXBkYXRlKGlkLCBtdXRhdGVEb20pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbXV0YXRlRG9tKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRFeHBhbmRFbGVtZW50KGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQuX2VyZEVsZW1lbnQuY2hpbGROb2Rlc1swXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRFeHBhbmRDaGlsZEVsZW1lbnQoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZ2V0RXhwYW5kRWxlbWVudChlbGVtZW50KS5jaGlsZE5vZGVzWzBdO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFNocmlua0VsZW1lbnQoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZWxlbWVudC5fZXJkRWxlbWVudC5jaGlsZE5vZGVzWzFdO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEV4cGFuZFNpemUoc2l6ZSkge1xuICAgICAgICByZXR1cm4gc2l6ZSArIDEwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFNocmlua1NpemUoc2l6ZSkge1xuICAgICAgICByZXR1cm4gc2l6ZSAqIDI7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdXBkYXRlQ2hpbGRTaXplcyhlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICAgIHZhciBleHBhbmRDaGlsZCAgICAgICAgICAgICA9IGdldEV4cGFuZENoaWxkRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgdmFyIGV4cGFuZFdpZHRoICAgICAgICAgICAgID0gZ2V0RXhwYW5kU2l6ZSh3aWR0aCk7XG4gICAgICAgIHZhciBleHBhbmRIZWlnaHQgICAgICAgICAgICA9IGdldEV4cGFuZFNpemUoaGVpZ2h0KTtcbiAgICAgICAgZXhwYW5kQ2hpbGQuc3R5bGUud2lkdGggICAgID0gZXhwYW5kV2lkdGggKyBcInB4XCI7XG4gICAgICAgIGV4cGFuZENoaWxkLnN0eWxlLmhlaWdodCAgICA9IGV4cGFuZEhlaWdodCArIFwicHhcIjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdG9yZUN1cnJlbnRTaXplKGVsZW1lbnQsIHdpZHRoLCBoZWlnaHQpIHtcbiAgICAgICAgZWxlbWVudC5sYXN0V2lkdGggICA9IHdpZHRoO1xuICAgICAgICBlbGVtZW50Lmxhc3RIZWlnaHQgID0gaGVpZ2h0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBvc2l0aW9uU2Nyb2xsYmFycyhlbGVtZW50LCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICAgIHZhciBleHBhbmQgICAgICAgICAgPSBnZXRFeHBhbmRFbGVtZW50KGVsZW1lbnQpO1xuICAgICAgICB2YXIgc2hyaW5rICAgICAgICAgID0gZ2V0U2hyaW5rRWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgdmFyIGV4cGFuZFdpZHRoICAgICA9IGdldEV4cGFuZFNpemUod2lkdGgpO1xuICAgICAgICB2YXIgZXhwYW5kSGVpZ2h0ICAgID0gZ2V0RXhwYW5kU2l6ZShoZWlnaHQpO1xuICAgICAgICB2YXIgc2hyaW5rV2lkdGggICAgID0gZ2V0U2hyaW5rU2l6ZSh3aWR0aCk7XG4gICAgICAgIHZhciBzaHJpbmtIZWlnaHQgICAgPSBnZXRTaHJpbmtTaXplKGhlaWdodCk7XG4gICAgICAgIGV4cGFuZC5zY3JvbGxMZWZ0ICAgPSBleHBhbmRXaWR0aDtcbiAgICAgICAgZXhwYW5kLnNjcm9sbFRvcCAgICA9IGV4cGFuZEhlaWdodDtcbiAgICAgICAgc2hyaW5rLnNjcm9sbExlZnQgICA9IHNocmlua1dpZHRoO1xuICAgICAgICBzaHJpbmsuc2Nyb2xsVG9wICAgID0gc2hyaW5rSGVpZ2h0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGFkZEV2ZW50KGVsLCBuYW1lLCBjYikge1xuICAgICAgICBpZiAoZWwuYXR0YWNoRXZlbnQpIHtcbiAgICAgICAgICAgIGVsLmF0dGFjaEV2ZW50KFwib25cIiArIG5hbWUsIGNiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIobmFtZSwgY2IpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVtb3ZlRXZlbnQoZWwsIG5hbWUsIGNiKSB7XG4gICAgICAgIGlmKGVsLmF0dGFjaEV2ZW50KSB7XG4gICAgICAgICAgICBlbC5kZXRhY2hFdmVudChcIm9uXCIgKyBuYW1lLCBjYik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKG5hbWUsIGNiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIG1ha2VEZXRlY3RhYmxlOiBtYWtlRGV0ZWN0YWJsZSxcbiAgICAgICAgYWRkTGlzdGVuZXI6IGFkZExpc3RlbmVyXG4gICAgfTtcbn07XG5cbmZ1bmN0aW9uIHBhcnNlU2l6ZShzaXplKSB7XG4gICAgcmV0dXJuIHBhcnNlRmxvYXQoc2l6ZS5yZXBsYWNlKC9weC8sIFwiXCIpKTtcbn1cbiIsIi8vSGVhdmlseSBpbnNwaXJlZCBieSBodHRwOi8vd3d3LmJhY2thbGxleWNvZGVyLmNvbS8yMDEzLzAzLzE4L2Nyb3NzLWJyb3dzZXItZXZlbnQtYmFzZWQtZWxlbWVudC1yZXNpemUtZGV0ZWN0aW9uL1xuXG5cInVzZSBzdHJpY3RcIjtcblxudmFyIGZvckVhY2ggICAgICAgICAgICAgICAgID0gcmVxdWlyZShcIi4vY29sbGVjdGlvbi11dGlsc1wiKS5mb3JFYWNoO1xudmFyIGVsZW1lbnRVdGlsc01ha2VyICAgICAgID0gcmVxdWlyZShcIi4vZWxlbWVudC11dGlsc1wiKTtcbnZhciBsaXN0ZW5lckhhbmRsZXJNYWtlciAgICA9IHJlcXVpcmUoXCIuL2xpc3RlbmVyLWhhbmRsZXJcIik7XG52YXIgaWRHZW5lcmF0b3JNYWtlciAgICAgICAgPSByZXF1aXJlKFwiLi9pZC1nZW5lcmF0b3JcIik7XG52YXIgaWRIYW5kbGVyTWFrZXIgICAgICAgICAgPSByZXF1aXJlKFwiLi9pZC1oYW5kbGVyXCIpO1xudmFyIHJlcG9ydGVyTWFrZXIgICAgICAgICAgID0gcmVxdWlyZShcIi4vcmVwb3J0ZXJcIik7XG52YXIgYmF0Y2hVcGRhdGVyTWFrZXIgICAgICAgPSByZXF1aXJlKFwiYmF0Y2gtdXBkYXRlclwiKTtcblxuLy9EZXRlY3Rpb24gc3RyYXRlZ2llcy5cbnZhciBvYmplY3RTdHJhdGVneU1ha2VyICAgICA9IHJlcXVpcmUoXCIuL2RldGVjdGlvbi1zdHJhdGVneS9vYmplY3QuanNcIik7XG52YXIgc2Nyb2xsU3RyYXRlZ3lNYWtlciAgICAgPSByZXF1aXJlKFwiLi9kZXRlY3Rpb24tc3RyYXRlZ3kvc2Nyb2xsLmpzXCIpO1xuXG4vKipcbiAqIEB0eXBlZGVmIGlkSGFuZGxlclxuICogQHR5cGUge29iamVjdH1cbiAqIEBwcm9wZXJ0eSB7ZnVuY3Rpb259IGdldCBHZXRzIHRoZSByZXNpemUgZGV0ZWN0b3IgaWQgb2YgdGhlIGVsZW1lbnQuXG4gKiBAcHJvcGVydHkge2Z1bmN0aW9ufSBzZXQgR2VuZXJhdGUgYW5kIHNldHMgdGhlIHJlc2l6ZSBkZXRlY3RvciBpZCBvZiB0aGUgZWxlbWVudC5cbiAqL1xuXG4vKipcbiAqIEB0eXBlZGVmIE9wdGlvbnNcbiAqIEB0eXBlIHtvYmplY3R9XG4gKiBAcHJvcGVydHkge2Jvb2xlYW59IGNhbGxPbkFkZCAgICBEZXRlcm1pbmVzIGlmIGxpc3RlbmVycyBzaG91bGQgYmUgY2FsbGVkIHdoZW4gdGhleSBhcmUgZ2V0dGluZyBhZGRlZC4gXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBEZWZhdWx0IGlzIHRydWUuIElmIHRydWUsIHRoZSBsaXN0ZW5lciBpcyBndWFyYW50ZWVkIHRvIGJlIGNhbGxlZCB3aGVuIGl0IGhhcyBiZWVuIGFkZGVkLiBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIElmIGZhbHNlLCB0aGUgbGlzdGVuZXIgd2lsbCBub3QgYmUgZ3VhcmVudGVlZCB0byBiZSBjYWxsZWQgd2hlbiBpdCBoYXMgYmVlbiBhZGRlZCAoZG9lcyBub3QgcHJldmVudCBpdCBmcm9tIGJlaW5nIGNhbGxlZCkuXG4gKiBAcHJvcGVydHkge2lkSGFuZGxlcn0gaWRIYW5kbGVyICBBIGN1c3RvbSBpZCBoYW5kbGVyIHRoYXQgaXMgcmVzcG9uc2libGUgZm9yIGdlbmVyYXRpbmcsIHNldHRpbmcgYW5kIHJldHJpZXZpbmcgaWQncyBmb3IgZWxlbWVudHMuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBJZiBub3QgcHJvdmlkZWQsIGEgZGVmYXVsdCBpZCBoYW5kbGVyIHdpbGwgYmUgdXNlZC5cbiAqIEBwcm9wZXJ0eSB7cmVwb3J0ZXJ9IHJlcG9ydGVyICAgIEEgY3VzdG9tIHJlcG9ydGVyIHRoYXQgaGFuZGxlcyByZXBvcnRpbmcgbG9ncywgd2FybmluZ3MgYW5kIGVycm9ycy4gXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBJZiBub3QgcHJvdmlkZWQsIGEgZGVmYXVsdCBpZCBoYW5kbGVyIHdpbGwgYmUgdXNlZC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIElmIHNldCB0byBmYWxzZSwgdGhlbiBub3RoaW5nIHdpbGwgYmUgcmVwb3J0ZWQuXG4gKi9cblxuLyoqXG4gKiBDcmVhdGVzIGFuIGVsZW1lbnQgcmVzaXplIGRldGVjdG9yIGluc3RhbmNlLlxuICogQHB1YmxpY1xuICogQHBhcmFtIHtPcHRpb25zP30gb3B0aW9ucyBPcHRpb25hbCBnbG9iYWwgb3B0aW9ucyBvYmplY3QgdGhhdCB3aWxsIGRlY2lkZSBob3cgdGhpcyBpbnN0YW5jZSB3aWxsIHdvcmsuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgLy9pZEhhbmRsZXIgaXMgY3VycmVudGx5IG5vdCBhbiBvcHRpb24gdG8gdGhlIGxpc3RlblRvIGZ1bmN0aW9uLCBzbyBpdCBzaG91bGQgbm90IGJlIGFkZGVkIHRvIGdsb2JhbE9wdGlvbnMuXG4gICAgdmFyIGlkSGFuZGxlciA9IG9wdGlvbnMuaWRIYW5kbGVyO1xuXG4gICAgaWYoIWlkSGFuZGxlcikge1xuICAgICAgICB2YXIgaWRHZW5lcmF0b3IgPSBpZEdlbmVyYXRvck1ha2VyKCk7XG4gICAgICAgIHZhciBkZWZhdWx0SWRIYW5kbGVyID0gaWRIYW5kbGVyTWFrZXIoaWRHZW5lcmF0b3IpO1xuICAgICAgICBpZEhhbmRsZXIgPSBkZWZhdWx0SWRIYW5kbGVyO1xuICAgIH1cblxuICAgIC8vcmVwb3J0ZXIgaXMgY3VycmVudGx5IG5vdCBhbiBvcHRpb24gdG8gdGhlIGxpc3RlblRvIGZ1bmN0aW9uLCBzbyBpdCBzaG91bGQgbm90IGJlIGFkZGVkIHRvIGdsb2JhbE9wdGlvbnMuXG4gICAgdmFyIHJlcG9ydGVyID0gb3B0aW9ucy5yZXBvcnRlcjtcblxuICAgIGlmKCFyZXBvcnRlcikge1xuICAgICAgICAvL0lmIG9wdGlvbnMucmVwb3J0ZXIgaXMgZmFsc2UsIHRoZW4gdGhlIHJlcG9ydGVyIHNob3VsZCBiZSBxdWlldC5cbiAgICAgICAgdmFyIHF1aWV0ID0gcmVwb3J0ZXIgPT09IGZhbHNlO1xuICAgICAgICByZXBvcnRlciA9IHJlcG9ydGVyTWFrZXIocXVpZXQpO1xuICAgIH1cblxuICAgIC8vYmF0Y2hVcGRhdGVyIGlzIGN1cnJlbnRseSBub3QgYW4gb3B0aW9uIHRvIHRoZSBsaXN0ZW5UbyBmdW5jdGlvbiwgc28gaXQgc2hvdWxkIG5vdCBiZSBhZGRlZCB0byBnbG9iYWxPcHRpb25zLlxuICAgIHZhciBiYXRjaFVwZGF0ZXIgPSBnZXRPcHRpb24ob3B0aW9ucywgXCJiYXRjaFVwZGF0ZXJcIiwgYmF0Y2hVcGRhdGVyTWFrZXIoeyByZXBvcnRlcjogcmVwb3J0ZXIgfSkpO1xuXG4gICAgLy9PcHRpb25zIHRvIGJlIHVzZWQgYXMgZGVmYXVsdCBmb3IgdGhlIGxpc3RlblRvIGZ1bmN0aW9uLlxuICAgIHZhciBnbG9iYWxPcHRpb25zID0ge307XG4gICAgZ2xvYmFsT3B0aW9ucy5jYWxsT25BZGQgICAgID0gISFnZXRPcHRpb24ob3B0aW9ucywgXCJjYWxsT25BZGRcIiwgdHJ1ZSk7XG5cbiAgICB2YXIgZXZlbnRMaXN0ZW5lckhhbmRsZXIgICAgPSBsaXN0ZW5lckhhbmRsZXJNYWtlcihpZEhhbmRsZXIpO1xuICAgIHZhciBlbGVtZW50VXRpbHMgICAgICAgICAgICA9IGVsZW1lbnRVdGlsc01ha2VyKCk7XG5cbiAgICAvL1RoZSBkZXRlY3Rpb24gc3RyYXRlZ3kgdG8gYmUgdXNlZC5cbiAgICB2YXIgZGV0ZWN0aW9uU3RyYXRlZ3k7XG4gICAgdmFyIGRlc2lyZWRTdHJhdGVneSA9IGdldE9wdGlvbihvcHRpb25zLCBcInN0cmF0ZWd5XCIsIFwib2JqZWN0XCIpO1xuICAgIHZhciBzdHJhdGVneU9wdGlvbnMgPSB7XG4gICAgICAgIGlkSGFuZGxlcjogaWRIYW5kbGVyLFxuICAgICAgICByZXBvcnRlcjogcmVwb3J0ZXIsXG4gICAgICAgIGJhdGNoVXBkYXRlcjogYmF0Y2hVcGRhdGVyXG4gICAgfTtcblxuICAgIGlmKGRlc2lyZWRTdHJhdGVneSA9PT0gXCJzY3JvbGxcIikge1xuICAgICAgICBkZXRlY3Rpb25TdHJhdGVneSA9IHNjcm9sbFN0cmF0ZWd5TWFrZXIoc3RyYXRlZ3lPcHRpb25zKTtcbiAgICB9IGVsc2UgaWYoZGVzaXJlZFN0cmF0ZWd5ID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIGRldGVjdGlvblN0cmF0ZWd5ID0gb2JqZWN0U3RyYXRlZ3lNYWtlcihzdHJhdGVneU9wdGlvbnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgc3RyYXRlZ3kgbmFtZTogXCIgKyBkZXNpcmVkU3RyYXRlZ3kpO1xuICAgIH1cblxuICAgIC8vQ2FsbHMgY2FuIGJlIG1hZGUgdG8gbGlzdGVuVG8gd2l0aCBlbGVtZW50cyB0aGF0IGFyZSBzdGlsbCBhcmUgYmVpbmcgaW5zdGFsbGVkLlxuICAgIC8vQWxzbywgc2FtZSBlbGVtZW50cyBjYW4gb2NjdXIgaW4gdGhlIGVsZW1lbnRzIGxpc3QgaW4gdGhlIGxpc3RlblRvIGZ1bmN0aW9uLlxuICAgIC8vV2l0aCB0aGlzIG1hcCwgdGhlIHJlYWR5IGNhbGxiYWNrcyBjYW4gYmUgc3luY2hyb25pemVkIGJldHdlZW4gdGhlIGNhbGxzXG4gICAgLy9zbyB0aGF0IHRoZSByZWFkeSBjYWxsYmFjayBjYW4gYWx3YXlzIGJlIGNhbGxlZCB3aGVuIGFuIGVsZW1lbnQgaXMgcmVhZHkgLSBldmVuIGlmXG4gICAgLy9pdCB3YXNuJ3QgaW5zdGFsbGVkIGZyb20gdGhlIGZ1bmN0aW9uIGludHNlbGYuXG4gICAgdmFyIG9uUmVhZHlDYWxsYmFja3MgPSB7fTtcblxuICAgIC8qKlxuICAgICAqIE1ha2VzIHRoZSBnaXZlbiBlbGVtZW50cyByZXNpemUtZGV0ZWN0YWJsZSBhbmQgc3RhcnRzIGxpc3RlbmluZyB0byByZXNpemUgZXZlbnRzIG9uIHRoZSBlbGVtZW50cy4gQ2FsbHMgdGhlIGV2ZW50IGNhbGxiYWNrIGZvciBlYWNoIGV2ZW50IGZvciBlYWNoIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7T3B0aW9ucz99IG9wdGlvbnMgT3B0aW9uYWwgb3B0aW9ucyBvYmplY3QuIFRoZXNlIG9wdGlvbnMgd2lsbCBvdmVycmlkZSB0aGUgZ2xvYmFsIG9wdGlvbnMuIFNvbWUgb3B0aW9ucyBtYXkgbm90IGJlIG92ZXJyaWRlbiwgc3VjaCBhcyBpZEhhbmRsZXIuXG4gICAgICogQHBhcmFtIHtlbGVtZW50W118ZWxlbWVudH0gZWxlbWVudHMgVGhlIGdpdmVuIGFycmF5IG9mIGVsZW1lbnRzIHRvIGRldGVjdCByZXNpemUgZXZlbnRzIG9mLiBTaW5nbGUgZWxlbWVudCBpcyBhbHNvIHZhbGlkLlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGxpc3RlbmVyIFRoZSBjYWxsYmFjayB0byBiZSBleGVjdXRlZCBmb3IgZWFjaCByZXNpemUgZXZlbnQgZm9yIGVhY2ggZWxlbWVudC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBsaXN0ZW5UbyhvcHRpb25zLCBlbGVtZW50cywgbGlzdGVuZXIpIHtcbiAgICAgICAgZnVuY3Rpb24gb25SZXNpemVDYWxsYmFjayhlbGVtZW50KSB7XG4gICAgICAgICAgICB2YXIgbGlzdGVuZXJzID0gZXZlbnRMaXN0ZW5lckhhbmRsZXIuZ2V0KGVsZW1lbnQpO1xuXG4gICAgICAgICAgICBmb3JFYWNoKGxpc3RlbmVycywgZnVuY3Rpb24gY2FsbExpc3RlbmVyUHJveHkobGlzdGVuZXIpIHtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcihlbGVtZW50KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkTGlzdGVuZXIoY2FsbE9uQWRkLCBlbGVtZW50LCBsaXN0ZW5lcikge1xuICAgICAgICAgICAgZXZlbnRMaXN0ZW5lckhhbmRsZXIuYWRkKGVsZW1lbnQsIGxpc3RlbmVyKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYoY2FsbE9uQWRkKSB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIoZWxlbWVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvL09wdGlvbnMgb2JqZWN0IG1heSBiZSBvbWl0dGVkLlxuICAgICAgICBpZighbGlzdGVuZXIpIHtcbiAgICAgICAgICAgIGxpc3RlbmVyID0gZWxlbWVudHM7XG4gICAgICAgICAgICBlbGVtZW50cyA9IG9wdGlvbnM7XG4gICAgICAgICAgICBvcHRpb25zID0ge307XG4gICAgICAgIH1cblxuICAgICAgICBpZighZWxlbWVudHMpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkF0IGxlYXN0IG9uZSBlbGVtZW50IHJlcXVpcmVkLlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCFsaXN0ZW5lcikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTGlzdGVuZXIgcmVxdWlyZWQuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoZWxlbWVudHMubGVuZ3RoID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGVsZW1lbnRzID0gW2VsZW1lbnRzXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBlbGVtZW50c1JlYWR5ID0gMDtcblxuICAgICAgICB2YXIgY2FsbE9uQWRkID0gZ2V0T3B0aW9uKG9wdGlvbnMsIFwiY2FsbE9uQWRkXCIsIGdsb2JhbE9wdGlvbnMuY2FsbE9uQWRkKTtcbiAgICAgICAgdmFyIG9uUmVhZHlDYWxsYmFjayA9IGdldE9wdGlvbihvcHRpb25zLCBcIm9uUmVhZHlcIiwgZnVuY3Rpb24gbm9vcCgpIHt9KTtcblxuICAgICAgICBmb3JFYWNoKGVsZW1lbnRzLCBmdW5jdGlvbiBhdHRhY2hMaXN0ZW5lclRvRWxlbWVudChlbGVtZW50KSB7XG4gICAgICAgICAgICBpZighZWxlbWVudFV0aWxzLmlzRGV0ZWN0YWJsZShlbGVtZW50KSkge1xuICAgICAgICAgICAgICAgIGlmKGVsZW1lbnRVdGlscy5pc0J1c3koZWxlbWVudCkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy9UaGUgZWxlbWVudCBpcyBiZWluZyBwcmVwYXJlZCB0byBiZSBkZXRlY3RhYmxlLiBEbyBub3QgbWFrZSBpdCBkZXRlY3RhYmxlLlxuICAgICAgICAgICAgICAgICAgICAvL0p1c3QgYWRkIHRoZSBsaXN0ZW5lciwgYmVjYXVzZSB0aGUgZWxlbWVudCB3aWxsIHNvb24gYmUgZGV0ZWN0YWJsZS5cbiAgICAgICAgICAgICAgICAgICAgYWRkTGlzdGVuZXIoY2FsbE9uQWRkLCBlbGVtZW50LCBsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgICAgIHZhciBpZCA9IGlkSGFuZGxlci5nZXQoZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgIG9uUmVhZHlDYWxsYmFja3NbaWRdID0gb25SZWFkeUNhbGxiYWNrc1tpZF0gfHwgW107XG4gICAgICAgICAgICAgICAgICAgIG9uUmVhZHlDYWxsYmFja3NbaWRdLnB1c2goZnVuY3Rpb24gb25SZWFkeSgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzUmVhZHkrKztcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoZWxlbWVudHNSZWFkeSA9PT0gZWxlbWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb25SZWFkeUNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy9UaGUgZWxlbWVudCBpcyBub3QgcHJlcGFyZWQgdG8gYmUgZGV0ZWN0YWJsZSwgc28gZG8gcHJlcGFyZSBpdCBhbmQgYWRkIGEgbGlzdGVuZXIgdG8gaXQuXG4gICAgICAgICAgICAgICAgZWxlbWVudFV0aWxzLm1hcmtCdXN5KGVsZW1lbnQsIHRydWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiBkZXRlY3Rpb25TdHJhdGVneS5tYWtlRGV0ZWN0YWJsZShlbGVtZW50LCBmdW5jdGlvbiBvbkVsZW1lbnREZXRlY3RhYmxlKGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudFV0aWxzLm1hcmtBc0RldGVjdGFibGUoZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRVdGlscy5tYXJrQnVzeShlbGVtZW50LCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgIGRldGVjdGlvblN0cmF0ZWd5LmFkZExpc3RlbmVyKGVsZW1lbnQsIG9uUmVzaXplQ2FsbGJhY2spO1xuICAgICAgICAgICAgICAgICAgICBhZGRMaXN0ZW5lcihjYWxsT25BZGQsIGVsZW1lbnQsIGxpc3RlbmVyKTtcblxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50c1JlYWR5Kys7XG4gICAgICAgICAgICAgICAgICAgIGlmKGVsZW1lbnRzUmVhZHkgPT09IGVsZW1lbnRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgb25SZWFkeUNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB2YXIgaWQgPSBpZEhhbmRsZXIuZ2V0KGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgICAgICBpZihvblJlYWR5Q2FsbGJhY2tzW2lkXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yRWFjaChvblJlYWR5Q2FsbGJhY2tzW2lkXSwgZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgb25SZWFkeUNhbGxiYWNrc1tpZF07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy9UaGUgZWxlbWVudCBoYXMgYmVlbiBwcmVwYXJlZCB0byBiZSBkZXRlY3RhYmxlIGFuZCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCB0by5cbiAgICAgICAgICAgIGFkZExpc3RlbmVyKGNhbGxPbkFkZCwgZWxlbWVudCwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgZWxlbWVudHNSZWFkeSsrO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZihlbGVtZW50c1JlYWR5ID09PSBlbGVtZW50cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIG9uUmVhZHlDYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgbGlzdGVuVG86IGxpc3RlblRvXG4gICAgfTtcbn07XG5cbmZ1bmN0aW9uIGdldE9wdGlvbihvcHRpb25zLCBuYW1lLCBkZWZhdWx0VmFsdWUpIHtcbiAgICB2YXIgdmFsdWUgPSBvcHRpb25zW25hbWVdO1xuXG4gICAgaWYoKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpICYmIGRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0VmFsdWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHZhbHVlO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgLyoqXG4gICAgICogVGVsbHMgaWYgdGhlIGVsZW1lbnQgaGFzIGJlZW4gbWFkZSBkZXRlY3RhYmxlIGFuZCByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGV2ZW50cy5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBUaGUgZWxlbWVudCB0byBjaGVjay5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBvciBmYWxzZSBkZXBlbmRpbmcgb24gaWYgdGhlIGVsZW1lbnQgaXMgZGV0ZWN0YWJsZSBvciBub3QuXG4gICAgICovXG4gICAgZnVuY3Rpb24gaXNEZXRlY3RhYmxlKGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuICEhZWxlbWVudC5fZXJkSXNEZXRlY3RhYmxlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1hcmtzIHRoZSBlbGVtZW50IHRoYXQgaXQgaGFzIGJlZW4gbWFkZSBkZXRlY3RhYmxlIGFuZCByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGV2ZW50cy5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBUaGUgZWxlbWVudCB0byBtYXJrLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIG1hcmtBc0RldGVjdGFibGUoZWxlbWVudCkge1xuICAgICAgICBlbGVtZW50Ll9lcmRJc0RldGVjdGFibGUgPSB0cnVlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRlbGxzIGlmIHRoZSBlbGVtZW50IGlzIGJ1c3kgb3Igbm90LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IFRoZSBlbGVtZW50IHRvIGNoZWNrLlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIG9yIGZhbHNlIGRlcGVuZGluZyBvbiBpZiB0aGUgZWxlbWVudCBpcyBidXN5IG9yIG5vdC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpc0J1c3koZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gISFlbGVtZW50Ll9lcmRCdXN5O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1hcmtzIHRoZSBvYmplY3QgaXMgYnVzeSBhbmQgc2hvdWxkIG5vdCBiZSBtYWRlIGRldGVjdGFibGUuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0byBtYXJrLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gYnVzeSBJZiB0aGUgZWxlbWVudCBpcyBidXN5IG9yIG5vdC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBtYXJrQnVzeShlbGVtZW50LCBidXN5KSB7XG4gICAgICAgIGVsZW1lbnQuX2VyZEJ1c3kgPSAhIWJ1c3k7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgaXNEZXRlY3RhYmxlOiBpc0RldGVjdGFibGUsXG4gICAgICAgIG1hcmtBc0RldGVjdGFibGU6IG1hcmtBc0RldGVjdGFibGUsXG4gICAgICAgIGlzQnVzeTogaXNCdXN5LFxuICAgICAgICBtYXJrQnVzeTogbWFya0J1c3lcbiAgICB9O1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBpZENvdW50ID0gMTtcblxuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlcyBhIG5ldyB1bmlxdWUgaWQgaW4gdGhlIGNvbnRleHQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9IEEgdW5pcXVlIGlkIGluIHRoZSBjb250ZXh0LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdlbmVyYXRlKCkge1xuICAgICAgICByZXR1cm4gaWRDb3VudCsrO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGdlbmVyYXRlOiBnZW5lcmF0ZVxuICAgIH07XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oaWRHZW5lcmF0b3IpIHtcbiAgICB2YXIgSURfUFJPUF9OQU1FID0gXCJfZXJkVGFyZ2V0SWRcIjtcblxuICAgIC8qKlxuICAgICAqIEdldHMgdGhlIHJlc2l6ZSBkZXRlY3RvciBpZCBvZiB0aGUgZWxlbWVudC4gSWYgdGhlIGVsZW1lbnQgZG9lcyBub3QgaGF2ZSBhbiBpZCwgb25lIHdpbGwgYmUgYXNzaWduZWQgdG8gdGhlIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgdGFyZ2V0IGVsZW1lbnQgdG8gZ2V0IHRoZSBpZCBvZi5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW4/fSByZWFkb25seSBBbiBpZCB3aWxsIG5vdCBiZSBhc3NpZ25lZCB0byB0aGUgZWxlbWVudCBpZiB0aGUgcmVhZG9ubHkgcGFyYW1ldGVyIGlzIHRydWUuIERlZmF1bHQgaXMgZmFsc2UuXG4gICAgICogQHJldHVybnMge3N0cmluZ3xudW1iZXJ9IFRoZSBpZCBvZiB0aGUgZWxlbWVudC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRJZChlbGVtZW50LCByZWFkb25seSkge1xuICAgICAgICBpZighcmVhZG9ubHkgJiYgIWhhc0lkKGVsZW1lbnQpKSB7XG4gICAgICAgICAgICBzZXRJZChlbGVtZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBlbGVtZW50W0lEX1BST1BfTkFNRV07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0SWQoZWxlbWVudCkge1xuICAgICAgICB2YXIgaWQgPSBpZEdlbmVyYXRvci5nZW5lcmF0ZSgpO1xuXG4gICAgICAgIGVsZW1lbnRbSURfUFJPUF9OQU1FXSA9IGlkO1xuXG4gICAgICAgIHJldHVybiBpZDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBoYXNJZChlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50W0lEX1BST1BfTkFNRV0gIT09IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBnZXQ6IGdldElkXG4gICAgfTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihpZEhhbmRsZXIpIHtcbiAgICB2YXIgZXZlbnRMaXN0ZW5lcnMgPSB7fTtcblxuICAgIC8qKlxuICAgICAqIEdldHMgYWxsIGxpc3RlbmVycyBmb3IgdGhlIGdpdmVuIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0byBnZXQgYWxsIGxpc3RlbmVycyBmb3IuXG4gICAgICogQHJldHVybnMgQWxsIGxpc3RlbmVycyBmb3IgdGhlIGdpdmVuIGVsZW1lbnQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0TGlzdGVuZXJzKGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGV2ZW50TGlzdGVuZXJzW2lkSGFuZGxlci5nZXQoZWxlbWVudCldO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN0b3JlcyB0aGUgZ2l2ZW4gbGlzdGVuZXIgZm9yIHRoZSBnaXZlbiBlbGVtZW50LiBXaWxsIG5vdCBhY3R1YWxseSBhZGQgdGhlIGxpc3RlbmVyIHRvIHRoZSBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdGhhdCBzaG91bGQgaGF2ZSB0aGUgbGlzdGVuZXIgYWRkZWQuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gbGlzdGVuZXIgVGhlIGNhbGxiYWNrIHRoYXQgdGhlIGVsZW1lbnQgaGFzIGFkZGVkLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGFkZExpc3RlbmVyKGVsZW1lbnQsIGxpc3RlbmVyKSB7XG4gICAgICAgIHZhciBpZCA9IGlkSGFuZGxlci5nZXQoZWxlbWVudCk7XG5cbiAgICAgICAgaWYoIWV2ZW50TGlzdGVuZXJzW2lkXSkge1xuICAgICAgICAgICAgZXZlbnRMaXN0ZW5lcnNbaWRdID0gW107XG4gICAgICAgIH1cblxuICAgICAgICBldmVudExpc3RlbmVyc1tpZF0ucHVzaChsaXN0ZW5lcik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ2V0OiBnZXRMaXN0ZW5lcnMsXG4gICAgICAgIGFkZDogYWRkTGlzdGVuZXJcbiAgICB9O1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG4vKiBnbG9iYWwgY29uc29sZTogZmFsc2UgKi9cblxuLyoqXG4gKiBSZXBvcnRlciB0aGF0IGhhbmRsZXMgdGhlIHJlcG9ydGluZyBvZiBsb2dzLCB3YXJuaW5ncyBhbmQgZXJyb3JzLlxuICogQHB1YmxpY1xuICogQHBhcmFtIHtib29sZWFufSBxdWlldCBUZWxscyBpZiB0aGUgcmVwb3J0ZXIgc2hvdWxkIGJlIHF1aWV0IG9yIG5vdC5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihxdWlldCkge1xuICAgIGZ1bmN0aW9uIG5vb3AoKSB7XG4gICAgICAgIC8vRG9lcyBub3RoaW5nLlxuICAgIH1cblxuICAgIHZhciByZXBvcnRlciA9IHtcbiAgICAgICAgbG9nOiBub29wLFxuICAgICAgICB3YXJuOiBub29wLFxuICAgICAgICBlcnJvcjogbm9vcFxuICAgIH07XG5cbiAgICBpZighcXVpZXQgJiYgd2luZG93LmNvbnNvbGUpIHtcbiAgICAgICAgdmFyIGF0dGFjaEZ1bmN0aW9uID0gZnVuY3Rpb24ocmVwb3J0ZXIsIG5hbWUpIHtcbiAgICAgICAgICAgIC8vVGhlIHByb3h5IGlzIG5lZWRlZCB0byBiZSBhYmxlIHRvIGNhbGwgdGhlIG1ldGhvZCB3aXRoIHRoZSBjb25zb2xlIGNvbnRleHQsXG4gICAgICAgICAgICAvL3NpbmNlIHdlIGNhbm5vdCB1c2UgYmluZC5cbiAgICAgICAgICAgIHJlcG9ydGVyW25hbWVdID0gZnVuY3Rpb24gcmVwb3J0ZXJQcm94eSgpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlW25hbWVdLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9O1xuXG4gICAgICAgIGF0dGFjaEZ1bmN0aW9uKHJlcG9ydGVyLCBcImxvZ1wiKTtcbiAgICAgICAgYXR0YWNoRnVuY3Rpb24ocmVwb3J0ZXIsIFwid2FyblwiKTtcbiAgICAgICAgYXR0YWNoRnVuY3Rpb24ocmVwb3J0ZXIsIFwiZXJyb3JcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcG9ydGVyO1xufTsiXX0=
