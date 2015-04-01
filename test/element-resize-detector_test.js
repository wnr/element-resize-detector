/* global describe:false, it:false, beforeEach:false, expect:false, elementResizeDetectorMaker:false, _:false, $:false, jasmine:false */

"use strict";

//This messed with tests in IE8.
//jasmine.getFixtures().fixturesPath = "/base/test/";

function ensureMapEqual(before, after, ignore) {
    var beforeKeys = _.keys(before);
    var afterKeys = _.keys(after);

    var unionKeys = _.union(beforeKeys, afterKeys);

    var diffValueKeys = _.filter(unionKeys, function(key) {
        var beforeValue = before[key];
        var afterValue = after[key];
        return !ignore(key, beforeValue, afterValue) && beforeValue !== afterValue;
    });

    if(diffValueKeys.length) {
        var beforeDiffObject = {};
        var afterDiffObject = {};

        _.forEach(diffValueKeys, function(key) {
            beforeDiffObject[key] = before[key];
            afterDiffObject[key] = after[key];
        });

        expect(afterDiffObject).toEqual(beforeDiffObject);
    }
}

function getStyle(element) {
    function clone(styleObject) {
        var clonedTarget = {};
        _.forEach(styleObject.cssText.split(";").slice(0, -1), function(declaration){
            var colonPos = declaration.indexOf(":");
            var attr = declaration.slice(0, colonPos).trim();
            if(attr.indexOf("-") === -1){ // Remove attributes like "background-image", leaving "backgroundImage"
                clonedTarget[attr] = declaration.slice(colonPos+2);
            }
        });
        return clonedTarget;
    }

    var style = getComputedStyle(element);
    return clone(style);
}

var ensureStyle = ensureMapEqual;

function positonFromStaticToRelative(key, before, after) {
    return key === "position" && before === "static" && after === "relative";
}

function getAttributes(element) {
    var attrs = {};
    _.forEach(element.attributes, function(attr) {
        attrs[attr.nodeName] = attr.nodeValue;
    });
    return attrs;
}

var ensureAttributes = ensureMapEqual;

var reporter = {
    log: function() {
        throw new Error("Reporter.log should not be called");
    },
    warn: function() {
        throw new Error("Reporter.warn should not be called");
    },
    error: function() {
        throw new Error("Reporter.error should not be called");
    }
};

$("body").prepend("<div id=fixtures></div>");

describe("element-resize-detector", function() {
    beforeEach(function() {
        //This messed with tests in IE8.
        //TODO: Investigate why, because it would be nice to have instead of the current solution.
        //loadFixtures("element-resize-detector_fixture.html");
        $("#fixtures").html("<div id=test></div><div id=test2></div>");
    });

    describe("elementResizeDetectorMaker", function() {
        it("should be globally defined", function() {
            expect(elementResizeDetectorMaker).toBeFunction();
        });

        it("should create an element-resize-detector instance", function() {
            var erd = elementResizeDetectorMaker();

            expect(erd).toBeObject();
            expect(erd).toHaveMethod("listenTo");
        });
    });

    describe("listenTo", function() {
        it("should be able to attach an listener to an element", function(done) {
            var erd = elementResizeDetectorMaker({
                callOnAdd: false,
                reporter: reporter
            });

            var listener = jasmine.createSpy("listener");

            erd.listenTo($("#test")[0], listener);

            setTimeout(function() {
                $("#test").width(300);
            }, 100);

            setTimeout(function() {
                expect(listener).toHaveBeenCalledWith($("#test")[0]);
                done();
            }, 400);
        });

        it("should throw on invalid parameters", function() {
            var erd = elementResizeDetectorMaker({
                callOnAdd: false,
                reporter: reporter
            });

            expect(erd.listenTo).toThrow();

            expect(_.partial(erd.listenTo, $("#test")[0])).toThrow();
        });

        it("should be able to attach multiple listeners to an element", function(done) {
            var erd = elementResizeDetectorMaker({
                callOnAdd: false,
                reporter: reporter
            });

            var listener1 = jasmine.createSpy("listener1");
            var listener2 = jasmine.createSpy("listener2");

            erd.listenTo($("#test")[0], listener1);
            erd.listenTo($("#test")[0], listener2);

            setTimeout(function() {
                $("#test").width(300);
            }, 100);

            setTimeout(function() {
                expect(listener1).toHaveBeenCalledWith($("#test")[0]);
                expect(listener2).toHaveBeenCalledWith($("#test")[0]);
                done();
            }, 200);
        });

        it("should be able to attach listeners to multiple elements", function(done) {
            var erd = elementResizeDetectorMaker({
                callOnAdd: false,
                reporter: reporter
            });

            var listener1 = jasmine.createSpy("listener1");

            erd.listenTo($("#test, #test2"), listener1);

            setTimeout(function() {
                $("#test").width(200);
            }, 100);

            setTimeout(function() {
                expect(listener1).toHaveBeenCalledWith($("#test")[0]);
            }, 300);

            setTimeout(function() {
                $("#test2").width(500);
            }, 400);

            setTimeout(function() {
               expect(listener1).toHaveBeenCalledWith($("#test2")[0]);
               done();
            }, 800);
        });

        //Only run this test if the browser actually is able to get the computed style of an element.
        //Only IE8 is lacking the getComputedStyle method.
        if(window.getComputedStyle) {
            it("should keep the style of the element intact", function(done) {
                var erd = elementResizeDetectorMaker({
                    callOnAdd: false,
                    reporter: reporter
                });

                var before = getStyle($("#test")[0]);
                erd.listenTo($("#test")[0], _.noop);
                var after = getStyle($("#test")[0]);
                ensureStyle(before, after, positonFromStaticToRelative);

                //Test styles async since making an element listenable is async.
                setTimeout(function() {
                    var afterAsync = getStyle($("#test")[0]);
                    ensureStyle(before, afterAsync, positonFromStaticToRelative);
                    done();
                }, 100);
            });
        }

        it("should call listener if the element is changed synchronously after listenTo", function(done) {
            var erd = elementResizeDetectorMaker({
                callOnAdd: true,
                reporter: reporter
            });

            var listener1 = jasmine.createSpy("listener1");
            erd.listenTo($("#test, #test2"), listener1);

            setTimeout(function() {
                expect(listener1).toHaveBeenCalledWith($("#test")[0]);
                expect(listener1).toHaveBeenCalledWith($("#test2")[0]);
                done();
            }, 100);
        });

        it("should use the option.idHandler if present", function(done) {
            var ID_ATTR = "some-fancy-id-attr";

            var idHandler = {
                get: function(element) {
                    if(element[ID_ATTR] === undefined) {
                        var id;

                        if($(element).attr("id") === "test") {
                            id = "test+1";
                        } else if($(element).attr("id") === "test2") {
                            id = "test2+2";
                        }

                        $(element).attr(ID_ATTR, id);
                    }

                    return $(element).attr(ID_ATTR);
                }
            };

            var erd = elementResizeDetectorMaker({
                idHandler: idHandler,
                callOnAdd: false,
                reporter: reporter
            });

            var listener1 = jasmine.createSpy("listener1");
            var listener2 = jasmine.createSpy("listener1");

            var attrsBeforeTest = getAttributes($("#test")[0]);
            var attrsBeforeTest2 = getAttributes($("#test2")[0]);

            erd.listenTo($("#test"), listener1);
            erd.listenTo($("#test, #test2"), listener2);

            var attrsAfterTest = getAttributes($("#test")[0]);
            var attrsAfterTest2 = getAttributes($("#test2")[0]);

            var ignoreValidIdAttrAndStyle = function(key) {
                return key === ID_ATTR || key === "style";
            };

            ensureAttributes(attrsBeforeTest, attrsAfterTest, ignoreValidIdAttrAndStyle);
            ensureAttributes(attrsBeforeTest2, attrsAfterTest2, ignoreValidIdAttrAndStyle);

            expect($("#test").attr(ID_ATTR)).toEqual("test+1");
            expect($("#test2").attr(ID_ATTR)).toEqual("test2+2");

            setTimeout(function() {
                $("#test").width(300);
                $("#test2").width(500);
            }, 100);

            setTimeout(function() {
               expect(listener1).toHaveBeenCalledWith($("#test")[0]);
               expect(listener2).toHaveBeenCalledWith($("#test")[0]);
               expect(listener2).toHaveBeenCalledWith($("#test2")[0]);
               done();
            }, 600);
        });

        it("should report warnings when top/right/bottom/left is set for an element to be changed to relative", function() {
            $("#test").css("bottom", "1px");

            var oldWarn;

            var called = false;

            if(window.console) {
                /* global console: false */
                oldWarn = console.warn;

                var warn = function() {
                    expect(this).toEqual(console);
                    called = true;
                };

                console.warn = warn;
            }

            var erd = elementResizeDetectorMaker();
            erd.listenTo($("#test"), _.noop);
            
            //The test should not fail because the reporter should not be using console.
            //So succeed the test if this has been reached.
            if(window.console) {
                setTimeout(function() {
                    console.warn = oldWarn;
                    expect(called).toEqual(true);
                }, 200);
            }
        });
    });

    describe("options.callOnAdd", function() {
        it("should be true default and call all functions when listenTo succeeds", function(done) {
            var erd = elementResizeDetectorMaker({
                reporter: reporter
            });

            var listener = jasmine.createSpy("listener");
            var listener2 = jasmine.createSpy("listener2");

            erd.listenTo($("#test")[0], listener);
            erd.listenTo($("#test")[0], listener2);

            setTimeout(function() {
                expect(listener).toHaveBeenCalledWith($("#test")[0]);
                expect(listener2).toHaveBeenCalledWith($("#test")[0]);
                listener.calls.reset();
                listener2.calls.reset();
                $("#test").width(300);
            }, 100);

            setTimeout(function() {
                expect(listener).toHaveBeenCalledWith($("#test")[0]);
                expect(listener2).toHaveBeenCalledWith($("#test")[0]);
                done();
            }, 400);
        });
    });

    // describe("options.reporter", function() {
    //     it("")
    // });
});
