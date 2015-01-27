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
