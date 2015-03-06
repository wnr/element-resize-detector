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

module.exports = function(options) {
    options = options || {};
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
            return elementUtils.isDetectable(element) && eventListenerHandler.get(element).length;
        }

        function onResizeCallback(element) {
            var listeners = eventListenerHandler.get(element);

            forEach(listeners, function(listener) {
                listener(element);
            });
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

        forEach(elements, function(element) {
            if(!elementUtils.isDetectable(element)) {
                //The element is not prepared to be detectable, so do prepare it and add a listener to it.
                var id = idGenerator.newId();
                return elementUtils.makeDetectable(element, id, function(element) {
                    elementUtils.addListener(element, onResizeCallback);
                    eventListenerHandler.add(element, listener);
                });
            }
            
            //The element has been prepared to be detectable and is ready to be listened to.
            return eventListenerHandler.add(element, listener);
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
    return !!getObject(element);
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

    //The target element needs to be positioned (everything except static) so the absolute positioned object will be positioned relative to the target element.
    if(getComputedStyle(element).position === "static") {
        element.style.position = "relative";
    }

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

        eventListeners[id].push(listener);
    }

    return {
        get: getListeners,
        add: addListener
    };
};

},{"./element-utils":3}]},{},[2])(2)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvY29sbGVjdGlvbi11dGlscy5qcyIsInNyYy9lbGVtZW50LXJlc2l6ZS1kZXRlY3Rvci5qcyIsInNyYy9lbGVtZW50LXV0aWxzLmpzIiwic3JjL2lkLWdlbmVyYXRvci5qcyIsInNyYy9saXN0ZW5lci1oYW5kbGVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHV0aWxzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLyoqXG4gKiBMb29wcyB0aHJvdWdoIHRoZSBjb2xsZWN0aW9uIGFuZCBjYWxscyB0aGUgY2FsbGJhY2sgZm9yIGVhY2ggZWxlbWVudC4gaWYgdGhlIGNhbGxiYWNrIHJldHVybnMgdHJ1dGh5LCB0aGUgbG9vcCBpcyBicm9rZW4gYW5kIHJldHVybnMgdGhlIHNhbWUgdmFsdWUuXG4gKiBAcHVibGljXG4gKiBAcGFyYW0geyp9IGNvbGxlY3Rpb24gVGhlIGNvbGxlY3Rpb24gdG8gbG9vcCB0aHJvdWdoLiBOZWVkcyB0byBoYXZlIGEgbGVuZ3RoIHByb3BlcnR5IHNldCBhbmQgaGF2ZSBpbmRpY2VzIHNldCBmcm9tIDAgdG8gbGVuZ3RoIC0gMS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIFRoZSBjYWxsYmFjayB0byBiZSBjYWxsZWQgZm9yIGVhY2ggZWxlbWVudC4gVGhlIGVsZW1lbnQgd2lsbCBiZSBnaXZlbiBhcyBhIHBhcmFtZXRlciB0byB0aGUgY2FsbGJhY2suIElmIHRoaXMgY2FsbGJhY2sgcmV0dXJucyB0cnV0aHksIHRoZSBsb29wIGlzIGJyb2tlbiBhbmQgdGhlIHNhbWUgdmFsdWUgaXMgcmV0dXJuZWQuXG4gKiBAcmV0dXJucyB7Kn0gVGhlIHZhbHVlIHRoYXQgYSBjYWxsYmFjayBoYXMgcmV0dXJuZWQgKGlmIHRydXRoeSkuIE90aGVyd2lzZSBub3RoaW5nLlxuICovXG51dGlscy5mb3JFYWNoID0gZnVuY3Rpb24oY29sbGVjdGlvbiwgY2FsbGJhY2spIHtcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgY29sbGVjdGlvbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgcmVzdWx0ID0gY2FsbGJhY2soY29sbGVjdGlvbltpXSk7XG4gICAgICAgIGlmKHJlc3VsdCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgIH1cbn07XG4iLCIvL0hlYXZpbHkgaW5zcGlyZWQgYnkgaHR0cDovL3d3dy5iYWNrYWxsZXljb2Rlci5jb20vMjAxMy8wMy8xOC9jcm9zcy1icm93c2VyLWV2ZW50LWJhc2VkLWVsZW1lbnQtcmVzaXplLWRldGVjdGlvbi9cblxuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBmb3JFYWNoID0gcmVxdWlyZShcIi4vY29sbGVjdGlvbi11dGlsc1wiKS5mb3JFYWNoO1xudmFyIGVsZW1lbnRVdGlscyA9IHJlcXVpcmUoXCIuL2VsZW1lbnQtdXRpbHNcIik7XG52YXIgaWRHZW5lcmF0b3JNYWtlciA9IHJlcXVpcmUoXCIuL2lkLWdlbmVyYXRvclwiKTtcbnZhciBsaXN0ZW5lckhhbmRsZXJNYWtlciA9IHJlcXVpcmUoXCIuL2xpc3RlbmVyLWhhbmRsZXJcIik7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciBldmVudExpc3RlbmVySGFuZGxlciA9IGxpc3RlbmVySGFuZGxlck1ha2VyKCk7XG4gICAgdmFyIGlkR2VuZXJhdG9yID0gaWRHZW5lcmF0b3JNYWtlcigpO1xuXG4gICAgLyoqXG4gICAgICogTWFrZXMgdGhlIGdpdmVuIGVsZW1lbnRzIHJlc2l6ZS1kZXRlY3RhYmxlIGFuZCBzdGFydHMgbGlzdGVuaW5nIHRvIHJlc2l6ZSBldmVudHMgb24gdGhlIGVsZW1lbnRzLiBDYWxscyB0aGUgZXZlbnQgY2FsbGJhY2sgZm9yIGVhY2ggZXZlbnQgZm9yIGVhY2ggZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50W118ZWxlbWVudH0gZWxlbWVudHMgVGhlIGdpdmVuIGFycmF5IG9mIGVsZW1lbnRzIHRvIGRldGVjdCByZXNpemUgZXZlbnRzIG9mLiBTaW5nbGUgZWxlbWVudCBpcyBhbHNvIHZhbGlkLlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGxpc3RlbmVyIFRoZSBjYWxsYmFjayB0byBiZSBleGVjdXRlZCBmb3IgZWFjaCByZXNpemUgZXZlbnQgZm9yIGVhY2ggZWxlbWVudC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBsaXN0ZW5UbyhlbGVtZW50cywgbGlzdGVuZXIpIHtcbiAgICAgICAgZnVuY3Rpb24gaXNMaXN0ZW5lZFRvKGVsZW1lbnQpIHtcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50VXRpbHMuaXNEZXRlY3RhYmxlKGVsZW1lbnQpICYmIGV2ZW50TGlzdGVuZXJIYW5kbGVyLmdldChlbGVtZW50KS5sZW5ndGg7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBvblJlc2l6ZUNhbGxiYWNrKGVsZW1lbnQpIHtcbiAgICAgICAgICAgIHZhciBsaXN0ZW5lcnMgPSBldmVudExpc3RlbmVySGFuZGxlci5nZXQoZWxlbWVudCk7XG5cbiAgICAgICAgICAgIGZvckVhY2gobGlzdGVuZXJzLCBmdW5jdGlvbihsaXN0ZW5lcikge1xuICAgICAgICAgICAgICAgIGxpc3RlbmVyKGVsZW1lbnQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZighZWxlbWVudHMpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkF0IGxlYXN0IG9uZSBlbGVtZW50IHJlcXVpcmVkLlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCFsaXN0ZW5lcikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTGlzdGVuZXIgcmVxdWlyZWQuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoZWxlbWVudHMubGVuZ3RoID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGVsZW1lbnRzID0gW2VsZW1lbnRzXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvckVhY2goZWxlbWVudHMsIGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICAgICAgICAgIGlmKCFlbGVtZW50VXRpbHMuaXNEZXRlY3RhYmxlKGVsZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgLy9UaGUgZWxlbWVudCBpcyBub3QgcHJlcGFyZWQgdG8gYmUgZGV0ZWN0YWJsZSwgc28gZG8gcHJlcGFyZSBpdCBhbmQgYWRkIGEgbGlzdGVuZXIgdG8gaXQuXG4gICAgICAgICAgICAgICAgdmFyIGlkID0gaWRHZW5lcmF0b3IubmV3SWQoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZWxlbWVudFV0aWxzLm1ha2VEZXRlY3RhYmxlKGVsZW1lbnQsIGlkLCBmdW5jdGlvbihlbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRVdGlscy5hZGRMaXN0ZW5lcihlbGVtZW50LCBvblJlc2l6ZUNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRMaXN0ZW5lckhhbmRsZXIuYWRkKGVsZW1lbnQsIGxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy9UaGUgZWxlbWVudCBoYXMgYmVlbiBwcmVwYXJlZCB0byBiZSBkZXRlY3RhYmxlIGFuZCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCB0by5cbiAgICAgICAgICAgIHJldHVybiBldmVudExpc3RlbmVySGFuZGxlci5hZGQoZWxlbWVudCwgbGlzdGVuZXIpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBsaXN0ZW5UbzogbGlzdGVuVG9cbiAgICB9O1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZm9yRWFjaCA9IHJlcXVpcmUoXCIuL2NvbGxlY3Rpb24tdXRpbHNcIikuZm9yRWFjaDtcblxudmFyIHV0aWxzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLyoqXG4gKiBHZXRzIHRoZSBlbHEgaWQgb2YgdGhlIGVsZW1lbnQuXG4gKiBAcHVibGljXG4gKiBAcGFyYW0ge2VsZW1lbnR9IFRoZSB0YXJnZXQgZWxlbWVudCB0byBnZXQgdGhlIGlkIG9mLlxuICogQHJldHVybnMge3N0cmluZ30gVGhlIGlkIG9mIHRoZSBlbGVtZW50LlxuICovXG51dGlscy5nZXRJZCA9IGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICByZXR1cm4gZWxlbWVudC5nZXRBdHRyaWJ1dGUoXCJlbHEtdGFyZ2V0LWlkXCIpO1xufTtcblxuLyoqXG4gKiBUZWxscyBpZiB0aGUgZWxlbWVudCBoYXMgYmVlbiBtYWRlIGRldGVjdGFibGUgYW5kIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgZXZlbnRzLlxuICogQHB1YmxpY1xuICogQHBhcmFtIHtlbGVtZW50fSBUaGUgZWxlbWVudCB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIG9yIGZhbHNlIGRlcGVuZGluZyBvbiBpZiB0aGUgZWxlbWVudCBpcyBkZXRlY3RhYmxlIG9yIG5vdC5cbiAqL1xudXRpbHMuaXNEZXRlY3RhYmxlID0gZnVuY3Rpb24oZWxlbWVudCkge1xuICAgIHJldHVybiAhIWdldE9iamVjdChlbGVtZW50KTtcbn07XG5cbi8qKlxuICogQWRkcyBhIHJlc2l6ZSBldmVudCBsaXN0ZW5lciB0byB0aGUgZWxlbWVudC5cbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0aGF0IHNob3VsZCBoYXZlIHRoZSBsaXN0ZW5lciBhZGRlZC5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGxpc3RlbmVyIFRoZSBsaXN0ZW5lciBjYWxsYmFjayB0byBiZSBjYWxsZWQgZm9yIGVhY2ggcmVzaXplIGV2ZW50IG9mIHRoZSBlbGVtZW50LiBUaGUgZWxlbWVudCB3aWxsIGJlIGdpdmVuIGFzIGEgcGFyYW1ldGVyIHRvIHRoZSBsaXN0ZW5lciBjYWxsYmFjay5cbiAqL1xudXRpbHMuYWRkTGlzdGVuZXIgPSBmdW5jdGlvbihlbGVtZW50LCBsaXN0ZW5lcikge1xuICAgIGlmKCF1dGlscy5pc0RldGVjdGFibGUoZWxlbWVudCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRWxlbWVudCBpcyBub3QgZGV0ZWN0YWJsZS5cIik7XG4gICAgfVxuXG4gICAgdmFyIG9iamVjdCA9IGdldE9iamVjdChlbGVtZW50KTtcbiAgICBvYmplY3QuY29udGVudERvY3VtZW50LmRlZmF1bHRWaWV3LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIGxpc3RlbmVyKGVsZW1lbnQpO1xuICAgIH0pO1xufTtcblxuLyoqXG4gKiBNYWtlcyBhbiBlbGVtZW50IGRldGVjdGFibGUgYW5kIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgZXZlbnRzLiBXaWxsIGNhbGwgdGhlIGNhbGxiYWNrIHdoZW4gdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBjaGFuZ2VzLlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0byBtYWtlIGRldGVjdGFibGVcbiAqIEBwYXJhbSB7Kn0gaWQgQW4gdW5pcXVlIGlkIGluIHRoZSBjb250ZXh0IG9mIGFsbCBkZXRlY3RhYmxlIGVsZW1lbnRzLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCB3aGVuIHRoZSBlbGVtZW50IGlzIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgY2hhbmdlcy4gV2lsbCBiZSBjYWxsZWQgd2l0aCB0aGUgZWxlbWVudCBhcyBmaXJzdCBwYXJhbWV0ZXIuXG4gKi9cbnV0aWxzLm1ha2VEZXRlY3RhYmxlID0gZnVuY3Rpb24oZWxlbWVudCwgaWQsIGNhbGxiYWNrKSB7XG4gICAgZnVuY3Rpb24gb25PYmplY3RMb2FkKCkge1xuICAgICAgICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuXG4gICAgICAgIC8vQ3JlYXRlIHRoZSBzdHlsZSBlbGVtZW50IHRvIGJlIGFkZGVkIHRvIHRoZSBvYmplY3QuXG4gICAgICAgIHZhciBvYmplY3REb2N1bWVudCA9IHRoaXMuY29udGVudERvY3VtZW50O1xuICAgICAgICB2YXIgc3R5bGUgPSBvYmplY3REb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gICAgICAgIHN0eWxlLmlubmVySFRNTCA9IFwiaHRtbCwgYm9keSB7IG1hcmdpbjogMDsgcGFkZGluZzogMCB9IGRpdiB7IC13ZWJraXQtdHJhbnNpdGlvbjogb3BhY2l0eSAwLjAxczsgLW1zLXRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IC1vLXRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IHRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IG9wYWNpdHk6IDA7IH1cIjtcblxuICAgICAgICAvL1RPRE86IFJlbW92ZSBhbnkgc3R5bGVzIHRoYXQgaGFzIGJlZW4gc2V0IG9uIHRoZSBvYmplY3QuIE9ubHkgdGhlIHN0eWxlIGFib3ZlIHNob3VsZCBiZSBzdHlsaW5nIHRoZSBvYmplY3QuXG5cbiAgICAgICAgLy9BcHBlbmQgdGhlIHN0eWxlIHRvIHRoZSBvYmplY3QuXG4gICAgICAgIG9iamVjdERvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuXG4gICAgICAgIHRoaXMuc3R5bGUuY3NzVGV4dCA9IFwiZGlzcGxheTogYmxvY2s7IHBvc2l0aW9uOiBhYnNvbHV0ZTsgdG9wOiAwOyBsZWZ0OiAwOyB3aWR0aDogMTAwJTsgaGVpZ2h0OiAxMDAlOyBib3JkZXI6IG5vbmU7IHBhZGRpbmc6IDA7IG1hcmdpbjogMDsgb3BhY2l0eTogMDsgei1pbmRleDogLTEwMDA7IHBvaW50ZXItZXZlbnRzOiBub25lO1wiO1xuXG4gICAgICAgIC8vTm90aWZ5IHRoYXQgdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgdG8uXG4gICAgICAgIGNhbGxiYWNrKGVsZW1lbnQpO1xuICAgIH1cblxuICAgIC8vQ3JlYXRlIGFuIHVuaXF1ZSBlbHEtdGFyZ2V0LWlkIGZvciB0aGUgdGFyZ2V0IGVsZW1lbnQsIHNvIHRoYXQgZXZlbnQgbGlzdGVuZXJzIGNhbiBiZSBpZGVudGlmaWVkIHRvIHRoaXMgZWxlbWVudC5cbiAgICBlbGVtZW50LnNldEF0dHJpYnV0ZShcImVscS10YXJnZXQtaWRcIiwgaWQpO1xuXG4gICAgLy9UaGUgdGFyZ2V0IGVsZW1lbnQgbmVlZHMgdG8gYmUgcG9zaXRpb25lZCAoZXZlcnl0aGluZyBleGNlcHQgc3RhdGljKSBzbyB0aGUgYWJzb2x1dGUgcG9zaXRpb25lZCBvYmplY3Qgd2lsbCBiZSBwb3NpdGlvbmVkIHJlbGF0aXZlIHRvIHRoZSB0YXJnZXQgZWxlbWVudC5cbiAgICBpZihnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLnBvc2l0aW9uID09PSBcInN0YXRpY1wiKSB7XG4gICAgICAgIGVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSBcInJlbGF0aXZlXCI7XG4gICAgfVxuXG4gICAgLy9BZGQgYW4gb2JqZWN0IGVsZW1lbnQgYXMgYSBjaGlsZCB0byB0aGUgdGFyZ2V0IGVsZW1lbnQgdGhhdCB3aWxsIGJlIGxpc3RlbmVkIHRvIGZvciByZXNpemUgZXZlbnRzLlxuICAgIHZhciBvYmplY3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwib2JqZWN0XCIpO1xuICAgIG9iamVjdC50eXBlID0gXCJ0ZXh0L2h0bWxcIjtcbiAgICBvYmplY3QuZGF0YSA9IFwiYWJvdXQ6YmxhbmtcIjtcbiAgICBvYmplY3Qub25sb2FkID0gb25PYmplY3RMb2FkO1xuICAgIG9iamVjdC5zZXRBdHRyaWJ1dGUoXCJlbHEtb2JqZWN0LWlkXCIsIGlkKTtcbiAgICBlbGVtZW50LmFwcGVuZENoaWxkKG9iamVjdCk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIGNoaWxkIG9iamVjdCBvZiB0aGUgdGFyZ2V0IGVsZW1lbnQuXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSB0YXJnZXQgZWxlbWVudC5cbiAqIEByZXR1cm5zIFRoZSBvYmplY3QgZWxlbWVudCBvZiB0aGUgdGFyZ2V0LlxuICovXG5mdW5jdGlvbiBnZXRPYmplY3QoZWxlbWVudCkge1xuICAgIHJldHVybiBmb3JFYWNoKGVsZW1lbnQuY2hpbGRyZW4sIGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgICAgIGlmKGNoaWxkLmhhc0F0dHJpYnV0ZShcImVscS1vYmplY3QtaWRcIikpIHtcbiAgICAgICAgICAgIHJldHVybiBjaGlsZDtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGlkQ291bnQgPSAxO1xuXG4gICAgLyoqXG4gICAgICogR2VuZXJhdGVzIGEgbmV3IHVuaXF1ZSBpZCBpbiB0aGUgY29udGV4dC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHJldHVybnMge251bWJlcn0gQSB1bmlxdWUgaWQgaW4gdGhlIGNvbnRleHQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbmV3SWQoKSB7XG4gICAgICAgIHJldHVybiBpZENvdW50Kys7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgbmV3SWQ6IG5ld0lkXG4gICAgfTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGVsZW1lbnRVdGlscyA9IHJlcXVpcmUoXCIuL2VsZW1lbnQtdXRpbHNcIik7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGV2ZW50TGlzdGVuZXJzID0ge307XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIGFsbCBsaXN0ZW5lcnMgZm9yIHRoZSBnaXZlbiBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdG8gZ2V0IGFsbCBsaXN0ZW5lcnMgZm9yLlxuICAgICAqIEByZXR1cm5zIEFsbCBsaXN0ZW5lcnMgZm9yIHRoZSBnaXZlbiBlbGVtZW50LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldExpc3RlbmVycyhlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBldmVudExpc3RlbmVyc1tlbGVtZW50VXRpbHMuZ2V0SWQoZWxlbWVudCldO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN0b3JlcyB0aGUgZ2l2ZW4gbGlzdGVuZXIgZm9yIHRoZSBnaXZlbiBlbGVtZW50LiBXaWxsIG5vdCBhY3R1YWxseSBhZGQgdGhlIGxpc3RlbmVyIHRvIHRoZSBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdGhhdCBzaG91bGQgaGF2ZSB0aGUgbGlzdGVuZXIgYWRkZWQuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gbGlzdGVuZXIgVGhlIGNhbGxiYWNrIHRoYXQgdGhlIGVsZW1lbnQgaGFzIGFkZGVkLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGFkZExpc3RlbmVyKGVsZW1lbnQsIGxpc3RlbmVyKSB7XG4gICAgICAgIHZhciBpZCA9IGVsZW1lbnRVdGlscy5nZXRJZChlbGVtZW50KTtcblxuICAgICAgICBpZighZXZlbnRMaXN0ZW5lcnNbaWRdKSB7XG4gICAgICAgICAgICBldmVudExpc3RlbmVyc1tpZF0gPSBbXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGV2ZW50TGlzdGVuZXJzW2lkXS5wdXNoKGxpc3RlbmVyKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBnZXQ6IGdldExpc3RlbmVycyxcbiAgICAgICAgYWRkOiBhZGRMaXN0ZW5lclxuICAgIH07XG59O1xuIl19
