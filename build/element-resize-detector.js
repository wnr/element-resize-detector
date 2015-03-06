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
    var OBJECT_STYLE = "display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; padding: 0; margin: 0; opacity: 0; z-index: -1000; pointer-events: none;";

    function onObjectLoad() {
        /*jshint validthis:true */

        //Create the style element to be added to the object.
        var objectDocument = this.contentDocument;
        var style = objectDocument.createElement("style");
        style.innerHTML = "html, body { margin: 0; padding: 0 } div { -webkit-transition: opacity 0.01s; -ms-transition: opacity 0.01s; -o-transition: opacity 0.01s; transition: opacity 0.01s; opacity: 0; }";

        //TODO: Remove any styles that has been set on the object. Only the style above should be styling the object.

        //Append the style to the object.
        objectDocument.head.appendChild(style);

        //TODO: Is this needed here?
        //this.style.cssText = OBJECT_STYLE;

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
    object.style.cssText = OBJECT_STYLE;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvY29sbGVjdGlvbi11dGlscy5qcyIsInNyYy9lbGVtZW50LXJlc2l6ZS1kZXRlY3Rvci5qcyIsInNyYy9lbGVtZW50LXV0aWxzLmpzIiwic3JjL2lkLWdlbmVyYXRvci5qcyIsInNyYy9saXN0ZW5lci1oYW5kbGVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG4vKipcbiAqIExvb3BzIHRocm91Z2ggdGhlIGNvbGxlY3Rpb24gYW5kIGNhbGxzIHRoZSBjYWxsYmFjayBmb3IgZWFjaCBlbGVtZW50LiBpZiB0aGUgY2FsbGJhY2sgcmV0dXJucyB0cnV0aHksIHRoZSBsb29wIGlzIGJyb2tlbiBhbmQgcmV0dXJucyB0aGUgc2FtZSB2YWx1ZS5cbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSB7Kn0gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBsb29wIHRocm91Z2guIE5lZWRzIHRvIGhhdmUgYSBsZW5ndGggcHJvcGVydHkgc2V0IGFuZCBoYXZlIGluZGljZXMgc2V0IGZyb20gMCB0byBsZW5ndGggLSAxLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCBmb3IgZWFjaCBlbGVtZW50LiBUaGUgZWxlbWVudCB3aWxsIGJlIGdpdmVuIGFzIGEgcGFyYW1ldGVyIHRvIHRoZSBjYWxsYmFjay4gSWYgdGhpcyBjYWxsYmFjayByZXR1cm5zIHRydXRoeSwgdGhlIGxvb3AgaXMgYnJva2VuIGFuZCB0aGUgc2FtZSB2YWx1ZSBpcyByZXR1cm5lZC5cbiAqIEByZXR1cm5zIHsqfSBUaGUgdmFsdWUgdGhhdCBhIGNhbGxiYWNrIGhhcyByZXR1cm5lZCAoaWYgdHJ1dGh5KS4gT3RoZXJ3aXNlIG5vdGhpbmcuXG4gKi9cbnV0aWxzLmZvckVhY2ggPSBmdW5jdGlvbihjb2xsZWN0aW9uLCBjYWxsYmFjaykge1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBjb2xsZWN0aW9uLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBjYWxsYmFjayhjb2xsZWN0aW9uW2ldKTtcbiAgICAgICAgaWYocmVzdWx0KSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgfVxufTtcbiIsIi8vSGVhdmlseSBpbnNwaXJlZCBieSBodHRwOi8vd3d3LmJhY2thbGxleWNvZGVyLmNvbS8yMDEzLzAzLzE4L2Nyb3NzLWJyb3dzZXItZXZlbnQtYmFzZWQtZWxlbWVudC1yZXNpemUtZGV0ZWN0aW9uL1xuXG5cInVzZSBzdHJpY3RcIjtcblxudmFyIGZvckVhY2ggPSByZXF1aXJlKFwiLi9jb2xsZWN0aW9uLXV0aWxzXCIpLmZvckVhY2g7XG52YXIgZWxlbWVudFV0aWxzID0gcmVxdWlyZShcIi4vZWxlbWVudC11dGlsc1wiKTtcbnZhciBpZEdlbmVyYXRvck1ha2VyID0gcmVxdWlyZShcIi4vaWQtZ2VuZXJhdG9yXCIpO1xudmFyIGxpc3RlbmVySGFuZGxlck1ha2VyID0gcmVxdWlyZShcIi4vbGlzdGVuZXItaGFuZGxlclwiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIGV2ZW50TGlzdGVuZXJIYW5kbGVyID0gbGlzdGVuZXJIYW5kbGVyTWFrZXIoKTtcbiAgICB2YXIgaWRHZW5lcmF0b3IgPSBpZEdlbmVyYXRvck1ha2VyKCk7XG5cbiAgICAvKipcbiAgICAgKiBNYWtlcyB0aGUgZ2l2ZW4gZWxlbWVudHMgcmVzaXplLWRldGVjdGFibGUgYW5kIHN0YXJ0cyBsaXN0ZW5pbmcgdG8gcmVzaXplIGV2ZW50cyBvbiB0aGUgZWxlbWVudHMuIENhbGxzIHRoZSBldmVudCBjYWxsYmFjayBmb3IgZWFjaCBldmVudCBmb3IgZWFjaCBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnRbXXxlbGVtZW50fSBlbGVtZW50cyBUaGUgZ2l2ZW4gYXJyYXkgb2YgZWxlbWVudHMgdG8gZGV0ZWN0IHJlc2l6ZSBldmVudHMgb2YuIFNpbmdsZSBlbGVtZW50IGlzIGFsc28gdmFsaWQuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gbGlzdGVuZXIgVGhlIGNhbGxiYWNrIHRvIGJlIGV4ZWN1dGVkIGZvciBlYWNoIHJlc2l6ZSBldmVudCBmb3IgZWFjaCBlbGVtZW50LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGxpc3RlblRvKGVsZW1lbnRzLCBsaXN0ZW5lcikge1xuICAgICAgICBmdW5jdGlvbiBpc0xpc3RlbmVkVG8oZWxlbWVudCkge1xuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnRVdGlscy5pc0RldGVjdGFibGUoZWxlbWVudCkgJiYgZXZlbnRMaXN0ZW5lckhhbmRsZXIuZ2V0KGVsZW1lbnQpLmxlbmd0aDtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG9uUmVzaXplQ2FsbGJhY2soZWxlbWVudCkge1xuICAgICAgICAgICAgdmFyIGxpc3RlbmVycyA9IGV2ZW50TGlzdGVuZXJIYW5kbGVyLmdldChlbGVtZW50KTtcblxuICAgICAgICAgICAgZm9yRWFjaChsaXN0ZW5lcnMsIGZ1bmN0aW9uKGxpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIoZWxlbWVudCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCFlbGVtZW50cykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQXQgbGVhc3Qgb25lIGVsZW1lbnQgcmVxdWlyZWQuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIWxpc3RlbmVyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJMaXN0ZW5lciByZXF1aXJlZC5cIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZihlbGVtZW50cy5sZW5ndGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgZWxlbWVudHMgPSBbZWxlbWVudHNdO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yRWFjaChlbGVtZW50cywgZnVuY3Rpb24oZWxlbWVudCkge1xuICAgICAgICAgICAgaWYoIWVsZW1lbnRVdGlscy5pc0RldGVjdGFibGUoZWxlbWVudCkpIHtcbiAgICAgICAgICAgICAgICAvL1RoZSBlbGVtZW50IGlzIG5vdCBwcmVwYXJlZCB0byBiZSBkZXRlY3RhYmxlLCBzbyBkbyBwcmVwYXJlIGl0IGFuZCBhZGQgYSBsaXN0ZW5lciB0byBpdC5cbiAgICAgICAgICAgICAgICB2YXIgaWQgPSBpZEdlbmVyYXRvci5uZXdJZCgpO1xuICAgICAgICAgICAgICAgIHJldHVybiBlbGVtZW50VXRpbHMubWFrZURldGVjdGFibGUoZWxlbWVudCwgaWQsIGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudFV0aWxzLmFkZExpc3RlbmVyKGVsZW1lbnQsIG9uUmVzaXplQ2FsbGJhY2spO1xuICAgICAgICAgICAgICAgICAgICBldmVudExpc3RlbmVySGFuZGxlci5hZGQoZWxlbWVudCwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvL1RoZSBlbGVtZW50IGhhcyBiZWVuIHByZXBhcmVkIHRvIGJlIGRldGVjdGFibGUgYW5kIGlzIHJlYWR5IHRvIGJlIGxpc3RlbmVkIHRvLlxuICAgICAgICAgICAgcmV0dXJuIGV2ZW50TGlzdGVuZXJIYW5kbGVyLmFkZChlbGVtZW50LCBsaXN0ZW5lcik7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGxpc3RlblRvOiBsaXN0ZW5Ub1xuICAgIH07XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBmb3JFYWNoID0gcmVxdWlyZShcIi4vY29sbGVjdGlvbi11dGlsc1wiKS5mb3JFYWNoO1xuXG52YXIgdXRpbHMgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG4vKipcbiAqIEdldHMgdGhlIGVscSBpZCBvZiB0aGUgZWxlbWVudC5cbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSB7ZWxlbWVudH0gVGhlIHRhcmdldCBlbGVtZW50IHRvIGdldCB0aGUgaWQgb2YuXG4gKiBAcmV0dXJucyB7c3RyaW5nfSBUaGUgaWQgb2YgdGhlIGVsZW1lbnQuXG4gKi9cbnV0aWxzLmdldElkID0gZnVuY3Rpb24oZWxlbWVudCkge1xuICAgIHJldHVybiBlbGVtZW50LmdldEF0dHJpYnV0ZShcImVscS10YXJnZXQtaWRcIik7XG59O1xuXG4vKipcbiAqIFRlbGxzIGlmIHRoZSBlbGVtZW50IGhhcyBiZWVuIG1hZGUgZGV0ZWN0YWJsZSBhbmQgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBldmVudHMuXG4gKiBAcHVibGljXG4gKiBAcGFyYW0ge2VsZW1lbnR9IFRoZSBlbGVtZW50IHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgb3IgZmFsc2UgZGVwZW5kaW5nIG9uIGlmIHRoZSBlbGVtZW50IGlzIGRldGVjdGFibGUgb3Igbm90LlxuICovXG51dGlscy5pc0RldGVjdGFibGUgPSBmdW5jdGlvbihlbGVtZW50KSB7XG4gICAgcmV0dXJuICEhZ2V0T2JqZWN0KGVsZW1lbnQpO1xufTtcblxuLyoqXG4gKiBBZGRzIGEgcmVzaXplIGV2ZW50IGxpc3RlbmVyIHRvIHRoZSBlbGVtZW50LlxuICogQHB1YmxpY1xuICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRoYXQgc2hvdWxkIGhhdmUgdGhlIGxpc3RlbmVyIGFkZGVkLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gbGlzdGVuZXIgVGhlIGxpc3RlbmVyIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCBmb3IgZWFjaCByZXNpemUgZXZlbnQgb2YgdGhlIGVsZW1lbnQuIFRoZSBlbGVtZW50IHdpbGwgYmUgZ2l2ZW4gYXMgYSBwYXJhbWV0ZXIgdG8gdGhlIGxpc3RlbmVyIGNhbGxiYWNrLlxuICovXG51dGlscy5hZGRMaXN0ZW5lciA9IGZ1bmN0aW9uKGVsZW1lbnQsIGxpc3RlbmVyKSB7XG4gICAgaWYoIXV0aWxzLmlzRGV0ZWN0YWJsZShlbGVtZW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFbGVtZW50IGlzIG5vdCBkZXRlY3RhYmxlLlwiKTtcbiAgICB9XG5cbiAgICB2YXIgb2JqZWN0ID0gZ2V0T2JqZWN0KGVsZW1lbnQpO1xuICAgIG9iamVjdC5jb250ZW50RG9jdW1lbnQuZGVmYXVsdFZpZXcuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgbGlzdGVuZXIoZWxlbWVudCk7XG4gICAgfSk7XG59O1xuXG4vKipcbiAqIE1ha2VzIGFuIGVsZW1lbnQgZGV0ZWN0YWJsZSBhbmQgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBldmVudHMuIFdpbGwgY2FsbCB0aGUgY2FsbGJhY2sgd2hlbiB0aGUgZWxlbWVudCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGNoYW5nZXMuXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRvIG1ha2UgZGV0ZWN0YWJsZVxuICogQHBhcmFtIHsqfSBpZCBBbiB1bmlxdWUgaWQgaW4gdGhlIGNvbnRleHQgb2YgYWxsIGRldGVjdGFibGUgZWxlbWVudHMuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIHdoZW4gdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBjaGFuZ2VzLiBXaWxsIGJlIGNhbGxlZCB3aXRoIHRoZSBlbGVtZW50IGFzIGZpcnN0IHBhcmFtZXRlci5cbiAqL1xudXRpbHMubWFrZURldGVjdGFibGUgPSBmdW5jdGlvbihlbGVtZW50LCBpZCwgY2FsbGJhY2spIHtcbiAgICB2YXIgT0JKRUNUX1NUWUxFID0gXCJkaXNwbGF5OiBibG9jazsgcG9zaXRpb246IGFic29sdXRlOyB0b3A6IDA7IGxlZnQ6IDA7IHdpZHRoOiAxMDAlOyBoZWlnaHQ6IDEwMCU7IGJvcmRlcjogbm9uZTsgcGFkZGluZzogMDsgbWFyZ2luOiAwOyBvcGFjaXR5OiAwOyB6LWluZGV4OiAtMTAwMDsgcG9pbnRlci1ldmVudHM6IG5vbmU7XCI7XG5cbiAgICBmdW5jdGlvbiBvbk9iamVjdExvYWQoKSB7XG4gICAgICAgIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG5cbiAgICAgICAgLy9DcmVhdGUgdGhlIHN0eWxlIGVsZW1lbnQgdG8gYmUgYWRkZWQgdG8gdGhlIG9iamVjdC5cbiAgICAgICAgdmFyIG9iamVjdERvY3VtZW50ID0gdGhpcy5jb250ZW50RG9jdW1lbnQ7XG4gICAgICAgIHZhciBzdHlsZSA9IG9iamVjdERvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgICAgICAgc3R5bGUuaW5uZXJIVE1MID0gXCJodG1sLCBib2R5IHsgbWFyZ2luOiAwOyBwYWRkaW5nOiAwIH0gZGl2IHsgLXdlYmtpdC10cmFuc2l0aW9uOiBvcGFjaXR5IDAuMDFzOyAtbXMtdHJhbnNpdGlvbjogb3BhY2l0eSAwLjAxczsgLW8tdHJhbnNpdGlvbjogb3BhY2l0eSAwLjAxczsgdHJhbnNpdGlvbjogb3BhY2l0eSAwLjAxczsgb3BhY2l0eTogMDsgfVwiO1xuXG4gICAgICAgIC8vVE9ETzogUmVtb3ZlIGFueSBzdHlsZXMgdGhhdCBoYXMgYmVlbiBzZXQgb24gdGhlIG9iamVjdC4gT25seSB0aGUgc3R5bGUgYWJvdmUgc2hvdWxkIGJlIHN0eWxpbmcgdGhlIG9iamVjdC5cblxuICAgICAgICAvL0FwcGVuZCB0aGUgc3R5bGUgdG8gdGhlIG9iamVjdC5cbiAgICAgICAgb2JqZWN0RG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG5cbiAgICAgICAgLy9UT0RPOiBJcyB0aGlzIG5lZWRlZCBoZXJlP1xuICAgICAgICAvL3RoaXMuc3R5bGUuY3NzVGV4dCA9IE9CSkVDVF9TVFlMRTtcblxuICAgICAgICAvL05vdGlmeSB0aGF0IHRoZSBlbGVtZW50IGlzIHJlYWR5IHRvIGJlIGxpc3RlbmVkIHRvLlxuICAgICAgICBjYWxsYmFjayhlbGVtZW50KTtcbiAgICB9XG5cbiAgICAvL0NyZWF0ZSBhbiB1bmlxdWUgZWxxLXRhcmdldC1pZCBmb3IgdGhlIHRhcmdldCBlbGVtZW50LCBzbyB0aGF0IGV2ZW50IGxpc3RlbmVycyBjYW4gYmUgaWRlbnRpZmllZCB0byB0aGlzIGVsZW1lbnQuXG4gICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJlbHEtdGFyZ2V0LWlkXCIsIGlkKTtcblxuICAgIC8vVGhlIHRhcmdldCBlbGVtZW50IG5lZWRzIHRvIGJlIHBvc2l0aW9uZWQgKGV2ZXJ5dGhpbmcgZXhjZXB0IHN0YXRpYykgc28gdGhlIGFic29sdXRlIHBvc2l0aW9uZWQgb2JqZWN0IHdpbGwgYmUgcG9zaXRpb25lZCByZWxhdGl2ZSB0byB0aGUgdGFyZ2V0IGVsZW1lbnQuXG4gICAgaWYoZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS5wb3NpdGlvbiA9PT0gXCJzdGF0aWNcIikge1xuICAgICAgICBlbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gXCJyZWxhdGl2ZVwiO1xuICAgIH1cblxuICAgIC8vQWRkIGFuIG9iamVjdCBlbGVtZW50IGFzIGEgY2hpbGQgdG8gdGhlIHRhcmdldCBlbGVtZW50IHRoYXQgd2lsbCBiZSBsaXN0ZW5lZCB0byBmb3IgcmVzaXplIGV2ZW50cy5cbiAgICB2YXIgb2JqZWN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIm9iamVjdFwiKTtcbiAgICBvYmplY3QudHlwZSA9IFwidGV4dC9odG1sXCI7XG4gICAgb2JqZWN0LmRhdGEgPSBcImFib3V0OmJsYW5rXCI7XG4gICAgb2JqZWN0LnN0eWxlLmNzc1RleHQgPSBPQkpFQ1RfU1RZTEU7XG4gICAgb2JqZWN0Lm9ubG9hZCA9IG9uT2JqZWN0TG9hZDtcbiAgICBvYmplY3Quc2V0QXR0cmlidXRlKFwiZWxxLW9iamVjdC1pZFwiLCBpZCk7XG4gICAgZWxlbWVudC5hcHBlbmRDaGlsZChvYmplY3QpO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBjaGlsZCBvYmplY3Qgb2YgdGhlIHRhcmdldCBlbGVtZW50LlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgdGFyZ2V0IGVsZW1lbnQuXG4gKiBAcmV0dXJucyBUaGUgb2JqZWN0IGVsZW1lbnQgb2YgdGhlIHRhcmdldC5cbiAqL1xuZnVuY3Rpb24gZ2V0T2JqZWN0KGVsZW1lbnQpIHtcbiAgICByZXR1cm4gZm9yRWFjaChlbGVtZW50LmNoaWxkcmVuLCBmdW5jdGlvbihjaGlsZCkge1xuICAgICAgICBpZihjaGlsZC5oYXNBdHRyaWJ1dGUoXCJlbHEtb2JqZWN0LWlkXCIpKSB7XG4gICAgICAgICAgICByZXR1cm4gY2hpbGQ7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBpZENvdW50ID0gMTtcblxuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlcyBhIG5ldyB1bmlxdWUgaWQgaW4gdGhlIGNvbnRleHQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9IEEgdW5pcXVlIGlkIGluIHRoZSBjb250ZXh0LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIG5ld0lkKCkge1xuICAgICAgICByZXR1cm4gaWRDb3VudCsrO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIG5ld0lkOiBuZXdJZFxuICAgIH07XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBlbGVtZW50VXRpbHMgPSByZXF1aXJlKFwiLi9lbGVtZW50LXV0aWxzXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBldmVudExpc3RlbmVycyA9IHt9O1xuXG4gICAgLyoqXG4gICAgICogR2V0cyBhbGwgbGlzdGVuZXJzIGZvciB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRvIGdldCBhbGwgbGlzdGVuZXJzIGZvci5cbiAgICAgKiBAcmV0dXJucyBBbGwgbGlzdGVuZXJzIGZvciB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRMaXN0ZW5lcnMoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZXZlbnRMaXN0ZW5lcnNbZWxlbWVudFV0aWxzLmdldElkKGVsZW1lbnQpXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdG9yZXMgdGhlIGdpdmVuIGxpc3RlbmVyIGZvciB0aGUgZ2l2ZW4gZWxlbWVudC4gV2lsbCBub3QgYWN0dWFsbHkgYWRkIHRoZSBsaXN0ZW5lciB0byB0aGUgZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRoYXQgc2hvdWxkIGhhdmUgdGhlIGxpc3RlbmVyIGFkZGVkLlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGxpc3RlbmVyIFRoZSBjYWxsYmFjayB0aGF0IHRoZSBlbGVtZW50IGhhcyBhZGRlZC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhZGRMaXN0ZW5lcihlbGVtZW50LCBsaXN0ZW5lcikge1xuICAgICAgICB2YXIgaWQgPSBlbGVtZW50VXRpbHMuZ2V0SWQoZWxlbWVudCk7XG5cbiAgICAgICAgaWYoIWV2ZW50TGlzdGVuZXJzW2lkXSkge1xuICAgICAgICAgICAgZXZlbnRMaXN0ZW5lcnNbaWRdID0gW107XG4gICAgICAgIH1cblxuICAgICAgICBldmVudExpc3RlbmVyc1tpZF0ucHVzaChsaXN0ZW5lcik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ2V0OiBnZXRMaXN0ZW5lcnMsXG4gICAgICAgIGFkZDogYWRkTGlzdGVuZXJcbiAgICB9O1xufTtcbiJdfQ==
