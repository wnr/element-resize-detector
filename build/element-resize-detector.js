(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.elementResizeDetectorMaker = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{}],2:[function(require,module,exports){
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

},{}],3:[function(require,module,exports){
//Heavily inspired by http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/

"use strict";

var forEach = require("./collection-utils").forEach;
var elementUtilsMaker = require("./element-utils");
var listenerHandlerMaker = require("./listener-handler");
var idGeneratorMaker = require("./id-generator");
var idHandlerMaker = require("./id-handler");

function getOption(options, name, defaultValue) {
    var value = options[name];

    if((value === undefined || value === null) && defaultValue !== undefined) {
        return defaultValue;
    }

    return value;
}

module.exports = function(options) {
    options = options || {};

    //Options to be used as default for the listenTo function.
    var globalOptions = {};
    globalOptions.callOnAdd = !!getOption(options, "callOnAdd", true);

    //idHandler is currently not an option to the listenTo function, so it should not be added to globalOptions.
    var idHandler = options.idHandler;

    if(!idHandler) {
        var idGenerator = idGeneratorMaker();
        var defaultIdHandler = idHandlerMaker(idGenerator);
        idHandler = defaultIdHandler;
    }

    var eventListenerHandler = listenerHandlerMaker(idHandler);
    var elementUtils = elementUtilsMaker(idHandler);

    /**
     * Makes the given elements resize-detectable and starts listening to resize events on the elements. Calls the event callback for each event for each element.
     * @public
     * @param {object?} options Optional options object. These options will override the global options.
     * @param {element[]|element} elements The given array of elements to detect resize events of. Single element is also valid.
     * @param {function} listener The callback to be executed for each resize event for each element.
     */
    function listenTo(options, elements, listener) {
        function onResizeCallback(element) {
            var listeners = eventListenerHandler.get(element);

            forEach(listeners, function(listener) {
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

        var callOnAdd = getOption(options, "callOnAdd", globalOptions.callOnAdd);

        forEach(elements, function(element) {
            if(!elementUtils.isDetectable(element)) {
                //The element is not prepared to be detectable, so do prepare it and add a listener to it.
                return elementUtils.makeDetectable(element, function(element) {
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

},{"./collection-utils":2,"./element-utils":4,"./id-generator":5,"./id-handler":6,"./listener-handler":7}],4:[function(require,module,exports){
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
    function makeDetectable(element, callback) {
        function injectObject(id, element, callback) {
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

            //The target element needs to be positioned (everything except static) so the absolute positioned object will be positioned relative to the target element.
            if(getComputedStyle(element).position === "static") {
                element.style.position = "relative";
            }

            //Add an object element as a child to the target element that will be listened to for resize events.
            var object = document.createElement("object");
            object.type = "text/html";
            object.style.cssText = OBJECT_STYLE;
            object.onload = onObjectLoad;
            object.setAttribute("erd-object-id", id);

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
        return forEach(element.children, function(child) {
            if(child.hasAttribute("erd-object-id")) {
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

},{"./browser-detector":1,"./collection-utils":2}],5:[function(require,module,exports){
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

},{}],6:[function(require,module,exports){
"use strict";

module.exports = function(idGenerator) {

    /**
     * Gets the resize detector id of the element.
     * @public
     * @param {element} The target element to get the id of.
     * @returns {string|number} The id of the element.
     */
    function getId(element) {
        return element.getAttribute("erd-target-id");
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

        element.setAttribute("erd-target-id", id);

        return id;
    }

    return {
        get: getId,
        set: setId
    };
};

},{}],7:[function(require,module,exports){
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

},{}]},{},[3])(3)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYnJvd3Nlci1kZXRlY3Rvci5qcyIsInNyYy9jb2xsZWN0aW9uLXV0aWxzLmpzIiwic3JjL2VsZW1lbnQtcmVzaXplLWRldGVjdG9yLmpzIiwic3JjL2VsZW1lbnQtdXRpbHMuanMiLCJzcmMvaWQtZ2VuZXJhdG9yLmpzIiwic3JjL2lkLWhhbmRsZXIuanMiLCJzcmMvbGlzdGVuZXItaGFuZGxlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBkZXRlY3RvciA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbmRldGVjdG9yLmlzSUUgPSBmdW5jdGlvbih2ZXJzaW9uKSB7XG4gICAgZnVuY3Rpb24gaXNBbnlJZVZlcnNpb24oKSB7XG4gICAgICAgIHZhciBhZ2VudCA9IG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgcmV0dXJuIGFnZW50LmluZGV4T2YoXCJtc2llXCIpICE9PSAtMSB8fCBhZ2VudC5pbmRleE9mKFwidHJpZGVudFwiKSAhPT0gLTE7XG4gICAgfVxuXG4gICAgaWYoIWlzQW55SWVWZXJzaW9uKCkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmKCF2ZXJzaW9uKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8vU2hhbWVsZXNzbHkgc3RvbGVuIGZyb20gaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vcGFkb2xzZXkvNTI3NjgzXG4gICAgdmFyIGllVmVyc2lvbiA9IChmdW5jdGlvbigpe1xuICAgICAgICB2YXIgdW5kZWYsXG4gICAgICAgICAgICB2ID0gMyxcbiAgICAgICAgICAgIGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksXG4gICAgICAgICAgICBhbGwgPSBkaXYuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJpXCIpO1xuXG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIGRpdi5pbm5lckhUTUwgPSBcIjwhLS1baWYgZ3QgSUUgXCIgKyAoKyt2KSArIFwiXT48aT48L2k+PCFbZW5kaWZdLS0+XCI7XG4gICAgICAgIH1cbiAgICAgICAgd2hpbGUgKGFsbFswXSk7XG5cbiAgICAgICAgcmV0dXJuIHYgPiA0ID8gdiA6IHVuZGVmO1xuICAgIH0oKSk7XG5cbiAgICByZXR1cm4gdmVyc2lvbiA9PT0gaWVWZXJzaW9uO1xufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgdXRpbHMgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG4vKipcbiAqIExvb3BzIHRocm91Z2ggdGhlIGNvbGxlY3Rpb24gYW5kIGNhbGxzIHRoZSBjYWxsYmFjayBmb3IgZWFjaCBlbGVtZW50LiBpZiB0aGUgY2FsbGJhY2sgcmV0dXJucyB0cnV0aHksIHRoZSBsb29wIGlzIGJyb2tlbiBhbmQgcmV0dXJucyB0aGUgc2FtZSB2YWx1ZS5cbiAqIEBwdWJsaWNcbiAqIEBwYXJhbSB7Kn0gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBsb29wIHRocm91Z2guIE5lZWRzIHRvIGhhdmUgYSBsZW5ndGggcHJvcGVydHkgc2V0IGFuZCBoYXZlIGluZGljZXMgc2V0IGZyb20gMCB0byBsZW5ndGggLSAxLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIGJlIGNhbGxlZCBmb3IgZWFjaCBlbGVtZW50LiBUaGUgZWxlbWVudCB3aWxsIGJlIGdpdmVuIGFzIGEgcGFyYW1ldGVyIHRvIHRoZSBjYWxsYmFjay4gSWYgdGhpcyBjYWxsYmFjayByZXR1cm5zIHRydXRoeSwgdGhlIGxvb3AgaXMgYnJva2VuIGFuZCB0aGUgc2FtZSB2YWx1ZSBpcyByZXR1cm5lZC5cbiAqIEByZXR1cm5zIHsqfSBUaGUgdmFsdWUgdGhhdCBhIGNhbGxiYWNrIGhhcyByZXR1cm5lZCAoaWYgdHJ1dGh5KS4gT3RoZXJ3aXNlIG5vdGhpbmcuXG4gKi9cbnV0aWxzLmZvckVhY2ggPSBmdW5jdGlvbihjb2xsZWN0aW9uLCBjYWxsYmFjaykge1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBjb2xsZWN0aW9uLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBjYWxsYmFjayhjb2xsZWN0aW9uW2ldKTtcbiAgICAgICAgaWYocmVzdWx0KSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgfVxufTtcbiIsIi8vSGVhdmlseSBpbnNwaXJlZCBieSBodHRwOi8vd3d3LmJhY2thbGxleWNvZGVyLmNvbS8yMDEzLzAzLzE4L2Nyb3NzLWJyb3dzZXItZXZlbnQtYmFzZWQtZWxlbWVudC1yZXNpemUtZGV0ZWN0aW9uL1xuXG5cInVzZSBzdHJpY3RcIjtcblxudmFyIGZvckVhY2ggPSByZXF1aXJlKFwiLi9jb2xsZWN0aW9uLXV0aWxzXCIpLmZvckVhY2g7XG52YXIgZWxlbWVudFV0aWxzTWFrZXIgPSByZXF1aXJlKFwiLi9lbGVtZW50LXV0aWxzXCIpO1xudmFyIGxpc3RlbmVySGFuZGxlck1ha2VyID0gcmVxdWlyZShcIi4vbGlzdGVuZXItaGFuZGxlclwiKTtcbnZhciBpZEdlbmVyYXRvck1ha2VyID0gcmVxdWlyZShcIi4vaWQtZ2VuZXJhdG9yXCIpO1xudmFyIGlkSGFuZGxlck1ha2VyID0gcmVxdWlyZShcIi4vaWQtaGFuZGxlclwiKTtcblxuZnVuY3Rpb24gZ2V0T3B0aW9uKG9wdGlvbnMsIG5hbWUsIGRlZmF1bHRWYWx1ZSkge1xuICAgIHZhciB2YWx1ZSA9IG9wdGlvbnNbbmFtZV07XG5cbiAgICBpZigodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkgJiYgZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdmFsdWU7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgLy9PcHRpb25zIHRvIGJlIHVzZWQgYXMgZGVmYXVsdCBmb3IgdGhlIGxpc3RlblRvIGZ1bmN0aW9uLlxuICAgIHZhciBnbG9iYWxPcHRpb25zID0ge307XG4gICAgZ2xvYmFsT3B0aW9ucy5jYWxsT25BZGQgPSAhIWdldE9wdGlvbihvcHRpb25zLCBcImNhbGxPbkFkZFwiLCB0cnVlKTtcblxuICAgIC8vaWRIYW5kbGVyIGlzIGN1cnJlbnRseSBub3QgYW4gb3B0aW9uIHRvIHRoZSBsaXN0ZW5UbyBmdW5jdGlvbiwgc28gaXQgc2hvdWxkIG5vdCBiZSBhZGRlZCB0byBnbG9iYWxPcHRpb25zLlxuICAgIHZhciBpZEhhbmRsZXIgPSBvcHRpb25zLmlkSGFuZGxlcjtcblxuICAgIGlmKCFpZEhhbmRsZXIpIHtcbiAgICAgICAgdmFyIGlkR2VuZXJhdG9yID0gaWRHZW5lcmF0b3JNYWtlcigpO1xuICAgICAgICB2YXIgZGVmYXVsdElkSGFuZGxlciA9IGlkSGFuZGxlck1ha2VyKGlkR2VuZXJhdG9yKTtcbiAgICAgICAgaWRIYW5kbGVyID0gZGVmYXVsdElkSGFuZGxlcjtcbiAgICB9XG5cbiAgICB2YXIgZXZlbnRMaXN0ZW5lckhhbmRsZXIgPSBsaXN0ZW5lckhhbmRsZXJNYWtlcihpZEhhbmRsZXIpO1xuICAgIHZhciBlbGVtZW50VXRpbHMgPSBlbGVtZW50VXRpbHNNYWtlcihpZEhhbmRsZXIpO1xuXG4gICAgLyoqXG4gICAgICogTWFrZXMgdGhlIGdpdmVuIGVsZW1lbnRzIHJlc2l6ZS1kZXRlY3RhYmxlIGFuZCBzdGFydHMgbGlzdGVuaW5nIHRvIHJlc2l6ZSBldmVudHMgb24gdGhlIGVsZW1lbnRzLiBDYWxscyB0aGUgZXZlbnQgY2FsbGJhY2sgZm9yIGVhY2ggZXZlbnQgZm9yIGVhY2ggZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtvYmplY3Q/fSBvcHRpb25zIE9wdGlvbmFsIG9wdGlvbnMgb2JqZWN0LiBUaGVzZSBvcHRpb25zIHdpbGwgb3ZlcnJpZGUgdGhlIGdsb2JhbCBvcHRpb25zLlxuICAgICAqIEBwYXJhbSB7ZWxlbWVudFtdfGVsZW1lbnR9IGVsZW1lbnRzIFRoZSBnaXZlbiBhcnJheSBvZiBlbGVtZW50cyB0byBkZXRlY3QgcmVzaXplIGV2ZW50cyBvZi4gU2luZ2xlIGVsZW1lbnQgaXMgYWxzbyB2YWxpZC5cbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBsaXN0ZW5lciBUaGUgY2FsbGJhY2sgdG8gYmUgZXhlY3V0ZWQgZm9yIGVhY2ggcmVzaXplIGV2ZW50IGZvciBlYWNoIGVsZW1lbnQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gbGlzdGVuVG8ob3B0aW9ucywgZWxlbWVudHMsIGxpc3RlbmVyKSB7XG4gICAgICAgIGZ1bmN0aW9uIG9uUmVzaXplQ2FsbGJhY2soZWxlbWVudCkge1xuICAgICAgICAgICAgdmFyIGxpc3RlbmVycyA9IGV2ZW50TGlzdGVuZXJIYW5kbGVyLmdldChlbGVtZW50KTtcblxuICAgICAgICAgICAgZm9yRWFjaChsaXN0ZW5lcnMsIGZ1bmN0aW9uKGxpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIoZWxlbWVudCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG9uRWxlbWVudFJlYWR5VG9BZGRMaXN0ZW5lcihjYWxsT25BZGQsIGVsZW1lbnQsIGxpc3RlbmVyKSB7XG4gICAgICAgICAgICBldmVudExpc3RlbmVySGFuZGxlci5hZGQoZWxlbWVudCwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZihjYWxsT25BZGQpIHtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcihlbGVtZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vT3B0aW9ucyBvYmplY3QgbWF5IGJlIG9taXR0ZWQuXG4gICAgICAgIGlmKCFsaXN0ZW5lcikge1xuICAgICAgICAgICAgbGlzdGVuZXIgPSBlbGVtZW50cztcbiAgICAgICAgICAgIGVsZW1lbnRzID0gb3B0aW9ucztcbiAgICAgICAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCFlbGVtZW50cykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQXQgbGVhc3Qgb25lIGVsZW1lbnQgcmVxdWlyZWQuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIWxpc3RlbmVyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJMaXN0ZW5lciByZXF1aXJlZC5cIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZihlbGVtZW50cy5sZW5ndGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgZWxlbWVudHMgPSBbZWxlbWVudHNdO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGNhbGxPbkFkZCA9IGdldE9wdGlvbihvcHRpb25zLCBcImNhbGxPbkFkZFwiLCBnbG9iYWxPcHRpb25zLmNhbGxPbkFkZCk7XG5cbiAgICAgICAgZm9yRWFjaChlbGVtZW50cywgZnVuY3Rpb24oZWxlbWVudCkge1xuICAgICAgICAgICAgaWYoIWVsZW1lbnRVdGlscy5pc0RldGVjdGFibGUoZWxlbWVudCkpIHtcbiAgICAgICAgICAgICAgICAvL1RoZSBlbGVtZW50IGlzIG5vdCBwcmVwYXJlZCB0byBiZSBkZXRlY3RhYmxlLCBzbyBkbyBwcmVwYXJlIGl0IGFuZCBhZGQgYSBsaXN0ZW5lciB0byBpdC5cbiAgICAgICAgICAgICAgICByZXR1cm4gZWxlbWVudFV0aWxzLm1ha2VEZXRlY3RhYmxlKGVsZW1lbnQsIGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudFV0aWxzLmFkZExpc3RlbmVyKGVsZW1lbnQsIG9uUmVzaXplQ2FsbGJhY2spO1xuICAgICAgICAgICAgICAgICAgICBvbkVsZW1lbnRSZWFkeVRvQWRkTGlzdGVuZXIoY2FsbE9uQWRkLCBlbGVtZW50LCBsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vVGhlIGVsZW1lbnQgaGFzIGJlZW4gcHJlcGFyZWQgdG8gYmUgZGV0ZWN0YWJsZSBhbmQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgdG8uXG4gICAgICAgICAgICBvbkVsZW1lbnRSZWFkeVRvQWRkTGlzdGVuZXIoY2FsbE9uQWRkLCBlbGVtZW50LCBsaXN0ZW5lcik7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGxpc3RlblRvOiBsaXN0ZW5Ub1xuICAgIH07XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBmb3JFYWNoID0gcmVxdWlyZShcIi4vY29sbGVjdGlvbi11dGlsc1wiKS5mb3JFYWNoO1xudmFyIGJyb3dzZXJEZXRlY3RvciA9IHJlcXVpcmUoXCIuL2Jyb3dzZXItZGV0ZWN0b3JcIik7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oaWRIYW5kbGVyKSB7XG4gICAgLyoqXG4gICAgICogVGVsbHMgaWYgdGhlIGVsZW1lbnQgaGFzIGJlZW4gbWFkZSBkZXRlY3RhYmxlIGFuZCByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGV2ZW50cy5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBUaGUgZWxlbWVudCB0byBjaGVjay5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBvciBmYWxzZSBkZXBlbmRpbmcgb24gaWYgdGhlIGVsZW1lbnQgaXMgZGV0ZWN0YWJsZSBvciBub3QuXG4gICAgICovXG4gICAgZnVuY3Rpb24gaXNEZXRlY3RhYmxlKGVsZW1lbnQpIHtcbiAgICAgICAgaWYoYnJvd3NlckRldGVjdG9yLmlzSUUoOCkpIHtcbiAgICAgICAgICAgIC8vSUUgOCBkb2VzIG5vdCB1c2UgdGhlIG9iamVjdCBtZXRob2QuXG4gICAgICAgICAgICAvL0NoZWNrIG9ubHkgaWYgdGhlIGVsZW1lbnQgaGFzIGJlZW4gZ2l2ZW4gYW4gaWQuXG4gICAgICAgICAgICByZXR1cm4gISFpZEhhbmRsZXIuZ2V0KGVsZW1lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuICEhZ2V0T2JqZWN0KGVsZW1lbnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSByZXNpemUgZXZlbnQgbGlzdGVuZXIgdG8gdGhlIGVsZW1lbnQuXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBwYXJhbSB7ZWxlbWVudH0gZWxlbWVudCBUaGUgZWxlbWVudCB0aGF0IHNob3VsZCBoYXZlIHRoZSBsaXN0ZW5lciBhZGRlZC5cbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBsaXN0ZW5lciBUaGUgbGlzdGVuZXIgY2FsbGJhY2sgdG8gYmUgY2FsbGVkIGZvciBlYWNoIHJlc2l6ZSBldmVudCBvZiB0aGUgZWxlbWVudC4gVGhlIGVsZW1lbnQgd2lsbCBiZSBnaXZlbiBhcyBhIHBhcmFtZXRlciB0byB0aGUgbGlzdGVuZXIgY2FsbGJhY2suXG4gICAgICovXG4gICAgZnVuY3Rpb24gYWRkTGlzdGVuZXIoZWxlbWVudCwgbGlzdGVuZXIpIHtcbiAgICAgICAgaWYoIWlzRGV0ZWN0YWJsZShlbGVtZW50KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRWxlbWVudCBpcyBub3QgZGV0ZWN0YWJsZS5cIik7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBsaXN0ZW5lclByb3h5KCkge1xuICAgICAgICAgICAgbGlzdGVuZXIoZWxlbWVudCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZihicm93c2VyRGV0ZWN0b3IuaXNJRSg4KSkge1xuICAgICAgICAgICAgLy9JRSA4IGRvZXMgbm90IHN1cHBvcnQgb2JqZWN0LCBidXQgc3VwcG9ydHMgdGhlIHJlc2l6ZSBldmVudCBkaXJlY3RseSBvbiBlbGVtZW50cy5cbiAgICAgICAgICAgIGVsZW1lbnQuYXR0YWNoRXZlbnQoXCJvbnJlc2l6ZVwiLCBsaXN0ZW5lclByb3h5KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBvYmplY3QgPSBnZXRPYmplY3QoZWxlbWVudCk7XG4gICAgICAgICAgICBvYmplY3QuY29udGVudERvY3VtZW50LmRlZmF1bHRWaWV3LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgbGlzdGVuZXJQcm94eSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNYWtlcyBhbiBlbGVtZW50IGRldGVjdGFibGUgYW5kIHJlYWR5IHRvIGJlIGxpc3RlbmVkIGZvciByZXNpemUgZXZlbnRzLiBXaWxsIGNhbGwgdGhlIGNhbGxiYWNrIHdoZW4gdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgZm9yIHJlc2l6ZSBjaGFuZ2VzLlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRvIG1ha2UgZGV0ZWN0YWJsZVxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIFRoZSBjYWxsYmFjayB0byBiZSBjYWxsZWQgd2hlbiB0aGUgZWxlbWVudCBpcyByZWFkeSB0byBiZSBsaXN0ZW5lZCBmb3IgcmVzaXplIGNoYW5nZXMuIFdpbGwgYmUgY2FsbGVkIHdpdGggdGhlIGVsZW1lbnQgYXMgZmlyc3QgcGFyYW1ldGVyLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIG1ha2VEZXRlY3RhYmxlKGVsZW1lbnQsIGNhbGxiYWNrKSB7XG4gICAgICAgIGZ1bmN0aW9uIGluamVjdE9iamVjdChpZCwgZWxlbWVudCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHZhciBPQkpFQ1RfU1RZTEUgPSBcImRpc3BsYXk6IGJsb2NrOyBwb3NpdGlvbjogYWJzb2x1dGU7IHRvcDogMDsgbGVmdDogMDsgd2lkdGg6IDEwMCU7IGhlaWdodDogMTAwJTsgYm9yZGVyOiBub25lOyBwYWRkaW5nOiAwOyBtYXJnaW46IDA7IG9wYWNpdHk6IDA7IHotaW5kZXg6IC0xMDAwOyBwb2ludGVyLWV2ZW50czogbm9uZTtcIjtcblxuICAgICAgICAgICAgZnVuY3Rpb24gb25PYmplY3RMb2FkKCkge1xuICAgICAgICAgICAgICAgIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG5cbiAgICAgICAgICAgICAgICAvL0NyZWF0ZSB0aGUgc3R5bGUgZWxlbWVudCB0byBiZSBhZGRlZCB0byB0aGUgb2JqZWN0LlxuICAgICAgICAgICAgICAgIHZhciBvYmplY3REb2N1bWVudCA9IHRoaXMuY29udGVudERvY3VtZW50O1xuICAgICAgICAgICAgICAgIHZhciBzdHlsZSA9IG9iamVjdERvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgICAgICAgICAgICAgICBzdHlsZS5pbm5lckhUTUwgPSBcImh0bWwsIGJvZHkgeyBtYXJnaW46IDA7IHBhZGRpbmc6IDAgfSBkaXYgeyAtd2Via2l0LXRyYW5zaXRpb246IG9wYWNpdHkgMC4wMXM7IC1tcy10cmFuc2l0aW9uOiBvcGFjaXR5IDAuMDFzOyAtby10cmFuc2l0aW9uOiBvcGFjaXR5IDAuMDFzOyB0cmFuc2l0aW9uOiBvcGFjaXR5IDAuMDFzOyBvcGFjaXR5OiAwOyB9XCI7XG5cbiAgICAgICAgICAgICAgICAvL1RPRE86IFJlbW92ZSBhbnkgc3R5bGVzIHRoYXQgaGFzIGJlZW4gc2V0IG9uIHRoZSBvYmplY3QuIE9ubHkgdGhlIHN0eWxlIGFib3ZlIHNob3VsZCBiZSBzdHlsaW5nIHRoZSBvYmplY3QuXG5cbiAgICAgICAgICAgICAgICAvL0FwcGVuZCB0aGUgc3R5bGUgdG8gdGhlIG9iamVjdC5cbiAgICAgICAgICAgICAgICBvYmplY3REb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcblxuICAgICAgICAgICAgICAgIC8vVE9ETzogSXMgdGhpcyBuZWVkZWQgaGVyZT9cbiAgICAgICAgICAgICAgICAvL3RoaXMuc3R5bGUuY3NzVGV4dCA9IE9CSkVDVF9TVFlMRTtcblxuICAgICAgICAgICAgICAgIC8vTm90aWZ5IHRoYXQgdGhlIGVsZW1lbnQgaXMgcmVhZHkgdG8gYmUgbGlzdGVuZWQgdG8uXG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZWxlbWVudCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vVGhlIHRhcmdldCBlbGVtZW50IG5lZWRzIHRvIGJlIHBvc2l0aW9uZWQgKGV2ZXJ5dGhpbmcgZXhjZXB0IHN0YXRpYykgc28gdGhlIGFic29sdXRlIHBvc2l0aW9uZWQgb2JqZWN0IHdpbGwgYmUgcG9zaXRpb25lZCByZWxhdGl2ZSB0byB0aGUgdGFyZ2V0IGVsZW1lbnQuXG4gICAgICAgICAgICBpZihnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLnBvc2l0aW9uID09PSBcInN0YXRpY1wiKSB7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9IFwicmVsYXRpdmVcIjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9BZGQgYW4gb2JqZWN0IGVsZW1lbnQgYXMgYSBjaGlsZCB0byB0aGUgdGFyZ2V0IGVsZW1lbnQgdGhhdCB3aWxsIGJlIGxpc3RlbmVkIHRvIGZvciByZXNpemUgZXZlbnRzLlxuICAgICAgICAgICAgdmFyIG9iamVjdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJvYmplY3RcIik7XG4gICAgICAgICAgICBvYmplY3QudHlwZSA9IFwidGV4dC9odG1sXCI7XG4gICAgICAgICAgICBvYmplY3Quc3R5bGUuY3NzVGV4dCA9IE9CSkVDVF9TVFlMRTtcbiAgICAgICAgICAgIG9iamVjdC5vbmxvYWQgPSBvbk9iamVjdExvYWQ7XG4gICAgICAgICAgICBvYmplY3Quc2V0QXR0cmlidXRlKFwiZXJkLW9iamVjdC1pZFwiLCBpZCk7XG5cbiAgICAgICAgICAgIC8vU2FmYXJpOiBUaGlzIG11c3Qgb2NjdXIgYmVmb3JlIGFkZGluZyB0aGUgb2JqZWN0IHRvIHRoZSBET00uXG4gICAgICAgICAgICAvL0lFOiBEb2VzIG5vdCBsaWtlIHRoYXQgdGhpcyBoYXBwZW5zIGJlZm9yZSwgZXZlbiBpZiBpdCBpcyBhbHNvIGFkZGVkIGFmdGVyLlxuICAgICAgICAgICAgaWYoIWJyb3dzZXJEZXRlY3Rvci5pc0lFKCkpIHtcbiAgICAgICAgICAgICAgICBvYmplY3QuZGF0YSA9IFwiYWJvdXQ6YmxhbmtcIjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZWxlbWVudC5hcHBlbmRDaGlsZChvYmplY3QpO1xuXG4gICAgICAgICAgICAvL0lFOiBUaGlzIG11c3Qgb2NjdXIgYWZ0ZXIgYWRkaW5nIHRoZSBvYmplY3QgdG8gdGhlIERPTS5cbiAgICAgICAgICAgIGlmKGJyb3dzZXJEZXRlY3Rvci5pc0lFKCkpIHtcbiAgICAgICAgICAgICAgICBvYmplY3QuZGF0YSA9IFwiYWJvdXQ6YmxhbmtcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vQ3JlYXRlIGFuIHVuaXF1ZSBlcmQtdGFyZ2V0LWlkIGZvciB0aGUgdGFyZ2V0IGVsZW1lbnQsIHNvIHRoYXQgZXZlbnQgbGlzdGVuZXJzIGNhbiBiZSBpZGVudGlmaWVkIHRvIHRoaXMgZWxlbWVudC5cbiAgICAgICAgdmFyIGlkID0gaWRIYW5kbGVyLnNldChlbGVtZW50KTtcblxuICAgICAgICBpZihicm93c2VyRGV0ZWN0b3IuaXNJRSg4KSkge1xuICAgICAgICAgICAgLy9JRSA4IGRvZXMgbm90IHN1cHBvcnQgb2JqZWN0cyBwcm9wZXJseS4gTHVja2lseSB0aGV5IGRvIHN1cHBvcnQgdGhlIHJlc2l6ZSBldmVudC5cbiAgICAgICAgICAgIC8vU28gZG8gbm90IGluamVjdCB0aGUgb2JqZWN0IGFuZCBub3RpZnkgdGhhdCB0aGUgZWxlbWVudCBpcyBhbHJlYWR5IHJlYWR5IHRvIGJlIGxpc3RlbmVkIHRvLlxuICAgICAgICAgICAgLy9UaGUgZXZlbnQgaGFuZGxlciBmb3IgdGhlIHJlc2l6ZSBldmVudCBpcyBhdHRhY2hlZCBpbiB0aGUgdXRpbHMuYWRkTGlzdGVuZXIgaW5zdGVhZC5cbiAgICAgICAgICAgIGNhbGxiYWNrKGVsZW1lbnQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaW5qZWN0T2JqZWN0KGlkLCBlbGVtZW50LCBjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjaGlsZCBvYmplY3Qgb2YgdGhlIHRhcmdldCBlbGVtZW50LlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSB0YXJnZXQgZWxlbWVudC5cbiAgICAgKiBAcmV0dXJucyBUaGUgb2JqZWN0IGVsZW1lbnQgb2YgdGhlIHRhcmdldC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRPYmplY3QoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZm9yRWFjaChlbGVtZW50LmNoaWxkcmVuLCBmdW5jdGlvbihjaGlsZCkge1xuICAgICAgICAgICAgaWYoY2hpbGQuaGFzQXR0cmlidXRlKFwiZXJkLW9iamVjdC1pZFwiKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjaGlsZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgaXNEZXRlY3RhYmxlOiBpc0RldGVjdGFibGUsXG4gICAgICAgIG1ha2VEZXRlY3RhYmxlOiBtYWtlRGV0ZWN0YWJsZSxcbiAgICAgICAgYWRkTGlzdGVuZXI6IGFkZExpc3RlbmVyLFxuICAgIH07XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGlkQ291bnQgPSAxO1xuXG4gICAgLyoqXG4gICAgICogR2VuZXJhdGVzIGEgbmV3IHVuaXF1ZSBpZCBpbiB0aGUgY29udGV4dC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHJldHVybnMge251bWJlcn0gQSB1bmlxdWUgaWQgaW4gdGhlIGNvbnRleHQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2VuZXJhdGUoKSB7XG4gICAgICAgIHJldHVybiBpZENvdW50Kys7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ2VuZXJhdGU6IGdlbmVyYXRlXG4gICAgfTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihpZEdlbmVyYXRvcikge1xuXG4gICAgLyoqXG4gICAgICogR2V0cyB0aGUgcmVzaXplIGRldGVjdG9yIGlkIG9mIHRoZSBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IFRoZSB0YXJnZXQgZWxlbWVudCB0byBnZXQgdGhlIGlkIG9mLlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd8bnVtYmVyfSBUaGUgaWQgb2YgdGhlIGVsZW1lbnQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0SWQoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZWxlbWVudC5nZXRBdHRyaWJ1dGUoXCJlcmQtdGFyZ2V0LWlkXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHJlc2l6ZSBkZXRlY3RvciBpZCBvZiB0aGUgZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBUaGUgdGFyZ2V0IGVsZW1lbnQgdG8gc2V0IHRoZSBpZCB0by5cbiAgICAgKiBAcGFyYW0ge3N0cmluZz99IEFuIG9wdGlvbmFsIGlkIHRvIHNldCB0byB0aGUgZWxlbWVudC4gSWYgbm90IHNwZWNpZmllZCwgYW4gaWQgd2lsbCBiZSBnZW5lcmF0ZWQuIEFsbCBpZCdzIG11c3QgYmUgdW5pcXVlLlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd8bnVtYmVyfSBUaGUgaWQgb2YgdGhlIGVsZW1lbnQuXG4gICAgICovXG4gICAgZnVuY3Rpb24gc2V0SWQoZWxlbWVudCwgaWQpIHtcbiAgICAgICAgaWYoIWlkICYmIGlkICE9PSAwKSB7XG4gICAgICAgICAgICAvL051bWJlciBzaG91bGQgYmUgZ2VuZXJhdGVkLlxuICAgICAgICAgICAgaWQgPSBpZEdlbmVyYXRvci5nZW5lcmF0ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJlcmQtdGFyZ2V0LWlkXCIsIGlkKTtcblxuICAgICAgICByZXR1cm4gaWQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ2V0OiBnZXRJZCxcbiAgICAgICAgc2V0OiBzZXRJZFxuICAgIH07XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oaWRIYW5kbGVyKSB7XG4gICAgdmFyIGV2ZW50TGlzdGVuZXJzID0ge307XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIGFsbCBsaXN0ZW5lcnMgZm9yIHRoZSBnaXZlbiBlbGVtZW50LlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAcGFyYW0ge2VsZW1lbnR9IGVsZW1lbnQgVGhlIGVsZW1lbnQgdG8gZ2V0IGFsbCBsaXN0ZW5lcnMgZm9yLlxuICAgICAqIEByZXR1cm5zIEFsbCBsaXN0ZW5lcnMgZm9yIHRoZSBnaXZlbiBlbGVtZW50LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldExpc3RlbmVycyhlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBldmVudExpc3RlbmVyc1tpZEhhbmRsZXIuZ2V0KGVsZW1lbnQpXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdG9yZXMgdGhlIGdpdmVuIGxpc3RlbmVyIGZvciB0aGUgZ2l2ZW4gZWxlbWVudC4gV2lsbCBub3QgYWN0dWFsbHkgYWRkIHRoZSBsaXN0ZW5lciB0byB0aGUgZWxlbWVudC5cbiAgICAgKiBAcHVibGljXG4gICAgICogQHBhcmFtIHtlbGVtZW50fSBlbGVtZW50IFRoZSBlbGVtZW50IHRoYXQgc2hvdWxkIGhhdmUgdGhlIGxpc3RlbmVyIGFkZGVkLlxuICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IGxpc3RlbmVyIFRoZSBjYWxsYmFjayB0aGF0IHRoZSBlbGVtZW50IGhhcyBhZGRlZC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhZGRMaXN0ZW5lcihlbGVtZW50LCBsaXN0ZW5lcikge1xuICAgICAgICB2YXIgaWQgPSBpZEhhbmRsZXIuZ2V0KGVsZW1lbnQpO1xuXG4gICAgICAgIGlmKCFldmVudExpc3RlbmVyc1tpZF0pIHtcbiAgICAgICAgICAgIGV2ZW50TGlzdGVuZXJzW2lkXSA9IFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgZXZlbnRMaXN0ZW5lcnNbaWRdLnB1c2gobGlzdGVuZXIpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGdldDogZ2V0TGlzdGVuZXJzLFxuICAgICAgICBhZGQ6IGFkZExpc3RlbmVyXG4gICAgfTtcbn07XG4iXX0=
