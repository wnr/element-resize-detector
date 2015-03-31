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

    return {
        update: queueUpdate,
        force: forceUpdateBatch
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
//Heavily inspired by http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/

"use strict";

var forEach = require("./collection-utils").forEach;
var elementUtilsMaker = require("./element-utils");
var listenerHandlerMaker = require("./listener-handler");
var idGeneratorMaker = require("./id-generator");
var idHandlerMaker = require("./id-handler");
var reporterMaker = require("./reporter");
var batchUpdater = require("batch-updater");

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

    //Options to be used as default for the listenTo function.
    var globalOptions = {};
    globalOptions.callOnAdd     = !!getOption(options, "callOnAdd", true);
    globalOptions.batchUpdater  = getOption(options, "batchUpdater", batchUpdater({ reporter: reporter }));

    var eventListenerHandler = listenerHandlerMaker(idHandler);
    var elementUtils = elementUtilsMaker(idHandler);

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

        function onElementReadyToAddListener(callOnAdd, element, listener) {
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

        var callOnAdd       = getOption(options, "callOnAdd", globalOptions.callOnAdd);
        var batchUpdater    = getOption(options, "batchUpdater", globalOptions.batchUpdater);

        forEach(elements, function attachListenerToElement(element) {
            if(!elementUtils.isDetectable(element)) {
                //The element is not prepared to be detectable, so do prepare it and add a listener to it.
                return elementUtils.makeDetectable(batchUpdater, reporter, element, function onElementDetectable(element) {
                    elementUtils.addListener(element, onResizeCallback);
                    onElementReadyToAddListener(callOnAdd, element, listener);
                });
            }
            
            //The element has been prepared to be detectable and is ready to be listened to.
            onElementReadyToAddListener(callOnAdd, element, listener);
        });
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

},{"./collection-utils":4,"./element-utils":6,"./id-generator":7,"./id-handler":8,"./listener-handler":9,"./reporter":10,"batch-updater":1}],6:[function(require,module,exports){
"use strict";

var forEach = require("./collection-utils").forEach;
var browserDetector = require("./browser-detector");

module.exports = function(idHandler) {
    /**
     * Tells if the element has been made detectable and ready to be listened for resize events.
     * @public
     * @param {element} The element to check.
     * @returns {boolean} True or false depending on if the element is detectable or not.
     */
    function isDetectable(element) {
        if(browserDetector.isIE(8)) {
            //IE 8 does not use the object method.
            //Check only if the element has been given an id.
            return !!idHandler.get(element);
        }

        return !!getObject(element);
    }

    /**
     * Adds a resize event listener to the element.
     * @public
     * @param {element} element The element that should have the listener added.
     * @param {function} listener The listener callback to be called for each resize event of the element. The element will be given as a parameter to the listener callback.
     */
    function addListener(element, listener) {
        if(!isDetectable(element)) {
            throw new Error("Element is not detectable.");
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
    function makeDetectable(batchUpdater, reporter, element, callback) {
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

                var objectElement = this;

                objectElement.style.cssText = OBJECT_STYLE;

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

        //Create an unique erd-target-id for the target element, so that event listeners can be identified to this element.
        var id = idHandler.set(element);

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
        isDetectable: isDetectable,
        makeDetectable: makeDetectable,
        addListener: addListener,
    };
};

},{"./browser-detector":3,"./collection-utils":4}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
"use strict";

module.exports = function(idGenerator) {
    var ID_PROP_NAME = "_erdTargetId";

    /**
     * Gets the resize detector id of the element.
     * @public
     * @param {element} The target element to get the id of.
     * @returns {string|number} The id of the element.
     */
    function getId(element) {
        return element[ID_PROP_NAME];
    }

    /**
     * Sets the resize detector id of the element.
     * @public
     * @param {element} The target element to set the id to.
     * @param {string?} An optional id to set to the element. If not specified, an id will be generated. All id's must be unique.
     * @returns {string|number} The id of the element.
     */
    function setId(element, id) {
        if(!id && id !== 0) {
            //Number should be generated.
            id = idGenerator.generate();
        }

        element[ID_PROP_NAME] = id;

        return id;
    }

    return {
        get: getId,
        set: setId
    };
};

},{}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
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
},{}]},{},[5])(5)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYmF0Y2gtdXBkYXRlci9zcmMvYmF0Y2gtdXBkYXRlci5qcyIsIm5vZGVfbW9kdWxlcy9iYXRjaC11cGRhdGVyL3NyYy91dGlscy5qcyIsInNyYy9icm93c2VyLWRldGVjdG9yLmpzIiwic3JjL2NvbGxlY3Rpb24tdXRpbHMuanMiLCJzcmMvZWxlbWVudC1yZXNpemUtZGV0ZWN0b3IuanMiLCJzcmMvZWxlbWVudC11dGlscy5qcyIsInNyYy9pZC1nZW5lcmF0b3IuanMiLCJzcmMvaWQtaGFuZGxlci5qcyIsInNyYy9saXN0ZW5lci1oYW5kbGVyLmpzIiwic3JjL3JlcG9ydGVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBiYXRjaFVwZGF0ZXJNYWtlcihvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICB2YXIgcmVwb3J0ZXIgICAgPSBvcHRpb25zLnJlcG9ydGVyO1xuICAgIHZhciBhc3luYyAgICAgICA9IHV0aWxzLmdldE9wdGlvbihvcHRpb25zLCBcImFzeW5jXCIsIHRydWUpO1xuICAgIHZhciBhdXRvVXBkYXRlICA9IHV0aWxzLmdldE9wdGlvbihvcHRpb25zLCBcImF1dG9cIiwgdHJ1ZSk7XG5cbiAgICBpZihhdXRvVXBkYXRlICYmICFhc3luYykge1xuICAgICAgICByZXBvcnRlci53YXJuKFwiSW52YWxpZCBvcHRpb25zIGNvbWJpbmF0aW9uLiBhdXRvPXRydWUgYW5kIGFzeW5jPWZhbHNlIGlzIGludmFsaWQuIFNldHRpbmcgYXN5bmM9dHJ1ZS5cIik7XG4gICAgICAgIGFzeW5jID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZighcmVwb3J0ZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUmVwb3J0ZXIgcmVxdWlyZWQuXCIpO1xuICAgIH1cblxuICAgIHZhciBiYXRjaFNpemUgPSAwO1xuICAgIHZhciBiYXRjaCA9IHt9O1xuICAgIHZhciBoYW5kbGVyO1xuXG4gICAgZnVuY3Rpb24gcXVldWVVcGRhdGUoZWxlbWVudCwgdXBkYXRlcikge1xuICAgICAgICBpZihhdXRvVXBkYXRlICYmIGFzeW5jICYmIGJhdGNoU2l6ZSA9PT0gMCkge1xuICAgICAgICAgICAgdXBkYXRlQmF0Y2hBc3luYygpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIWJhdGNoW2VsZW1lbnRdKSB7XG4gICAgICAgICAgICBiYXRjaFtlbGVtZW50XSA9IFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgYmF0Y2hbZWxlbWVudF0ucHVzaCh1cGRhdGVyKTtcbiAgICAgICAgYmF0Y2hTaXplKys7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZm9yY2VVcGRhdGVCYXRjaCh1cGRhdGVBc3luYykge1xuICAgICAgICBpZih1cGRhdGVBc3luYyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB1cGRhdGVBc3luYyA9IGFzeW5jO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoaGFuZGxlcikge1xuICAgICAgICAgICAgY2FuY2VsRnJhbWUoaGFuZGxlcik7XG4gICAgICAgICAgICBoYW5kbGVyID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGFzeW5jKSB7XG4gICAgICAgICAgICB1cGRhdGVCYXRjaEFzeW5jKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1cGRhdGVCYXRjaCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdXBkYXRlQmF0Y2goKSB7XG4gICAgICAgIGZvcih2YXIgZWxlbWVudCBpbiBiYXRjaCkge1xuICAgICAgICAgICAgaWYoYmF0Y2guaGFzT3duUHJvcGVydHkoZWxlbWVudCkpIHtcbiAgICAgICAgICAgICAgICB2YXIgdXBkYXRlcnMgPSBiYXRjaFtlbGVtZW50XTtcblxuICAgICAgICAgICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCB1cGRhdGVycy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdXBkYXRlciA9IHVwZGF0ZXJzW2ldO1xuICAgICAgICAgICAgICAgICAgICB1cGRhdGVyKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNsZWFyQmF0Y2goKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB1cGRhdGVCYXRjaEFzeW5jKCkge1xuICAgICAgICBoYW5kbGVyID0gcmVxdWVzdEZyYW1lKGZ1bmN0aW9uIHBlcmZvcm1VcGRhdGUoKSB7XG4gICAgICAgICAgICB1cGRhdGVCYXRjaCgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjbGVhckJhdGNoKCkge1xuICAgICAgICBiYXRjaFNpemUgPSAwO1xuICAgICAgICBiYXRjaCA9IHt9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNhbmNlbEZyYW1lKGxpc3RlbmVyKSB7XG4gICAgICAgIC8vIHZhciBjYW5jZWwgPSB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUgfHwgd2luZG93Lm1vekNhbmNlbEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy53ZWJraXRDYW5jZWxBbmltYXRpb25GcmFtZSB8fCB3aW5kb3cuY2xlYXJUaW1lb3V0O1xuICAgICAgICB2YXIgY2FuY2VsID0gd2luZG93LmNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNhbmNlbChsaXN0ZW5lcik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVxdWVzdEZyYW1lKGNhbGxiYWNrKSB7XG4gICAgICAgIC8vIHZhciByYWYgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHwgd2luZG93LndlYmtpdFJlcXVlc3RBbmltYXRpb25GcmFtZSB8fCBmdW5jdGlvbihmbikgeyByZXR1cm4gd2luZG93LnNldFRpbWVvdXQoZm4sIDIwKTsgfTtcbiAgICAgICAgdmFyIHJhZiA9IGZ1bmN0aW9uKGZuKSB7IHJldHVybiB3aW5kb3cuc2V0VGltZW91dChmbiwgMCk7IH07XG4gICAgICAgIHJldHVybiByYWYoY2FsbGJhY2spO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIHVwZGF0ZTogcXVldWVVcGRhdGUsXG4gICAgICAgIGZvcmNlOiBmb3JjZVVwZGF0ZUJhdGNoXG4gICAgfTtcbn07IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbnV0aWxzLmdldE9wdGlvbiA9IGdldE9wdGlvbjtcblxuZnVuY3Rpb24gZ2V0T3B0aW9uKG9wdGlvbnMsIG5hbWUsIGRlZmF1bHRWYWx1ZSkge1xuICAgIHZhciB2YWx1ZSA9IG9wdGlvbnNbbmFtZV07XG5cbiAgICBpZigodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkgJiYgZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdmFsdWU7XG59XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGRldGVjdG9yID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuZGV0ZWN0b3IuaXNJRSA9IGZ1bmN0aW9uKHZlcnNpb24pIHtcbiAgICBmdW5jdGlvbiBpc0FueUllVmVyc2lvbigpIHtcbiAgICAgICAgdmFyIGFnZW50ID0gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICByZXR1cm4gYWdlbnQuaW5kZXhPZihcIm1zaWVcIikgIT09IC0xIHx8IGFnZW50LmluZGV4T2YoXCJ0cmlkZW50XCIpICE9PSAtMTtcbiAgICB9XG5cbiAgICBpZighaXNBbnlJZVZlcnNpb24oKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYoIXZlcnNpb24pIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy9TaGFtZWxlc3NseSBzdG9sZW4gZnJvbSBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9wYWRvbHNleS81Mjc2ODNcbiAgICB2YXIgaWVWZXJzaW9uID0gKGZ1bmN0aW9uKCl7XG4gICAgICAgIHZhciB1bmRlZixcbiAgICAgICAgICAgIHYgPSAzLFxuICAgICAgICAgICAgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSxcbiAgICAgICAgICAgIGFsbCA9IGRpdi5nZXRFbGVtZW50c0J5VGFnTmFtZShcImlcIik7XG5cbiAgICAgICAgZG8ge1xuICAgICAgICAgICAgZGl2LmlubmVySFRNTCA9IFwiPCEtLVtpZiBndCBJRSBcIiArICgrK3YpICsgXCJdPjxpPjwvaT48IVtlbmRpZl0tLT5cIjtcbiAgICAgICAgfVxuICAgICAgICB3aGlsZSAoYWxsWzBdKTtcblxuICAgICAgICByZXR1cm4gdiA+IDQgPyB2IDogdW5kZWY7XG4gICAgfSgpKTtcblxuICAgIHJldHVybiB2ZXJzaW9uID09PSBpZVZlcnNpb247XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB1dGlscyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8qKlxuICogTG9vcHMgdGhyb3VnaCB0aGUgY29sbGVjdGlvbiBhbmQgY2FsbHMgdGhlIGNhbGxiYWNrIGZvciBlYWNoIGVsZW1lbnQuIGlmIHRoZSBjYWxsYmFjayByZXR1cm5zIHRydXRoeSwgdGhlIGxvb3AgaXMgYnJva2VuIGFuZCByZXR1cm5zIHRoZSBzYW1lIHZhbHVlLlxuICogQHB1YmxpY1xuICogQHBhcmFtIHsqfSBjb2xsZWN0aW9uIFRoZSBjb2xsZWN0aW9uIHRvIGxvb3AgdGhyb3VnaC4gTmVlZHMgdG8gaGF2ZSBhIGxlbmd0aCBwcm9wZXJ0eSBzZXQgYW5kIGhhdmUgaW5kaWNlcyBzZXQgZnJvbSAwIHRvIGxlbmd0aCAtIDEuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIGZvciBlYWNoIGVsZW1lbnQuIFRoZSBlbGVtZW50IHdpbGwgYmUgZ2l2ZW4gYXMgYSBwYXJhbWV0ZXIgdG8gdGhlIGNhbGxiYWNrLiBJZiB0aGlzIGNhbGxiYWNrIHJldHVybnMgdHJ1dGh5LCB0aGUgbG9vcCBpcyBicm9rZW4gYW5kIHRoZSBzYW1lIHZhbHVlIGlzIHJldHVybmVkLlxuICogQHJldHVybnMgeyp9IFRoZSB2YWx1ZSB0aGF0IGEgY2FsbGJhY2sgaGFzIHJldHVybmVkIChpZiB0cnV0aHkpLiBPdGhlcndpc2Ugbm90aGluZy5cbiAqL1xudXRpbHMuZm9yRWFjaCA9IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIGNhbGxiYWNrKSB7XG4gICAgZm9yKHZhciBpID0gMDsgaSA8IGNvbGxlY3Rpb24ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9IGNhbGxiYWNrKGNvbGxlY3Rpb25baV0pO1xuICAgICAgICBpZihyZXN1bHQpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICB9XG59O1xuIiwiLy9IZWF2aWx5IGluc3BpcmVkIGJ5IGh0dHA6Ly93d3cuYmFja2FsbGV5Y29kZXIuY29tLzIwMTMvMDMvMTgvY3Jvc3MtYnJvd3Nlci1ldmVudC1iYXNlZC1lbGVtZW50LXJlc2l6ZS1kZXRlY3Rpb24vXG5cblwidXNlIHN0cmljdFwiO1xuXG52YXIgZm9yRWFjaCA9IHJlcXVpcmUoXCIuL2NvbGxlY3Rpb24tdXRpbHNcIikuZm9yRWFjaDtcbnZhciBlbGVtZW50VXRpbHNNYWtlciA9IHJlcXVpcmUoXCIuL2VsZW1lbnQtdXRpbHNcIik7XG52YXIgbGlzdGVuZXJIYW5kbGVyTWFrZXIgPSByZXF1aXJlKFwiLi9saXN0ZW5lci1oYW5kbGVyXCIpO1xudmFyIGlkR2VuZXJhdG9yTWFrZXIgPSByZXF1aXJlKFwiLi9pZC1nZW5lcmF0b3JcIik7XG52YXIgaWRIYW5kbGVyTWFrZXIgPSByZXF1aXJlKFwiLi9pZC1oYW5kbGVyXCIpO1xudmFyIHJlcG9ydGVyTWFrZXIgPSByZXF1aXJlKFwiLi9yZXBvcnRlclwiKTtcbnZhciBiYXRjaFVwZGF0ZXIgPSByZXF1aXJlKFwiYmF0Y2gtdXBkYXRlclwiKTtcblxuLyoqXG4gKiBAdHlwZWRlZiBpZEhhbmRsZXJcbiAqIEB0eXBlIHtvYmplY3R9XG4gKiBAcHJvcGVydHkge2Z1bmN0aW9ufSBnZXQgR2V0cyB0aGUgcmVzaXplIGRldGVjdG9yIGlkIG9mIHRoZSBlbGVtZW50LlxuICogQHByb3BlcnR5IHtmdW5jdGlvbn0gc2V0IEdlbmVyYXRlIGFuZCBzZXRzIHRoZSByZXNpemUgZGV0ZWN0b3IgaWQgb2YgdGhlIGVsZW1lbnQuXG4gKi9cblxuLyoqXG4gKiBAdHlwZWRlZiBPcHRpb25zXG4gKiBAdHlwZSB7b2JqZWN0fVxuICogQHByb3BlcnR5IHtib29sZWFufSBjYWxsT25BZGQgICAgRGV0ZXJtaW5lcyBpZiBsaXN0ZW5lcnMgc2hvdWxkIGJlIGNhbGxlZCB3aGVuIHRoZXkgYXJlIGdldHRpbmcgYWRkZWQuIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgRGVmYXVsdCBpcyB0cnVlLiBJZiB0cnVlLCB0aGUgbGlzdGVuZXIgaXMgZ3VhcmFudGVlZCB0byBiZSBjYWxsZWQgd2hlbiBpdCBoYXMgYmVlbiBhZGRlZC4gXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBJZiBmYWxzZSwgdGhlIGxpc3RlbmVyIHdpbGwgbm90IGJlIGd1YXJlbnRlZWQgdG8gYmUgY2FsbGVkIHdoZW4gaXQgaGFzIGJlZW4gYWRkZWQgKGRvZXMgbm90IHByZXZlbnQgaXQgZnJvbSBiZWluZyBjYWxsZWQpLlxuICogQHByb3BlcnR5IHtpZEhhbmRsZXJ9IGlkSGFuZGxlciAgQSBjdXN0b20gaWQgaGFuZGxlciB0aGF0IGlzIHJlc3BvbnNpYmxlIGZvciBnZW5lcmF0aW5nLCBzZXR0aW5nIGFuZCByZXRyaWV2aW5nIGlkJ3MgZm9yIGVsZW1lbnRzLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSWYgbm90IHByb3ZpZGVkLCBhIGRlZmF1bHQgaWQgaGFuZGxlciB3aWxsIGJlIHVzZWQuXG4gKiBAcHJvcGVydHkge3JlcG9ydGVyfSByZXBvcnRlciAgICBBIGN1c3RvbSByZXBvcnRlciB0aGF0IGhhbmRsZXMgcmVwb3J0aW5nIGxvZ3MsIHdhcm5pbmdzIGFuZCBlcnJvcnMuIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSWYgbm90IHByb3ZpZGVkLCBhIGRlZmF1bHQgaWQgaGFuZGxlciB3aWxsIGJlIHVzZWQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBJZiBzZXQgdG8gZmFsc2UsIHRoZW4gbm90aGluZyB3aWxsIGJlIHJlcG9ydGVkLlxuICovXG5cbi8qKlxuICogQ3JlYXRlcyBhbiBlbGVtZW50IHJlc2l6ZSBkZXRlY3RvciBpbnN0YW5jZS5cbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSB7T3B0aW9ucz99IG9wdGlvbnMgT3B0aW9uYWwgZ2xvYmFsIG9wdGlvbnMgb2JqZWN0IHRoYXQgd2lsbCBkZWNpZGUgaG93IHRoaXMgaW5zdGFuY2Ugd2lsbCB3b3JrLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgIC8vaWRIYW5kbGVyIGlzIGN1cnJlbnRseSBub3QgYW4gb3B0aW9uIHRvIHRoZSBsaXN0ZW5UbyBmdW5jdGlvbiwgc28gaXQgc2hvdWxkIG5vdCBiZSBhZGRlZCB0byBnbG9iYWxPcHRpb25zLlxuICAgIHZhciBpZEhhbmRsZXIgPSBvcHRpb25zLmlkSGFuZGxlcjtcblxuICAgIGlmKCFpZEhhbmRsZXIpIHtcbiAgICAgICAgdmFyIGlkR2VuZXJhdG9yID0gaWRHZW5lcmF0b3JNYWtlcigpO1xuICAgICAgICB2YXIgZGVmYXVsdElkSGFuZGxlciA9IGlkSGFuZGxlck1ha2VyKGlkR2VuZXJhdG9yKTtcbiAgICAgICAgaWRIYW5kbGVyID0gZGVmYXVsdElkSGFuZGxlcjtcbiAgICB9XG5cbiAgICAvL3JlcG9ydGVyIGlzIGN1cnJlbnRseSBub3QgYW4gb3B0aW9uIHRvIHRoZSBsaXN0ZW5UbyBmdW5jdGlvbiwgc28gaXQgc2hvdWxkIG5vdCBiZSBhZGRlZCB0byBnbG9iYWxPcHRpb25zLlxuICAgIHZhciByZXBvcnRlciA9IG9wdGlvbnMucmVwb3J0ZXI7XG5cbiAgICBpZighcmVwb3J0ZXIpIHtcbiAgICAgICAgLy9JZiBvcHRpb25zLnJlcG9ydGVyIGlzIGZhbHNlLCB0aGVuIHRoZSByZXBvcnRlciBzaG91bGQgYmUgcXVpZXQuXG4gICAgICAgIHZhciBxdWlldCA9IHJlcG9ydGVyID09PSBmYWxzZTtcbiAgICAgICAgcmVwb3J0ZXIgPSByZXBvcnRlck1ha2VyKHF1aWV0KTtcbiAgICB9XG5cbiAgICAvL09wdGlvbnMgdG8gYmUgdXNlZCBhcyBkZWZhdWx0IGZvciB0aGUgbGlzdGVuVG8gZnVuY3Rpb24uXG4gICAgdmFyIGdsb2JhbE9wdGlvbnMgPSB7fTtcbiAgICBnbG9iYWxPcHRpb25zLmNhbGxPbkFkZCAgICAgPSAhIWdldE9wdGlvbihvcHRpb25zLCBcImNhbGxPbkFkZFwiLCB0cnVlKTtcbiAgICBnbG9iYWxPcHRpb25zLmJhdGNoVXBkYXRlciAgPSBnZXRPcHRpb24ob3B0aW9ucywgXCJiYXRjaFVwZGF0ZXJcIiwgYmF0Y2hVcGRhdGVyKHsgcmVwb3J0ZXI6IHJlcG9ydGVyIH0pKTtcblxuICAgIHZhciBldmVudExpc3RlbmVySGFuZGxlciA9IGxpc3RlbmVySGFuZGxlck1ha2VyKGlkSGFuZGxlcik7XG4gICAgdmFyIGVsZW1lbnRVdGlscyA9IGVsZW1lbnRVdGlsc01ha2VyKGlkSGFuZGxlcik7XG5cbiAgICAvKipcbiAgICAgKiBNYWtlcyB0aGUgZ2l2ZW4gZWxlbWVudHMgcmVzaXplLWRldGVjdGFibGUgYW5kIHN0YXJ0cyBsaXN0ZW5pbmcgdG8gcmVzaXplIGV2ZW50cyBvbiB0aGUgZWxlbWVudHMuIENhbGxzIHRoZSBldmVudCBjYWxsYmFjayBmb3IgZWFjaCBldmVudCBmb3IgZWFjaCBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge09wdGlvbnM/fSBvcHRpb25zIE9wdGlvbmFsIG9wdGlvbnMgb2JqZWN0LiBUaGVzZSBvcHRpb25zIHdpbGwgb3ZlcnJpZGUgdGhlIGdsb2JhbCBvcHRpb25zLiBTb21lIG9wdGlvbnMgbWF5IG5vdCBiZSBvdmVycmlkZW4sIHN1Y2ggYXMgaWRIYW5kbGVyLlxuICAgICAqIEBwYXJhbSB7ZWxlbWVudFtdfGVsZW1lbnR9IGVsZW1lbnRzIFRoZSBnaXZlbiBhcnJheSBvZiBlbGVtZW50cyB0byBkZXRlY3QgcmVzaXplIGV2ZW50cyBvZi4gU2luZ2xlIGVsZW1lbnQgaXMgYWxzbyB2YWxpZC5cbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBsaXN0ZW5lciBUaGUgY2FsbGJhY2sgdG8gYmUgZXhlY3V0ZWQgZm9yIGVhY2ggcmVzaXplIGV2ZW50IGZvciBlYWNoIGVsZW1lbnQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbGlzdGVuVG8ob3B0aW9ucywgZWxlbWVudHMsIGxpc3RlbmVyKSB7XG4gICAgICAgIGZ1bmN0aW9uIG9uUmVzaXplQ2FsbGJhY2soZWxlbWVudCkge1xuICAgICAgICAgICAgdmFyIGxpc3RlbmVycyA9IGV2ZW50TGlzdGVuZXJIYW5kbGVyLmdldChlbGVtZW50KTtcblxuICAgICAgICAgICAgZm9yRWFjaChsaXN0ZW5lcnMsIGZ1bmN0aW9uIGNhbGxMaXN0ZW5lclByb3h5KGxpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIoZWxlbWVudCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG9uRWxlbWVudFJlYWR5VG9BZGRMaXN0ZW5lcihjYWxsT25BZGQsIGVsZW1lbnQsIGxpc3RlbmVyKSB7XG4gICAgICAgICAgICBldmVudExpc3RlbmVySGFuZGxlci5hZGQoZWxlbWVudCwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZihjYWxsT25BZGQpIHtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcihlbGVtZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vT3B0aW9ucyBvYmplY3QgbWF5IGJlIG9taXR0ZWQuXG4gICAgICAgIGlmKCFsaXN0ZW5lcikge1xuICAgICAgICAgICAgbGlzdGVuZXIgPSBlbGVtZW50cztcbiAgICAgICAgICAgIGVsZW1lbnRzID0gb3B0aW9ucztcbiAgICAgICAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCFlbGVtZW50cykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQXQgbGVhc3Qgb25lIGVsZW1lbnQgcmVxdWlyZWQuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIWxpc3RlbmVyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJMaXN0ZW5lciByZXF1aXJlZC5cIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZihlbGVtZW50cy5sZW5ndGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgZWxlbWVudHMgPSBbZWxlbWVudHNdO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGNhbGxPbkFkZCAgICAgICA9IGdldE9wdGlvbihvcHRpb25zLCBcImNhbGxPbkFkZFwiLCBnbG9iYWxPcHRpb25zLmNhbGxPbkFkZCk7XG4gICAgICAgIHZhciBiYXRjaFVwZGF0ZXIgICAgPSBnZXRPcHRpb24ob3B0aW9ucywgXCJiYXRjaFVwZGF0ZXJcIiwgZ2xvYmFsT3B0aW9ucy5iYXRjaFVwZGF0ZXIpO1xuXG4gICAgICAgIGZvckVhY2goZWxlbWVudHMsIGZ1bmN0aW9uIGF0dGFjaExpc3RlbmVyVG9FbGVtZW50KGVsZW1lbnQpIHtcbiAgICAgICAgICAgIGlmKCFlbGVtZW50VXRpbHMuaXNEZXRlY3RhYmxlKGVsZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgLy9UaGUgZWxlbWVudCBpcyBub3QgcHJlcGFyZWQgdG8gYmUgZGV0ZWN0YWJsZSwgc28gZG8gcHJlcGFyZSBpdCBhbmQgYWRkIGEgbGlzdGVuZXIgdG8gaXQuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnRVdGlscy5tYWtlRGV0ZWN0YWJsZShiYXRjaFVwZGF0ZXIsIHJlcG9ydGVyLCBlbGVtZW50LCBmdW5jdGlvbiBvbkVsZW1lbnREZXRlY3RhYmxlKGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudFV0aWxzLmFkZExpc3RlbmVyKGVsZW1lbnQsIG9uUmVzaXplQ2FsbGJhY2spO1xuICAgICAgICAgICAgICAgICAgICBvbkVsZW1lbnRSZWFkeVRvQWRkTGlzdGVuZXIoY2FsbE9uQWRkLCBlbGVtZW50LCBsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vVGhlIGVsZW1lbnQgaGFzIGJlZW4gcHJlcGFyZWQgdG8gYmUgZGV0ZWN0YWJsZSBhbmQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgdG8uXG4gICAgICAgICAgICBvbkVsZW1lbnRSZWFkeVRvQWRkTGlzdGVuZXIoY2FsbE9uQWRkLCBlbGVtZW50LCBsaXN0ZW5lcik7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGxpc3RlblRvOiBsaXN0ZW5Ub1xuICAgIH07XG59O1xuXG5mdW5jdGlvbiBnZXRPcHRpb24ob3B0aW9ucywgbmFtZSwgZGVmYXVsdFZhbHVlKSB7XG4gICAgdmFyIHZhbHVlID0gb3B0aW9uc1tuYW1lXTtcblxuICAgIGlmKCh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSAmJiBkZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gZGVmYXVsdFZhbHVlO1xuICAgIH1cblxuICAgIHJldHVybiB2YWx1ZTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZm9yRWFjaCA9IHJlcXVpcmUoXCIuL2NvbGxlY3Rpb24tdXRpbHNcIikuZm9yRWFjaDtcbnZhciBicm93c2VyRGV0ZWN0b3IgPSByZXF1aXJlKFwiLi9icm93c2VyLWRldGVjdG9yXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGlkSGFuZGxlcikge1xuICAgIC8qKlxuICAgICAqIFRlbGxzIGlmIHRoZSBlbGVtZW50IGhhcyBiZWVuIG1hZGUgZGV0ZWN0YWJsZSBhbmQgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBldmVudHMuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gVGhlIGVsZW1lbnQgdG8gY2hlY2suXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgb3IgZmFsc2UgZGVwZW5kaW5nIG9uIGlmIHRoZSBlbGVtZW50IGlzIGRldGVjdGFibGUgb3Igbm90LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzRGV0ZWN0YWJsZShlbGVtZW50KSB7XG4gICAgICAgIGlmKGJyb3dzZXJEZXRlY3Rvci5pc0lFKDgpKSB7XG4gICAgICAgICAgICAvL0lFIDggZG9lcyBub3QgdXNlIHRoZSBvYmplY3QgbWV0aG9kLlxuICAgICAgICAgICAgLy9DaGVjayBvbmx5IGlmIHRoZSBlbGVtZW50IGhhcyBiZWVuIGdpdmVuIGFuIGlkLlxuICAgICAgICAgICAgcmV0dXJuICEhaWRIYW5kbGVyLmdldChlbGVtZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAhIWdldE9iamVjdChlbGVtZW50KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgcmVzaXplIGV2ZW50IGxpc3RlbmVyIHRvIHRoZSBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdGhhdCBzaG91bGQgaGF2ZSB0aGUgbGlzdGVuZXIgYWRkZWQuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gbGlzdGVuZXIgVGhlIGxpc3RlbmVyIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCBmb3IgZWFjaCByZXNpemUgZXZlbnQgb2YgdGhlIGVsZW1lbnQuIFRoZSBlbGVtZW50IHdpbGwgYmUgZ2l2ZW4gYXMgYSBwYXJhbWV0ZXIgdG8gdGhlIGxpc3RlbmVyIGNhbGxiYWNrLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGFkZExpc3RlbmVyKGVsZW1lbnQsIGxpc3RlbmVyKSB7XG4gICAgICAgIGlmKCFpc0RldGVjdGFibGUoZWxlbWVudCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkVsZW1lbnQgaXMgbm90IGRldGVjdGFibGUuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gbGlzdGVuZXJQcm94eSgpIHtcbiAgICAgICAgICAgIGxpc3RlbmVyKGVsZW1lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoYnJvd3NlckRldGVjdG9yLmlzSUUoOCkpIHtcbiAgICAgICAgICAgIC8vSUUgOCBkb2VzIG5vdCBzdXBwb3J0IG9iamVjdCwgYnV0IHN1cHBvcnRzIHRoZSByZXNpemUgZXZlbnQgZGlyZWN0bHkgb24gZWxlbWVudHMuXG4gICAgICAgICAgICBlbGVtZW50LmF0dGFjaEV2ZW50KFwib25yZXNpemVcIiwgbGlzdGVuZXJQcm94eSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgb2JqZWN0ID0gZ2V0T2JqZWN0KGVsZW1lbnQpO1xuICAgICAgICAgICAgb2JqZWN0LmNvbnRlbnREb2N1bWVudC5kZWZhdWx0Vmlldy5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIGxpc3RlbmVyUHJveHkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWFrZXMgYW4gZWxlbWVudCBkZXRlY3RhYmxlIGFuZCByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGV2ZW50cy4gV2lsbCBjYWxsIHRoZSBjYWxsYmFjayB3aGVuIHRoZSBlbGVtZW50IGlzIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgY2hhbmdlcy5cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0byBtYWtlIGRldGVjdGFibGVcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIHdoZW4gdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBjaGFuZ2VzLiBXaWxsIGJlIGNhbGxlZCB3aXRoIHRoZSBlbGVtZW50IGFzIGZpcnN0IHBhcmFtZXRlci5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBtYWtlRGV0ZWN0YWJsZShiYXRjaFVwZGF0ZXIsIHJlcG9ydGVyLCBlbGVtZW50LCBjYWxsYmFjaykge1xuICAgICAgICBmdW5jdGlvbiBpbmplY3RPYmplY3QoaWQsIGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICB2YXIgT0JKRUNUX1NUWUxFID0gXCJkaXNwbGF5OiBibG9jazsgcG9zaXRpb246IGFic29sdXRlOyB0b3A6IDA7IGxlZnQ6IDA7IHdpZHRoOiAxMDAlOyBoZWlnaHQ6IDEwMCU7IGJvcmRlcjogbm9uZTsgcGFkZGluZzogMDsgbWFyZ2luOiAwOyBvcGFjaXR5OiAwOyB6LWluZGV4OiAtMTAwMDsgcG9pbnRlci1ldmVudHM6IG5vbmU7XCI7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIG9uT2JqZWN0TG9hZCgpIHtcbiAgICAgICAgICAgICAgICAvKmpzaGludCB2YWxpZHRoaXM6IHRydWUgKi9cblxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGdldERvY3VtZW50KGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vT3BlcmEgMTIgc2VlbSB0byBjYWxsIHRoZSBvYmplY3Qub25sb2FkIGJlZm9yZSB0aGUgYWN0dWFsIGRvY3VtZW50IGhhcyBiZWVuIGNyZWF0ZWQuXG4gICAgICAgICAgICAgICAgICAgIC8vU28gaWYgaXQgaXMgbm90IHByZXNlbnQsIHBvbGwgaXQgd2l0aCBhbiB0aW1lb3V0IHVudGlsIGl0IGlzIHByZXNlbnQuXG4gICAgICAgICAgICAgICAgICAgIC8vVE9ETzogQ291bGQgbWF5YmUgYmUgaGFuZGxlZCBiZXR0ZXIgd2l0aCBvYmplY3Qub25yZWFkeXN0YXRlY2hhbmdlIG9yIHNpbWlsYXIuXG4gICAgICAgICAgICAgICAgICAgIGlmKCFlbGVtZW50LmNvbnRlbnREb2N1bWVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiBjaGVja0Zvck9iamVjdERvY3VtZW50KCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdldERvY3VtZW50KGVsZW1lbnQsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIDEwMCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVsZW1lbnQuY29udGVudERvY3VtZW50KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB2YXIgb2JqZWN0RWxlbWVudCA9IHRoaXM7XG5cbiAgICAgICAgICAgICAgICBvYmplY3RFbGVtZW50LnN0eWxlLmNzc1RleHQgPSBPQkpFQ1RfU1RZTEU7XG5cbiAgICAgICAgICAgICAgICAvL0NyZWF0ZSB0aGUgc3R5bGUgZWxlbWVudCB0byBiZSBhZGRlZCB0byB0aGUgb2JqZWN0LlxuICAgICAgICAgICAgICAgIGdldERvY3VtZW50KG9iamVjdEVsZW1lbnQsIGZ1bmN0aW9uIG9uT2JqZWN0RG9jdW1lbnRSZWFkeShvYmplY3REb2N1bWVudCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3R5bGUgPSBvYmplY3REb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gICAgICAgICAgICAgICAgICAgIHN0eWxlLmlubmVySFRNTCA9IFwiaHRtbCwgYm9keSB7IG1hcmdpbjogMDsgcGFkZGluZzogMCB9IGRpdiB7IC13ZWJraXQtdHJhbnNpdGlvbjogb3BhY2l0eSAwLjAxczsgLW1zLXRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IC1vLXRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IHRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IG9wYWNpdHk6IDA7IH1cIjtcblxuICAgICAgICAgICAgICAgICAgICAvL1RPRE86IFJlbW92ZSBhbnkgc3R5bGVzIHRoYXQgaGFzIGJlZW4gc2V0IG9uIHRoZSBvYmplY3QuIE9ubHkgdGhlIHN0eWxlIGFib3ZlIHNob3VsZCBiZSBzdHlsaW5nIHRoZSBvYmplY3QuXG5cbiAgICAgICAgICAgICAgICAgICAgLy9BcHBlbmQgdGhlIHN0eWxlIHRvIHRoZSBvYmplY3QuXG4gICAgICAgICAgICAgICAgICAgIG9iamVjdERvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vTm90aWZ5IHRoYXQgdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgdG8uXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL1RoZSB0YXJnZXQgZWxlbWVudCBuZWVkcyB0byBiZSBwb3NpdGlvbmVkIChldmVyeXRoaW5nIGV4Y2VwdCBzdGF0aWMpIHNvIHRoZSBhYnNvbHV0ZSBwb3NpdGlvbmVkIG9iamVjdCB3aWxsIGJlIHBvc2l0aW9uZWQgcmVsYXRpdmUgdG8gdGhlIHRhcmdldCBlbGVtZW50LlxuICAgICAgICAgICAgdmFyIHN0eWxlID0gZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcbiAgICAgICAgICAgIHZhciBwb3NpdGlvbiA9IHN0eWxlLnBvc2l0aW9uO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBtdXRhdGVEb20oKSB7XG4gICAgICAgICAgICAgICAgaWYocG9zaXRpb24gPT09IFwic3RhdGljXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9IFwicmVsYXRpdmVcIjtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgcmVtb3ZlUmVsYXRpdmVTdHlsZXMgPSBmdW5jdGlvbihyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIHByb3BlcnR5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBnZXROdW1lcmljYWxWYWx1ZSh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bXi1cXGRcXC5dL2csIFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSBzdHlsZVtwcm9wZXJ0eV07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKHZhbHVlICE9PSBcImF1dG9cIiAmJiBnZXROdW1lcmljYWxWYWx1ZSh2YWx1ZSkgIT09IFwiMFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0ZXIud2FybihcIkFuIGVsZW1lbnQgdGhhdCBpcyBwb3NpdGlvbmVkIHN0YXRpYyBoYXMgc3R5bGUuXCIgKyBwcm9wZXJ0eSArIFwiPVwiICsgdmFsdWUgKyBcIiB3aGljaCBpcyBpZ25vcmVkIGR1ZSB0byB0aGUgc3RhdGljIHBvc2l0aW9uaW5nLiBUaGUgZWxlbWVudCB3aWxsIG5lZWQgdG8gYmUgcG9zaXRpb25lZCByZWxhdGl2ZSwgc28gdGhlIHN0eWxlLlwiICsgcHJvcGVydHkgKyBcIiB3aWxsIGJlIHNldCB0byAwLiBFbGVtZW50OiBcIiwgZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZVtwcm9wZXJ0eV0gPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIC8vQ2hlY2sgc28gdGhhdCB0aGVyZSBhcmUgbm8gYWNjaWRlbnRhbCBzdHlsZXMgdGhhdCB3aWxsIG1ha2UgdGhlIGVsZW1lbnQgc3R5bGVkIGRpZmZlcmVudGx5IG5vdyB0aGF0IGlzIGlzIHJlbGF0aXZlLlxuICAgICAgICAgICAgICAgICAgICAvL0lmIHRoZXJlIGFyZSBhbnksIHNldCB0aGVtIHRvIDAgKHRoaXMgc2hvdWxkIGJlIG9rYXkgd2l0aCB0aGUgdXNlciBzaW5jZSB0aGUgc3R5bGUgcHJvcGVydGllcyBkaWQgbm90aGluZyBiZWZvcmUgW3NpbmNlIHRoZSBlbGVtZW50IHdhcyBwb3NpdGlvbmVkIHN0YXRpY10gYW55d2F5KS5cbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIHN0eWxlLCBcInRvcFwiKTtcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlUmVsYXRpdmVTdHlsZXMocmVwb3J0ZXIsIGVsZW1lbnQsIHN0eWxlLCBcInJpZ2h0XCIpO1xuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIFwiYm90dG9tXCIpO1xuICAgICAgICAgICAgICAgICAgICByZW1vdmVSZWxhdGl2ZVN0eWxlcyhyZXBvcnRlciwgZWxlbWVudCwgc3R5bGUsIFwibGVmdFwiKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvL0FkZCBhbiBvYmplY3QgZWxlbWVudCBhcyBhIGNoaWxkIHRvIHRoZSB0YXJnZXQgZWxlbWVudCB0aGF0IHdpbGwgYmUgbGlzdGVuZWQgdG8gZm9yIHJlc2l6ZSBldmVudHMuXG4gICAgICAgICAgICAgICAgdmFyIG9iamVjdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJvYmplY3RcIik7XG4gICAgICAgICAgICAgICAgb2JqZWN0LnR5cGUgPSBcInRleHQvaHRtbFwiO1xuICAgICAgICAgICAgICAgIG9iamVjdC5vbmxvYWQgPSBvbk9iamVjdExvYWQ7XG4gICAgICAgICAgICAgICAgb2JqZWN0Ll9lcmRPYmplY3RJZCA9IGlkO1xuXG4gICAgICAgICAgICAgICAgLy9TYWZhcmk6IFRoaXMgbXVzdCBvY2N1ciBiZWZvcmUgYWRkaW5nIHRoZSBvYmplY3QgdG8gdGhlIERPTS5cbiAgICAgICAgICAgICAgICAvL0lFOiBEb2VzIG5vdCBsaWtlIHRoYXQgdGhpcyBoYXBwZW5zIGJlZm9yZSwgZXZlbiBpZiBpdCBpcyBhbHNvIGFkZGVkIGFmdGVyLlxuICAgICAgICAgICAgICAgIGlmKCFicm93c2VyRGV0ZWN0b3IuaXNJRSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIG9iamVjdC5kYXRhID0gXCJhYm91dDpibGFua1wiO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGVsZW1lbnQuYXBwZW5kQ2hpbGQob2JqZWN0KTtcblxuICAgICAgICAgICAgICAgIC8vSUU6IFRoaXMgbXVzdCBvY2N1ciBhZnRlciBhZGRpbmcgdGhlIG9iamVjdCB0byB0aGUgRE9NLlxuICAgICAgICAgICAgICAgIGlmKGJyb3dzZXJEZXRlY3Rvci5pc0lFKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgb2JqZWN0LmRhdGEgPSBcImFib3V0OmJsYW5rXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZihiYXRjaFVwZGF0ZXIpIHtcbiAgICAgICAgICAgICAgICBiYXRjaFVwZGF0ZXIudXBkYXRlKGlkLCBtdXRhdGVEb20pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtdXRhdGVEb20oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vQ3JlYXRlIGFuIHVuaXF1ZSBlcmQtdGFyZ2V0LWlkIGZvciB0aGUgdGFyZ2V0IGVsZW1lbnQsIHNvIHRoYXQgZXZlbnQgbGlzdGVuZXJzIGNhbiBiZSBpZGVudGlmaWVkIHRvIHRoaXMgZWxlbWVudC5cbiAgICAgICAgdmFyIGlkID0gaWRIYW5kbGVyLnNldChlbGVtZW50KTtcblxuICAgICAgICBpZihicm93c2VyRGV0ZWN0b3IuaXNJRSg4KSkge1xuICAgICAgICAgICAgLy9JRSA4IGRvZXMgbm90IHN1cHBvcnQgb2JqZWN0cyBwcm9wZXJseS4gTHVja2lseSB0aGV5IGRvIHN1cHBvcnQgdGhlIHJlc2l6ZSBldmVudC5cbiAgICAgICAgICAgIC8vU28gZG8gbm90IGluamVjdCB0aGUgb2JqZWN0IGFuZCBub3RpZnkgdGhhdCB0aGUgZWxlbWVudCBpcyBhbHJlYWR5IHJlYWR5IHRvIGJlIGxpc3RlbmVkIHRvLlxuICAgICAgICAgICAgLy9UaGUgZXZlbnQgaGFuZGxlciBmb3IgdGhlIHJlc2l6ZSBldmVudCBpcyBhdHRhY2hlZCBpbiB0aGUgdXRpbHMuYWRkTGlzdGVuZXIgaW5zdGVhZC5cbiAgICAgICAgICAgIGNhbGxiYWNrKGVsZW1lbnQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaW5qZWN0T2JqZWN0KGlkLCBlbGVtZW50LCBjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjaGlsZCBvYmplY3Qgb2YgdGhlIHRhcmdldCBlbGVtZW50LlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSB0YXJnZXQgZWxlbWVudC5cbiAgICAgKiBAcmV0dXJucyBUaGUgb2JqZWN0IGVsZW1lbnQgb2YgdGhlIHRhcmdldC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRPYmplY3QoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZm9yRWFjaChlbGVtZW50LmNoaWxkcmVuLCBmdW5jdGlvbiBpc09iamVjdChjaGlsZCkge1xuICAgICAgICAgICAgaWYoY2hpbGQuX2VyZE9iamVjdElkICE9PSB1bmRlZmluZWQgJiYgY2hpbGQuX2VyZE9iamVjdElkICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNoaWxkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBpc0RldGVjdGFibGU6IGlzRGV0ZWN0YWJsZSxcbiAgICAgICAgbWFrZURldGVjdGFibGU6IG1ha2VEZXRlY3RhYmxlLFxuICAgICAgICBhZGRMaXN0ZW5lcjogYWRkTGlzdGVuZXIsXG4gICAgfTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgaWRDb3VudCA9IDE7XG5cbiAgICAvKipcbiAgICAgKiBHZW5lcmF0ZXMgYSBuZXcgdW5pcXVlIGlkIGluIHRoZSBjb250ZXh0LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSBBIHVuaXF1ZSBpZCBpbiB0aGUgY29udGV4dC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZW5lcmF0ZSgpIHtcbiAgICAgICAgcmV0dXJuIGlkQ291bnQrKztcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBnZW5lcmF0ZTogZ2VuZXJhdGVcbiAgICB9O1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGlkR2VuZXJhdG9yKSB7XG4gICAgdmFyIElEX1BST1BfTkFNRSA9IFwiX2VyZFRhcmdldElkXCI7XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSByZXNpemUgZGV0ZWN0b3IgaWQgb2YgdGhlIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gVGhlIHRhcmdldCBlbGVtZW50IHRvIGdldCB0aGUgaWQgb2YuXG4gICAgICogQHJldHVybnMge3N0cmluZ3xudW1iZXJ9IFRoZSBpZCBvZiB0aGUgZWxlbWVudC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRJZChlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50W0lEX1BST1BfTkFNRV07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgcmVzaXplIGRldGVjdG9yIGlkIG9mIHRoZSBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IFRoZSB0YXJnZXQgZWxlbWVudCB0byBzZXQgdGhlIGlkIHRvLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nP30gQW4gb3B0aW9uYWwgaWQgdG8gc2V0IHRvIHRoZSBlbGVtZW50LiBJZiBub3Qgc3BlY2lmaWVkLCBhbiBpZCB3aWxsIGJlIGdlbmVyYXRlZC4gQWxsIGlkJ3MgbXVzdCBiZSB1bmlxdWUuXG4gICAgICogQHJldHVybnMge3N0cmluZ3xudW1iZXJ9IFRoZSBpZCBvZiB0aGUgZWxlbWVudC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBzZXRJZChlbGVtZW50LCBpZCkge1xuICAgICAgICBpZighaWQgJiYgaWQgIT09IDApIHtcbiAgICAgICAgICAgIC8vTnVtYmVyIHNob3VsZCBiZSBnZW5lcmF0ZWQuXG4gICAgICAgICAgICBpZCA9IGlkR2VuZXJhdG9yLmdlbmVyYXRlKCk7XG4gICAgICAgIH1cblxuICAgICAgICBlbGVtZW50W0lEX1BST1BfTkFNRV0gPSBpZDtcblxuICAgICAgICByZXR1cm4gaWQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ2V0OiBnZXRJZCxcbiAgICAgICAgc2V0OiBzZXRJZFxuICAgIH07XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oaWRIYW5kbGVyKSB7XG4gICAgdmFyIGV2ZW50TGlzdGVuZXJzID0ge307XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIGFsbCBsaXN0ZW5lcnMgZm9yIHRoZSBnaXZlbiBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdG8gZ2V0IGFsbCBsaXN0ZW5lcnMgZm9yLlxuICAgICAqIEByZXR1cm5zIEFsbCBsaXN0ZW5lcnMgZm9yIHRoZSBnaXZlbiBlbGVtZW50LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldExpc3RlbmVycyhlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBldmVudExpc3RlbmVyc1tpZEhhbmRsZXIuZ2V0KGVsZW1lbnQpXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdG9yZXMgdGhlIGdpdmVuIGxpc3RlbmVyIGZvciB0aGUgZ2l2ZW4gZWxlbWVudC4gV2lsbCBub3QgYWN0dWFsbHkgYWRkIHRoZSBsaXN0ZW5lciB0byB0aGUgZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRoYXQgc2hvdWxkIGhhdmUgdGhlIGxpc3RlbmVyIGFkZGVkLlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGxpc3RlbmVyIFRoZSBjYWxsYmFjayB0aGF0IHRoZSBlbGVtZW50IGhhcyBhZGRlZC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhZGRMaXN0ZW5lcihlbGVtZW50LCBsaXN0ZW5lcikge1xuICAgICAgICB2YXIgaWQgPSBpZEhhbmRsZXIuZ2V0KGVsZW1lbnQpO1xuXG4gICAgICAgIGlmKCFldmVudExpc3RlbmVyc1tpZF0pIHtcbiAgICAgICAgICAgIGV2ZW50TGlzdGVuZXJzW2lkXSA9IFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgZXZlbnRMaXN0ZW5lcnNbaWRdLnB1c2gobGlzdGVuZXIpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGdldDogZ2V0TGlzdGVuZXJzLFxuICAgICAgICBhZGQ6IGFkZExpc3RlbmVyXG4gICAgfTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuLyogZ2xvYmFsIGNvbnNvbGU6IGZhbHNlICovXG5cbi8qKlxuICogUmVwb3J0ZXIgdGhhdCBoYW5kbGVzIHRoZSByZXBvcnRpbmcgb2YgbG9ncywgd2FybmluZ3MgYW5kIGVycm9ycy5cbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gcXVpZXQgVGVsbHMgaWYgdGhlIHJlcG9ydGVyIHNob3VsZCBiZSBxdWlldCBvciBub3QuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocXVpZXQpIHtcbiAgICBmdW5jdGlvbiBub29wKCkge1xuICAgICAgICAvL0RvZXMgbm90aGluZy5cbiAgICB9XG5cbiAgICB2YXIgcmVwb3J0ZXIgPSB7XG4gICAgICAgIGxvZzogbm9vcCxcbiAgICAgICAgd2Fybjogbm9vcCxcbiAgICAgICAgZXJyb3I6IG5vb3BcbiAgICB9O1xuXG4gICAgaWYoIXF1aWV0ICYmIHdpbmRvdy5jb25zb2xlKSB7XG4gICAgICAgIHZhciBhdHRhY2hGdW5jdGlvbiA9IGZ1bmN0aW9uKHJlcG9ydGVyLCBuYW1lKSB7XG4gICAgICAgICAgICAvL1RoZSBwcm94eSBpcyBuZWVkZWQgdG8gYmUgYWJsZSB0byBjYWxsIHRoZSBtZXRob2Qgd2l0aCB0aGUgY29uc29sZSBjb250ZXh0LFxuICAgICAgICAgICAgLy9zaW5jZSB3ZSBjYW5ub3QgdXNlIGJpbmQuXG4gICAgICAgICAgICByZXBvcnRlcltuYW1lXSA9IGZ1bmN0aW9uIHJlcG9ydGVyUHJveHkoKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZVtuYW1lXS5hcHBseShjb25zb2xlLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfTtcblxuICAgICAgICBhdHRhY2hGdW5jdGlvbihyZXBvcnRlciwgXCJsb2dcIik7XG4gICAgICAgIGF0dGFjaEZ1bmN0aW9uKHJlcG9ydGVyLCBcIndhcm5cIik7XG4gICAgICAgIGF0dGFjaEZ1bmN0aW9uKHJlcG9ydGVyLCBcImVycm9yXCIpO1xuICAgIH1cblxuICAgIHJldHVybiByZXBvcnRlcjtcbn07Il19
