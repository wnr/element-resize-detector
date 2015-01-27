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
