"use strict";

module.exports = function(options) {
    var idGenerator     = options.idGenerator;
    var getState        = options.stateHandler.getState;

    /**
     * Gets the resize detector id of the element. If the element does not have an id, one will be assigned to the element.
     * @public
     * @param {element} element The target element to get the id of.
     * @param {boolean?} readonly An id will not be assigned to the element if the readonly parameter is true. Default is false.
     * @returns {string|number} The id of the element.
     */
    function getId(element, readonly) {
        if(!readonly && !hasId(element)) {
            setId(element);
        }

        return getState(element).id;
    }

    function setId(element) {
        var id = idGenerator.generate();

        getState(element).id = id;

        return id;
    }

    function hasId(element) {
        return getState(element).id !== undefined;
    }

    function removeId(element) {
        delete getState(element).id;
    }

    return {
        get: getId,
        remove: removeId
    };
};
