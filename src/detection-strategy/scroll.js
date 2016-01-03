/**
 * Resize detection strategy that injects divs to elements in order to detect resize events on scroll events.
 * Heavily inspired by: https://github.com/marcj/css-element-queries/blob/master/src/ResizeSensor.js
 */

"use strict";

var forEach = require("../collection-utils").forEach;

module.exports = function(options) {
    options             = options || {};
    var reporter        = options.reporter;
    var batchProcessor  = options.batchProcessor;
    var getState        = options.stateHandler.getState;
    var idHandler       = options.idHandler;

    function getScrollbarSizes() {
        var width = 500;
        var height = 500;

        var child = document.createElement("div");
        child.style.cssText = "position: absolute; width: " + width*2 + "px; height: " + height*2 + "px; visibility: hidden;";

        var container = document.createElement("div");
        container.style.cssText = "position: absolute; width: " + width + "px; height: " + height + "px; overflow: scroll; visibility: none; top: " + -width*3 + "px; left: " + -height*3 + "px; visibility: hidden;";

        container.appendChild(child);

        document.body.insertBefore(container, document.body.firstChild);

        var widthSize = width - container.clientWidth;
        var heightSize = height - container.clientHeight;

        document.body.removeChild(container);

        return {
            width: widthSize,
            height: heightSize
        };
    }

    function injectScrollStyle(styleId, containerClass) {
        function injectStyle(style, method) {
            method = method || function (element) {
                document.head.appendChild(element);
            };

            var styleElement = document.createElement("style");
            styleElement.innerHTML = style;
            styleElement.id = styleId;
            method(styleElement);
            return styleElement;
        }

        if (!document.getElementById(styleId)) {
            var style = "/* Created by the element-resize-detector library. */\n";
            style += "." + containerClass + " > div::-webkit-scrollbar { display: none; }";
            injectStyle(style);
        }
    }

    /**
     * Adds a resize event listener to the element.
     * @public
     * @param {element} element The element that should have the listener added.
     * @param {function} listener The listener callback to be called for each resize event of the element. The element will be given as a parameter to the listener callback.
     */
    function addListener(element, listener) {
        var listeners = getState(element).listeners;

        if (!listeners.push) {
            throw new Error("Cannot add listener to an element that is not detectable.");
        }

        getState(element).listeners.push(listener);
    }

    /**
     * Makes an element detectable and ready to be listened for resize events. Will call the callback when the element is ready to be listened for resize changes.
     * @private
     * @param {object} options Optional options object.
     * @param {element} element The element to make detectable
     * @param {function} callback The callback to be called when the element is ready to be listened for resize changes. Will be called with the element as first parameter.
     */
    function makeDetectable(options, element, callback) {
        if (!callback) {
            callback = element;
            element = options;
            options = null;
        }

        options = options || {};

        function debug() {
            if (options.debug) {
                var args = Array.prototype.slice.call(arguments);
                args.unshift(idHandler.get(element), "Scroll: ");
                reporter.log.apply(null, args);
            }
        }

        function isDetached(element) {
            return !getComputedStyle(element).position; // TODO: This does not work in FF. Should probably traverse tree to see if document is the parent node.
        }

        function isUnrendered(element) {
            return getComputedStyle(element).width === "auto";
        }

        // TODO: To be removed.
        function isStyleResolved() {
            function isPxValue(length) {
                return length.indexOf("px") !== -1;
            }

            var style = getComputedStyle(element);

            return style.position && isPxValue(style.width) && isPxValue(style.height);
        }

        function renderElement(element) {
            debug("Rendering element");
            getState(element).previousDisplay = getComputedStyle(element).display;
            element.style.display = "block";
        }

        function unrenderElement(element) {
            debug("Unrendering element");
            element.style.display = getState(element).previousDisplay;
        }

        function parseSize(size) {
            var size = parseFloat(size.replace(/px/, ""));
            if (isNaN(size)) {
                return null;
            }
            return size;
        }

        function getStyle() {
            // Some browsers only force layouts when actually reading the style properties of the style object, so make sure that they are all read here,
            // so that the user of the function can be sure that it will perform the layout here, instead of later (important for batching).
            var style                   = {};
            var elementStyle            = getComputedStyle(element);
            style.position              = elementStyle.position;
            style.width                 = parseSize(elementStyle.width);
            style.height                = parseSize(elementStyle.height);
            style.top                   = elementStyle.top;
            style.right                 = elementStyle.right;
            style.bottom                = elementStyle.bottom;
            style.left                  = elementStyle.left;
            style.widthStyle            = elementStyle.width;
            style.heightStyle           = elementStyle.height;
            return style;
        }

        function storeStartSize() {
            var style = getStyle();
            getState(element).startSizeStyle = {
                width: style.widthStyle,
                height: style.heightStyle
            };
            debug("Element start size", getState(element).startSizeStyle);
        }

        function initListeners() {
            getState(element).listeners = [];
        }

        function storeStyle() {
            debug("storeStyle invoked.");
            var style = getStyle();
            getState(element).style = style;
        }

        function storeCurrentSize(element, width, height) {
            element.lastWidth   = width;
            element.lastHeight  = height;
        }

        function getExpandElement(element) {
            return getState(element).element.childNodes[0];
        }

        function getExpandChildElement(element) {
            return getExpandElement(element).childNodes[0];
        }

        function getShrinkElement(element) {
            return getState(element).element.childNodes[1];
        }

        function getWidthOffset() {
            return 2 * scrollbarSizes.width + 1;
        }

        function getHeightOffset() {
            return 2 * scrollbarSizes.height + 1;
        }

        function getExpandWidth(width) {
            return width + 10 + getWidthOffset();
        }

        function getExpandHeight(height) {
            return height + 10 + getHeightOffset();
        }

        function getShrinkWidth(width) {
            return width * 2 + getWidthOffset();
        }

        function getShrinkHeight(height) {
            return height * 2 + getHeightOffset();
        }

        function positionScrollbars(element, width, height) {
            var expand          = getExpandElement(element);
            var shrink          = getShrinkElement(element);
            var expandWidth     = getExpandWidth(width);
            var expandHeight    = getExpandHeight(height);
            var shrinkWidth     = getShrinkWidth(width);
            var shrinkHeight    = getShrinkHeight(height);
            expand.scrollLeft   = expandWidth;
            expand.scrollTop    = expandHeight;
            shrink.scrollLeft   = shrinkWidth;
            shrink.scrollTop    = shrinkHeight;
        }

        function mutateDom() {
            debug("mutateDom invoked.");

            var style = getState(element).style;

            function alterPositionStyles() {
                if(style.position === "static") {
                    element.style.position = "relative";

                    var removeRelativeStyles = function(reporter, element, style, property) {
                        function getNumericalValue(value) {
                            return value.replace(/[^-\d\.]/g, "");
                        }

                        var value = style[property];

                        if(value !== "auto" && getNumericalValue(value) !== "0") {
                            reporter.warn("An element that is positioned static has style." + property + "=" + value + " which is ignored due to the static positioning. The element will need to be positioned relative, so the style." + property + " will be set to 0. Element: ", element);
                            element.style[property] = 0;
                        }
                    };

                    //Check so that there are no accidental styles that will make the element styled differently now that is is relative.
                    //If there are any, set them to 0 (this should be okay with the user since the style properties did nothing before [since the element was positioned static] anyway).
                    removeRelativeStyles(reporter, element, style, "top");
                    removeRelativeStyles(reporter, element, style, "right");
                    removeRelativeStyles(reporter, element, style, "bottom");
                    removeRelativeStyles(reporter, element, style, "left");
                }
            }

            function getContainerCssText(left, top, bottom, right) {
                left = (!left ? "0" : (left + "px"));
                top = (!top ? "0" : (top + "px"));
                bottom = (!bottom ? "0" : (bottom + "px"));
                right = (!right ? "0" : (right + "px"));

                return "position: absolute; left: " + left + "; top: " + top + "; right: " + right + "; bottom: " + bottom + "; overflow: scroll; z-index: -1; visibility: hidden;";
            }

            function updateChildSizes(element, width, height) {
                var expandChild             = getExpandChildElement(element);
                var expandWidth             = getExpandWidth(width);
                var expandHeight            = getExpandHeight(height);
                expandChild.style.width     = expandWidth + "px";
                expandChild.style.height    = expandHeight + "px";
            }

            function addEvent(el, name, cb) {
                if (el.attachEvent) {
                    el.attachEvent("on" + name, cb);
                } else {
                    el.addEventListener(name, cb);
                }
            }

            function handleScroll() {
                function changed() {
                    var elementStyle    = getComputedStyle(element);
                    var width           = parseSize(elementStyle.width);
                    var height          = parseSize(elementStyle.height);

                    debug("Storing current size", width, height);

                    // Store the size of the element sync here, so that multiple scroll events may be ignored in the event listeners.
                    // Otherwise the if-check in handleScroll is useless.
                    storeCurrentSize(element, width, height);

                    batchProcessor.add(function updateDetectorElements() {
                        if (options.debug) {
                            var style = getComputedStyle(element);
                            var w = parseSize(style.width);
                            var h = parseSize(style.height);

                            if (w !== width || h !== height) {
                                reporter.warn(idHandler.get(element), "Scroll: Size changed before updating detector elements.");
                            }
                        }

                        updateChildSizes(element, width, height);
                    });

                    batchProcessor.add(1, function updateScrollbars() {
                        positionScrollbars(element, width, height);
                        forEach(getState(element).listeners, function (listener) {
                            listener(element);
                        });
                    });
                }

                debug("Scroll detected.");

                var style = getComputedStyle(element);
                var width = parseSize(style.width);
                var height = parseSize(style.height);

                if (width === null || height === null) {
                    // Element is still unrendered. Skip this scroll event.
                    debug("Scroll event fired while unrendered. Ignoring...");
                    return;
                }

                if (width !== element.lastWidth || height !== element.lastHeight) {
                    debug("Element size changed.");
                    changed();
                }
            }

            alterPositionStyles(style);

            var scrollbarWidth          = scrollbarSizes.width;
            var scrollbarHeight         = scrollbarSizes.height;
            var containerStyle          = getContainerCssText(-(1 + scrollbarWidth), -(1 + scrollbarHeight), -scrollbarHeight, -scrollbarWidth);
            var shrinkExpandstyle       = getContainerCssText(0, 0, -scrollbarHeight, -scrollbarWidth);
            var shrinkExpandChildStyle  = "position: absolute; left: 0; top: 0;";

            var container               = document.createElement("div");
            var expand                  = document.createElement("div");
            var expandChild             = document.createElement("div");
            var shrink                  = document.createElement("div");
            var shrinkChild             = document.createElement("div");

            container.className         = detectionContainerClass;
            container.style.cssText     = containerStyle;
            expand.style.cssText        = shrinkExpandstyle;
            expandChild.style.cssText   = shrinkExpandChildStyle;
            shrink.style.cssText        = shrinkExpandstyle;
            shrinkChild.style.cssText   = shrinkExpandChildStyle + " width: 200%; height: 200%;";

            expand.appendChild(expandChild);
            shrink.appendChild(shrinkChild);
            container.appendChild(expand);
            container.appendChild(shrink);
            element.appendChild(container);
            getState(element).element = container;

            addEvent(expand, "scroll", function onExpand() {
                handleScroll();
            });

            addEvent(shrink, "scroll", function onShrink() {
                handleScroll();
            });

            updateChildSizes(element, style.width, style.height);
        }

        function finalizeDomMutation() {
            debug("finalizeDomMutation invoked.");

            var style = getState(element).style;
            storeCurrentSize(element, style.width, style.height);
            positionScrollbars(element, style.width, style.height);
        }

        function ready() {
            callback(element);
        }

        function install(done) {
            debug("Installing scroll elements...");
            initListeners();

            if (batchProcessor) {
                batchProcessor.add(0, storeStyle);
                batchProcessor.add(1, mutateDom);
                batchProcessor.add(2, finalizeDomMutation);
                batchProcessor.add(3, done);
            } else {
                storeStyle();
                mutateDom();
                finalizeDomMutation();
                done();
            }
        }

        debug("Making detectable...");

        // Only install the strategy if the style has been resolved (this does not always mean that the element is attached).
        // TODO: Could be detached and then unrendered.
        if (isDetached(element)) {
            debug("Element is detached");
            debug("Polling until element is attached...");

            // Need to perform polling in order to detect when the element has been attached to the DOM.
            var timeout = setInterval(function () {
                if (!isDetached()) {
                    debug("Poll. Attached.");
                    // Store the start size of the element so that it is possible to detect if the element has changed size during initialization of the listeners.
                    storeStartSize();
                    install(ready);
                    clearTimeout(timeout);
                } else {
                    debug("Poll. Detached.");
                }
            }, 50);

        } else if (isUnrendered(element)) {
            debug("Element is unrendered");
            // We can't store the start size of the element is it is not rendered. Storing the start size in the batch processor does not make sense,
            // since the storage will be executed in sync with the detection installation (which means that there is no installation gap).
            if (batchProcessor) {
                batchProcessor.add(-1, renderElement.bind(null, element));
            } else {
                renderElement(element);
            }
            install(function () {
                unrenderElement(element);
                ready();
            });
        } else {
            debug("Installing as normal");
            // Store the start size of the element so that it is possible to detect if the element has changed size during initialization of the listeners.
            storeStartSize();
            install(ready);
        }
    }

    function uninstall(element) {
        var state = getState(element);
        element.removeChild(state.element);
        delete state.element;
    }

    if(!reporter) {
        throw new Error("Missing required dependency: reporter.");
    }

    //TODO: Could this perhaps be done at installation time?
    var scrollbarSizes = getScrollbarSizes();

    // Inject the scrollbar styling that prevents them from appearing sometimes in Chrome.
    // The injected container needs to have a class, so that it may be styled with CSS (pseudo elements).
    var styleId = "erd_scroll_detection_scrollbar_style";
    var detectionContainerClass = "erd_scroll_detection_container";
    injectScrollStyle(styleId, detectionContainerClass);

    return {
        makeDetectable: makeDetectable,
        addListener: addListener,
        uninstall: uninstall
    };
};
