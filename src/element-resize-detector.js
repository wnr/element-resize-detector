//Heavily inspired by http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/

"use strict";

var forEach = require("./collection-utils").forEach;
var elementUtils = require("./element-utils");
var idGeneratorMaker = require("./id-generator");
var listenerHandlerMaker = require("./listener-handler");

module.exports = function(options) {
    options = options || {};
    var allowMultipleListeners = options.allowMultipleListeners === undefined ? true : false;

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

        function addListener(element, listener) {
            elementUtils.addListener(element, listener);
            eventListenerHandler.add(element, listener);
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
