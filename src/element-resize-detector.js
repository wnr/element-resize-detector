//Heavily inspired by http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/

"use strict";

var forEach = require("./collection-utils").forEach;
var elementUtilsMaker = require("./element-utils");
var listenerHandlerMaker = require("./listener-handler");
var idGeneratorMaker = require("./id-generator");
var idHandlerMaker = require("./id-handler");

module.exports = function(options) {
    options = options || {};

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
     * @param {element[]|element} elements The given array of elements to detect resize events of. Single element is also valid.
     * @param {function} listener The callback to be executed for each resize event for each element.
     */
    function listenTo(elements, listener) {
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
                return elementUtils.makeDetectable(element, function(element) {
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
