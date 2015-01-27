/*!
 * element-resize-detector 0.1.0 (2015-01-27, 15:15)
 * https://github.com/wnr/element-resize-detector
 * Licensed under MIT
 */

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.elementResizeDetectorMaker=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{}],2:[function(require,module,exports){
//Heavily inspired by http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/

"use strict";

var forEach = require("./collection-utils").forEach;
var elementUtils = require("./element-utils");
var idGeneratorMaker = require("./id-generator");
var listenerHandlerMaker = require("./listener-handler");

module.exports = function(dependencies, options) {
    dependencies = dependencies || {};

    options = options || {};
    var allowMultipleListeners = !!options.allowMultipleListeners;

    var eventListenerHandler = listenerHandlerMaker();
    var idGenerator = idGeneratorMaker();

    /**
     * Makes the given elements resize-detectable and starts listening to resize events on the elements. Calls the event callback for each event for each element.
     * @public
     * @param {element[]|element} elements The given array of elements to detect resize events of. Single element is also valid.
     * @param {function} listener The callback to be executed for each resize event for each element.
     */
    function listenTo(elements, listener) {
        function isListenedTo(element) {
            return elementUtils.isDetectable() && eventListenerHandler.get(element).length;
        }

        function addListener(element, listener) {
            elementUtils.addListener(element, listener);
            eventListenerHandler.add(element, listener);
        }

        if(elements.length === undefined) {
            elements = [elements];
        }

        forEach(elements, function(element) {
            if(!elementUtils.isDetectable(element)) {
                //The element is not prepared to be detectable, so do prepare it and add a listener to it.
                var id = idGenerator.newId();
                return elementUtils.makeDetectable(element, id, function(element) {
                    addListener(element, listener);
                });
            }
            
            //The element has been prepared to be detectable and is ready to be listened to.
            
            if(isListenedTo(element) && !allowMultipleListeners) {
                //Since there is a listener and we disallow multiple listeners no listener should be added.
                return;
            }

            //Since multiple listeners is allowed, another listener is added to the element.
            return addListener(element, listener);
        });
    }

    return {
        listenTo: listenTo
    };
};

},{"./collection-utils":1,"./element-utils":3,"./id-generator":4,"./listener-handler":5}],3:[function(require,module,exports){
"use strict";

var forEach = require("./collection-utils").forEach;

var utils = module.exports = {};

/**
 * Gets the elq id of the element.
 * @public
 * @param {element} The target element to get the id of.
 * @returns {string} The id of the element.
 */
utils.getId = function(element) {
    return element.getAttribute("elq-target-id");
};

/**
 * Tells if the element has been made detectable and ready to be listened for resize events.
 * @public
 * @param {element} The element to check.
 * @returns {boolean} True or false depending on if the element is detectable or not.
 */
utils.isDetectable = function(element) {
    return getObject(element);
};

/**
 * Adds a resize event listener to the element.
 * @public
 * @param {element} element The element that should have the listener added.
 * @param {function} listener The listener callback to be called for each resize event of the element. The element will be given as a parameter to the listener callback.
 */
utils.addListener = function(element, listener) {
    if(!utils.isDetectable(element)) {
        throw new Error("Element is not detectable.");
    }

    var object = getObject(element);
    object.contentDocument.defaultView.addEventListener("resize", function() {
        listener(element);
    });
};

/**
 * Makes an element detectable and ready to be listened for resize events. Will call the callback when the element is ready to be listened for resize changes.
 * @private
 * @param {element} element The element to make detectable
 * @param {*} id An unique id in the context of all detectable elements.
 * @param {function} callback The callback to be called when the element is ready to be listened for resize changes. Will be called with the element as first parameter.
 */
utils.makeDetectable = function(element, id, callback) {
    function onObjectLoad() {
        /*jshint validthis:true */

        //Create the style element to be added to the object.
        var objectDocument = this.contentDocument;
        var style = objectDocument.createElement("style");
        style.innerHTML = "html, body { margin: 0; padding: 0 } div { -webkit-transition: opacity 0.01s; -ms-transition: opacity 0.01s; -o-transition: opacity 0.01s; transition: opacity 0.01s; opacity: 0; }";

        //TODO: Remove any styles that has been set on the object. Only the style above should be styling the object.

        //Append the style to the object.
        objectDocument.head.appendChild(style);

        this.style.cssText = "display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; padding: 0; margin: 0; opacity: 0; z-index: -1000; pointer-events: none;";

        //Notify that the element is ready to be listened to.
        callback(element);
    }

    //Create an unique elq-target-id for the target element, so that event listeners can be identified to this element.
    element.setAttribute("elq-target-id", id);

    //Add an object element as a child to the target element that will be listened to for resize events.
    var object = document.createElement("object");
    object.type = "text/html";
    object.data = "about:blank";
    object.onload = onObjectLoad;
    object.setAttribute("elq-object-id", id);
    element.appendChild(object);
};

/**
 * Returns the child object of the target element.
 * @private
 * @param {element} element The target element.
 * @returns The object element of the target.
 */
function getObject(element) {
    return forEach(element.children, function(child) {
        if(child.hasAttribute("elq-object-id")) {
            return child;
        }
    });
}

},{"./collection-utils":1}],4:[function(require,module,exports){
"use strict";

module.exports = function() {
    var idCount = 1;

    /**
     * Generates a new unique id in the context.
     * @public
     * @returns {number} A unique id in the context.
     */
    function newId() {
        return idCount++;
    }

    return {
        newId: newId
    };
};

},{}],5:[function(require,module,exports){
"use strict";

var elementUtils = require("./element-utils");

module.exports = function() {
    var eventListeners = {};

    /**
     * Gets all listeners for the given element.
     * @public
     * @param {element} element The element to get all listeners for.
     * @returns All listeners for the given element.
     */
    function getListeners(element) {
        return eventListeners[elementUtils.getId(element)];
    }

    /**
     * Stores the given listener for the given element. Will not actually add the listener to the element.
     * @public
     * @param {element} element The element that should have the listener added.
     * @param {function} listener The callback that the element has added.
     */
    function addListener(element, listener) {
        var id = elementUtils.getId(element);

        if(!eventListeners[id]) {
            eventListeners[id] = [];
        }

        eventListeners[id].push(element, listener);
    }

    return {
        get: getListeners,
        add: addListener
    };
};

},{"./element-utils":3}]},{},[2])(2)
});