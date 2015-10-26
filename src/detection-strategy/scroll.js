/**
 * Resize detection strategy that injects divs to elements in order to detect resize events on scroll events.
 * Heavily inspired by: https://github.com/marcj/css-element-queries/blob/master/src/ResizeSensor.js
 */

"use strict";

module.exports = function(options) {
    options             = options || {};
    var reporter        = options.reporter;
    var batchProcessor  = options.batchProcessor;
    var getState        = options.stateHandler.getState;

    // The injected container needs to have a class, so that it may be styled with CSS (pseudo elements).
    var detectionContainerClass = "erd_scroll_detection_container";

    if(!reporter) {
        throw new Error("Missing required dependency: reporter.");
    }

    //TODO: Could this perhaps be done at installation time?
    var scrollbarSizes = getScrollbarSizes();

    // Inject the scrollbar styling that prevents them from appearing sometimes in Chrome.
    var styleId = "erd_scroll_detection_scrollbar_style";
    injectScrollStyle(styleId, detectionContainerClass);

    /**
     * Adds a resize event listener to the element.
     * @public
     * @param {element} element The element that should have the listener added.
     * @param {function} listener The listener callback to be called for each resize event of the element. The element will be given as a parameter to the listener callback.
     */
    function addListener(element, listener) {
        var changed = function() {
            var elementStyle    = getComputedStyle(element);
            var width           = parseSize(elementStyle.width);
            var height          = parseSize(elementStyle.height);

            // Store the size of the element sync here, so that multiple scroll events may be ignored in the event listeners.
            // Otherwise the if-check in handleScroll is useless.
            storeCurrentSize(element, width, height);

            batchProcessor.add(function updateDetectorElements() {
                updateChildSizes(element, width, height);
            });

            batchProcessor.add(1, function updateScrollbars() {
                positionScrollbars(element, width, height);
                listener(element);
            });
        };

        function handleScroll() {
            var style = getComputedStyle(element);
            var width = parseSize(style.width);
            var height = parseSize(style.height);

            if (width !== element.lastWidth || height !== element.lastHeight) {
                changed();
            }
        }

        var expand = getExpandElement(element);
        var shrink = getShrinkElement(element);

        addEvent(expand, "scroll", handleScroll);
        addEvent(shrink, "scroll", handleScroll);
    }

    /**
     * Makes an element detectable and ready to be listened for resize events. Will call the callback when the element is ready to be listened for resize changes.
     * @private
     * @param {element} element The element to make detectable
     * @param {function} callback The callback to be called when the element is ready to be listened for resize changes. Will be called with the element as first parameter.
     */
    function makeDetectable(element, callback) {
        function isStyleResolved() {
            function isPxValue(length) {
                return length.indexOf("px") !== -1;
            }

            var style = getComputedStyle(element);

            return style.position && isPxValue(style.width) && isPxValue(style.height);
        }

        function install() {
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

            // Style is to be retrieved in the first level (before mutating the DOM) so that a forced layout is avoided later.
            var style = getStyle();

            getState(element).startSizeStyle = {
                width: style.widthStyle,
                height: style.heightStyle
            };

            var readyExpandScroll       = false;
            var readyShrinkScroll       = false;
            var readyOverall            = false;

            function ready() {
                if(readyExpandScroll && readyShrinkScroll && readyOverall) {
                    callback(element);
                }
            }

            function mutateDom() {
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

                alterPositionStyles(style);

                var scrollbarWidth          = scrollbarSizes.width;
                var scrollbarHeight         = scrollbarSizes.height;
                var containerStyle          = getContainerCssText(-1, -1, -scrollbarHeight, -scrollbarWidth);
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

                addEvent(expand, "scroll", function onFirstExpandScroll() {
                    removeEvent(expand, "scroll", onFirstExpandScroll);
                    readyExpandScroll = true;
                    ready();
                });

                addEvent(shrink, "scroll", function onFirstShrinkScroll() {
                    removeEvent(shrink, "scroll", onFirstShrinkScroll);
                    readyShrinkScroll = true;
                    ready();
                });

                updateChildSizes(element, style.width, style.height);
            }

            function finalizeDomMutation() {
                storeCurrentSize(element, style.width, style.height);
                positionScrollbars(element, style.width, style.height);
                readyOverall = true;
                ready();
            }

            if(batchProcessor) {
                batchProcessor.add(mutateDom);
                batchProcessor.add(1, finalizeDomMutation);
            } else {
                mutateDom();
                finalizeDomMutation();
            }
        }

        // Only install the strategy if the style has been resolved (this does not always mean that the element is attached).
        if (isStyleResolved()) {
            install();
        } else {
            // Need to perform polling in order to detect when the element has been attached to the DOM.
            var timeout = setInterval(function () {
                if (isStyleResolved()) {
                    install();
                    clearTimeout(timeout);
                }
            }, 50);
        }
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

    function getExpandSize(size) {
        return size + 10;
    }

    function getShrinkSize(size) {
        return size * 2;
    }

    function updateChildSizes(element, width, height) {
        var expandChild             = getExpandChildElement(element);
        var expandWidth             = getExpandSize(width);
        var expandHeight            = getExpandSize(height);
        expandChild.style.width     = expandWidth + "px";
        expandChild.style.height    = expandHeight + "px";
    }

    function storeCurrentSize(element, width, height) {
        element.lastWidth   = width;
        element.lastHeight  = height;
    }

    function positionScrollbars(element, width, height) {
        var expand          = getExpandElement(element);
        var shrink          = getShrinkElement(element);
        var expandWidth     = getExpandSize(width);
        var expandHeight    = getExpandSize(height);
        var shrinkWidth     = getShrinkSize(width);
        var shrinkHeight    = getShrinkSize(height);
        expand.scrollLeft   = expandWidth;
        expand.scrollTop    = expandHeight;
        shrink.scrollLeft   = shrinkWidth;
        shrink.scrollTop    = shrinkHeight;
    }

    function addEvent(el, name, cb) {
        if (el.attachEvent) {
            el.attachEvent("on" + name, cb);
        } else {
            el.addEventListener(name, cb);
        }
    }

    function removeEvent(el, name, cb) {
        if(el.attachEvent) {
            el.detachEvent("on" + name, cb);
        } else {
            el.removeEventListener(name, cb);
        }
    }

    function parseSize(size) {
        return parseFloat(size.replace(/px/, ""));
    }

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

    function uninstall(element) {
        var state = getState(element);
        element.removeChild(state.element);
        delete state.element;
    }

    return {
        makeDetectable: makeDetectable,
        addListener: addListener,
        uninstall: uninstall
    };
};
