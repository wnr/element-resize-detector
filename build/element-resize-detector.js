!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.elementResizeDetectorMaker=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
//Heavily inspired by http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/

"use strict";

module.exports = function(dependencies, options) {
    dependencies = dependencies || {};

    options = options || {};
    var allowMultipleListeners = !!options.allowMultipleListeners;

    var eventListenerHandler = eventListenerHandlerMaker(dependencies);

    /**
     * Makes the given elements resize-detectable and starts listening to resize events on the elements. Calls the event callback for each event for each element.
     * @public
     * @param {element[]|element} elements The given array of elements to detect resize events of. Single element is also valid.
     * @param {function} callback The callback to be executed for each resize event for each element.
     */
    function listenTo(elements, callback) {
        if(elements.length === undefined) {
            elements = [elements];
        }

        forEach(elements, function(element) {
            if(!isDetectable(element)) {
                //The element is not prepared to be detectable, so do prepare it and add a listener to it.
                return makeDetectable(element, function(element) {
                    addListener(element, callback);
                });
            }
            
            //The element has been prepared to be detectable and is ready to be listened to.
            
            if(isListenedTo(element) && !allowMultipleListeners) {
                //Since there is a listener and we disallow multiple listeners no listener should be added.
                return;
            }

            //Since multiple listeners is allowed, another listener is added to the element.
            return addListener(element, callback);
        });
    }

    /**
     * Tells if the element has been made detectable and ready to be listened for resize events.
     * @private
     */
    function isDetectable(element) {
        return getObject(element);
    }

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

    /**
     * Makes an element detectable and ready to be listened for resize events. Will call the callback when the element is ready to be listened for resize changes.
     * @private
     * @param {element} element The element to make detectable
     * @param {function} callback The callback to be called when the element is ready to be listened for resize changes. Will be called with the element as first parameter.
     */
    function makeDetectable(element, callback) {
        function onObjectLoad() {
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

        var id = uid();

        //Create an unique elq-target-id for the target element, so that event listeners can be identified to this element.
        element.setAttribute("elq-target-id", id);

        //Add an object element as a child to the target element that will be listened to for resize events.
        var object = document.createElement("object");
        object.type = "text/html";
        object.data = "about:blank";
        object.onload = onObjectLoad;
        object.setAttribute("elq-object-id", id);
        element.appendChild(object);
    }

    /**
     * Determines if there is any resize listener that listens to the element.
     * @private
     * @param {element} element The element to be checked for listeners
     * @param {function} callback The callback to be called when a resize event has been fired
     * @returns True if there is any listener. Returns False otherwise or if the element is not detectable.
     */
    function isListenedTo(element) {
        return isDetectable() && eventListenerHandler.get(element).length;
    }

    function addListener(element, callback) {
        var object = getObject(element);
        object.contentDocument.defaultView.addEventListener("resize", function() {
            callback(element);
        });
        eventListenerHandler.add(element, callback);
    }

    var uidCount = 1;
    function uid() {
        return uidCount++;
    }

    return {
        listenTo: listenTo
    };
};

function eventListenerHandlerMaker() {
    var eventListeners = {};

    function getEventListeners(element) {
        return eventListeners[getId(element)];
    }

    function addEventListener(element, listener) {
        var id = getId(element);
        if(!eventListeners[id]) {
            eventListeners[id] = [];
        }

        eventListeners[id].push(element, listener);
    }

    function getId(element) {
        var id = element.getAttribute("elq-target-id");
        if(!id) {
            throw new Error("Invalid elq-target-id of element");
        }
        return id;
    }

    return {
        get: getEventListeners,
        add: addEventListener
    };
}

function forEach(collection, callback) {
    for(var i = 0; i < collection.length; i++) {
        var result = callback(collection[i]);
        if(result) {
            return result;
        }
    }
}

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZWxlbWVudC1yZXNpemUtZGV0ZWN0b3IuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLy9IZWF2aWx5IGluc3BpcmVkIGJ5IGh0dHA6Ly93d3cuYmFja2FsbGV5Y29kZXIuY29tLzIwMTMvMDMvMTgvY3Jvc3MtYnJvd3Nlci1ldmVudC1iYXNlZC1lbGVtZW50LXJlc2l6ZS1kZXRlY3Rpb24vXG5cblwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGRlcGVuZGVuY2llcywgb3B0aW9ucykge1xuICAgIGRlcGVuZGVuY2llcyA9IGRlcGVuZGVuY2llcyB8fCB7fTtcblxuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciBhbGxvd011bHRpcGxlTGlzdGVuZXJzID0gISFvcHRpb25zLmFsbG93TXVsdGlwbGVMaXN0ZW5lcnM7XG5cbiAgICB2YXIgZXZlbnRMaXN0ZW5lckhhbmRsZXIgPSBldmVudExpc3RlbmVySGFuZGxlck1ha2VyKGRlcGVuZGVuY2llcyk7XG5cbiAgICAvKipcbiAgICAgKiBNYWtlcyB0aGUgZ2l2ZW4gZWxlbWVudHMgcmVzaXplLWRldGVjdGFibGUgYW5kIHN0YXJ0cyBsaXN0ZW5pbmcgdG8gcmVzaXplIGV2ZW50cyBvbiB0aGUgZWxlbWVudHMuIENhbGxzIHRoZSBldmVudCBjYWxsYmFjayBmb3IgZWFjaCBldmVudCBmb3IgZWFjaCBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnRbXXxlbGVtZW50fSBlbGVtZW50cyBUaGUgZ2l2ZW4gYXJyYXkgb2YgZWxlbWVudHMgdG8gZGV0ZWN0IHJlc2l6ZSBldmVudHMgb2YuIFNpbmdsZSBlbGVtZW50IGlzIGFsc28gdmFsaWQuXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIGJlIGV4ZWN1dGVkIGZvciBlYWNoIHJlc2l6ZSBldmVudCBmb3IgZWFjaCBlbGVtZW50LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGxpc3RlblRvKGVsZW1lbnRzLCBjYWxsYmFjaykge1xuICAgICAgICBpZihlbGVtZW50cy5sZW5ndGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgZWxlbWVudHMgPSBbZWxlbWVudHNdO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yRWFjaChlbGVtZW50cywgZnVuY3Rpb24oZWxlbWVudCkge1xuICAgICAgICAgICAgaWYoIWlzRGV0ZWN0YWJsZShlbGVtZW50KSkge1xuICAgICAgICAgICAgICAgIC8vVGhlIGVsZW1lbnQgaXMgbm90IHByZXBhcmVkIHRvIGJlIGRldGVjdGFibGUsIHNvIGRvIHByZXBhcmUgaXQgYW5kIGFkZCBhIGxpc3RlbmVyIHRvIGl0LlxuICAgICAgICAgICAgICAgIHJldHVybiBtYWtlRGV0ZWN0YWJsZShlbGVtZW50LCBmdW5jdGlvbihlbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGFkZExpc3RlbmVyKGVsZW1lbnQsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy9UaGUgZWxlbWVudCBoYXMgYmVlbiBwcmVwYXJlZCB0byBiZSBkZXRlY3RhYmxlIGFuZCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCB0by5cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYoaXNMaXN0ZW5lZFRvKGVsZW1lbnQpICYmICFhbGxvd011bHRpcGxlTGlzdGVuZXJzKSB7XG4gICAgICAgICAgICAgICAgLy9TaW5jZSB0aGVyZSBpcyBhIGxpc3RlbmVyIGFuZCB3ZSBkaXNhbGxvdyBtdWx0aXBsZSBsaXN0ZW5lcnMgbm8gbGlzdGVuZXIgc2hvdWxkIGJlIGFkZGVkLlxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9TaW5jZSBtdWx0aXBsZSBsaXN0ZW5lcnMgaXMgYWxsb3dlZCwgYW5vdGhlciBsaXN0ZW5lciBpcyBhZGRlZCB0byB0aGUgZWxlbWVudC5cbiAgICAgICAgICAgIHJldHVybiBhZGRMaXN0ZW5lcihlbGVtZW50LCBjYWxsYmFjayk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRlbGxzIGlmIHRoZSBlbGVtZW50IGhhcyBiZWVuIG1hZGUgZGV0ZWN0YWJsZSBhbmQgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBldmVudHMuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpc0RldGVjdGFibGUoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZ2V0T2JqZWN0KGVsZW1lbnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGNoaWxkIG9iamVjdCBvZiB0aGUgdGFyZ2V0IGVsZW1lbnQuXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIHRhcmdldCBlbGVtZW50LlxuICAgICAqIEByZXR1cm5zIFRoZSBvYmplY3QgZWxlbWVudCBvZiB0aGUgdGFyZ2V0LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldE9iamVjdChlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBmb3JFYWNoKGVsZW1lbnQuY2hpbGRyZW4sIGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgICAgICAgICBpZihjaGlsZC5oYXNBdHRyaWJ1dGUoXCJlbHEtb2JqZWN0LWlkXCIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNoaWxkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNYWtlcyBhbiBlbGVtZW50IGRldGVjdGFibGUgYW5kIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgZXZlbnRzLiBXaWxsIGNhbGwgdGhlIGNhbGxiYWNrIHdoZW4gdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBjaGFuZ2VzLlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRvIG1ha2UgZGV0ZWN0YWJsZVxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIFRoZSBjYWxsYmFjayB0byBiZSBjYWxsZWQgd2hlbiB0aGUgZWxlbWVudCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGNoYW5nZXMuIFdpbGwgYmUgY2FsbGVkIHdpdGggdGhlIGVsZW1lbnQgYXMgZmlyc3QgcGFyYW1ldGVyLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIG1ha2VEZXRlY3RhYmxlKGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gICAgICAgIGZ1bmN0aW9uIG9uT2JqZWN0TG9hZCgpIHtcbiAgICAgICAgICAgIC8vQ3JlYXRlIHRoZSBzdHlsZSBlbGVtZW50IHRvIGJlIGFkZGVkIHRvIHRoZSBvYmplY3QuXG4gICAgICAgICAgICB2YXIgb2JqZWN0RG9jdW1lbnQgPSB0aGlzLmNvbnRlbnREb2N1bWVudDtcbiAgICAgICAgICAgIHZhciBzdHlsZSA9IG9iamVjdERvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgICAgICAgICAgIHN0eWxlLmlubmVySFRNTCA9IFwiaHRtbCwgYm9keSB7IG1hcmdpbjogMDsgcGFkZGluZzogMCB9IGRpdiB7IC13ZWJraXQtdHJhbnNpdGlvbjogb3BhY2l0eSAwLjAxczsgLW1zLXRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IC1vLXRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IHRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IG9wYWNpdHk6IDA7IH1cIjtcblxuICAgICAgICAgICAgLy9UT0RPOiBSZW1vdmUgYW55IHN0eWxlcyB0aGF0IGhhcyBiZWVuIHNldCBvbiB0aGUgb2JqZWN0LiBPbmx5IHRoZSBzdHlsZSBhYm92ZSBzaG91bGQgYmUgc3R5bGluZyB0aGUgb2JqZWN0LlxuXG4gICAgICAgICAgICAvL0FwcGVuZCB0aGUgc3R5bGUgdG8gdGhlIG9iamVjdC5cbiAgICAgICAgICAgIG9iamVjdERvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuXG4gICAgICAgICAgICB0aGlzLnN0eWxlLmNzc1RleHQgPSBcImRpc3BsYXk6IGJsb2NrOyBwb3NpdGlvbjogYWJzb2x1dGU7IHRvcDogMDsgbGVmdDogMDsgd2lkdGg6IDEwMCU7IGhlaWdodDogMTAwJTsgYm9yZGVyOiBub25lOyBwYWRkaW5nOiAwOyBtYXJnaW46IDA7IG9wYWNpdHk6IDA7IHotaW5kZXg6IC0xMDAwOyBwb2ludGVyLWV2ZW50czogbm9uZTtcIjtcblxuICAgICAgICAgICAgLy9Ob3RpZnkgdGhhdCB0aGUgZWxlbWVudCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCB0by5cbiAgICAgICAgICAgIGNhbGxiYWNrKGVsZW1lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGlkID0gdWlkKCk7XG5cbiAgICAgICAgLy9DcmVhdGUgYW4gdW5pcXVlIGVscS10YXJnZXQtaWQgZm9yIHRoZSB0YXJnZXQgZWxlbWVudCwgc28gdGhhdCBldmVudCBsaXN0ZW5lcnMgY2FuIGJlIGlkZW50aWZpZWQgdG8gdGhpcyBlbGVtZW50LlxuICAgICAgICBlbGVtZW50LnNldEF0dHJpYnV0ZShcImVscS10YXJnZXQtaWRcIiwgaWQpO1xuXG4gICAgICAgIC8vQWRkIGFuIG9iamVjdCBlbGVtZW50IGFzIGEgY2hpbGQgdG8gdGhlIHRhcmdldCBlbGVtZW50IHRoYXQgd2lsbCBiZSBsaXN0ZW5lZCB0byBmb3IgcmVzaXplIGV2ZW50cy5cbiAgICAgICAgdmFyIG9iamVjdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJvYmplY3RcIik7XG4gICAgICAgIG9iamVjdC50eXBlID0gXCJ0ZXh0L2h0bWxcIjtcbiAgICAgICAgb2JqZWN0LmRhdGEgPSBcImFib3V0OmJsYW5rXCI7XG4gICAgICAgIG9iamVjdC5vbmxvYWQgPSBvbk9iamVjdExvYWQ7XG4gICAgICAgIG9iamVjdC5zZXRBdHRyaWJ1dGUoXCJlbHEtb2JqZWN0LWlkXCIsIGlkKTtcbiAgICAgICAgZWxlbWVudC5hcHBlbmRDaGlsZChvYmplY3QpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERldGVybWluZXMgaWYgdGhlcmUgaXMgYW55IHJlc2l6ZSBsaXN0ZW5lciB0aGF0IGxpc3RlbnMgdG8gdGhlIGVsZW1lbnQuXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdG8gYmUgY2hlY2tlZCBmb3IgbGlzdGVuZXJzXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCB3aGVuIGEgcmVzaXplIGV2ZW50IGhhcyBiZWVuIGZpcmVkXG4gICAgICogQHJldHVybnMgVHJ1ZSBpZiB0aGVyZSBpcyBhbnkgbGlzdGVuZXIuIFJldHVybnMgRmFsc2Ugb3RoZXJ3aXNlIG9yIGlmIHRoZSBlbGVtZW50IGlzIG5vdCBkZXRlY3RhYmxlLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzTGlzdGVuZWRUbyhlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBpc0RldGVjdGFibGUoKSAmJiBldmVudExpc3RlbmVySGFuZGxlci5nZXQoZWxlbWVudCkubGVuZ3RoO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGFkZExpc3RlbmVyKGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBvYmplY3QgPSBnZXRPYmplY3QoZWxlbWVudCk7XG4gICAgICAgIG9iamVjdC5jb250ZW50RG9jdW1lbnQuZGVmYXVsdFZpZXcuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKGVsZW1lbnQpO1xuICAgICAgICB9KTtcbiAgICAgICAgZXZlbnRMaXN0ZW5lckhhbmRsZXIuYWRkKGVsZW1lbnQsIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICB2YXIgdWlkQ291bnQgPSAxO1xuICAgIGZ1bmN0aW9uIHVpZCgpIHtcbiAgICAgICAgcmV0dXJuIHVpZENvdW50Kys7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgbGlzdGVuVG86IGxpc3RlblRvXG4gICAgfTtcbn07XG5cbmZ1bmN0aW9uIGV2ZW50TGlzdGVuZXJIYW5kbGVyTWFrZXIoKSB7XG4gICAgdmFyIGV2ZW50TGlzdGVuZXJzID0ge307XG5cbiAgICBmdW5jdGlvbiBnZXRFdmVudExpc3RlbmVycyhlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBldmVudExpc3RlbmVyc1tnZXRJZChlbGVtZW50KV07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYWRkRXZlbnRMaXN0ZW5lcihlbGVtZW50LCBsaXN0ZW5lcikge1xuICAgICAgICB2YXIgaWQgPSBnZXRJZChlbGVtZW50KTtcbiAgICAgICAgaWYoIWV2ZW50TGlzdGVuZXJzW2lkXSkge1xuICAgICAgICAgICAgZXZlbnRMaXN0ZW5lcnNbaWRdID0gW107XG4gICAgICAgIH1cblxuICAgICAgICBldmVudExpc3RlbmVyc1tpZF0ucHVzaChlbGVtZW50LCBsaXN0ZW5lcik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0SWQoZWxlbWVudCkge1xuICAgICAgICB2YXIgaWQgPSBlbGVtZW50LmdldEF0dHJpYnV0ZShcImVscS10YXJnZXQtaWRcIik7XG4gICAgICAgIGlmKCFpZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBlbHEtdGFyZ2V0LWlkIG9mIGVsZW1lbnRcIik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGlkO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGdldDogZ2V0RXZlbnRMaXN0ZW5lcnMsXG4gICAgICAgIGFkZDogYWRkRXZlbnRMaXN0ZW5lclxuICAgIH07XG59XG5cbmZ1bmN0aW9uIGZvckVhY2goY29sbGVjdGlvbiwgY2FsbGJhY2spIHtcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgY29sbGVjdGlvbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgcmVzdWx0ID0gY2FsbGJhY2soY29sbGVjdGlvbltpXSk7XG4gICAgICAgIGlmKHJlc3VsdCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgIH1cbn1cbiJdfQ==
