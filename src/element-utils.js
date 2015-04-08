"use strict";

module.exports = function() {
    /**
     * Tells if the element has been made detectable and ready to be listened for resize events.
     * @public
     * @param {element} The element to check.
     * @returns {boolean} True or false depending on if the element is detectable or not.
     */
    function isDetectable(element) {
        return !!element._erdIsDetectable;
    }

    /**
     * Marks the element that it has been made detectable and ready to be listened for resize events.
     * @public
     * @param {element} The element to mark.
     */
    function markAsDetectable(element) {
        element._erdIsDetectable = true;
    }

    return {
        isDetectable: isDetectable,
        markAsDetectable: markAsDetectable
    };
};
