/* global describe:false, it:false, beforeEach:false, expect:false, elementResizeDetectorMaker:false, _:false, $:false, jasmine:false */

"use strict";

//This messed with tests in IE8.
//jasmine.getFixtures().fixturesPath = "/base/test/";

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

function ensureStyle(before, after, ignore) {
    var beforeKeys = _.keys(before);
    var afterKeys = _.keys(after);

    var diffKeys = _.difference(beforeKeys, afterKeys);

    expect(diffKeys).toEqual([]);

    var diffValueKeys = _.filter(beforeKeys, function(key) {
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

function positonFromStaticToRelative(key, before, after) {
    return key === "position" && before === "static" && after === "relative";
}

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
            var erd = elementResizeDetectorMaker();

            var listener = jasmine.createSpy("listener");

            erd.listenTo($("#test")[0], listener);

            setTimeout(function() {
                $("#test").width(300);
            }, 100);

            setTimeout(function() {
                expect(listener).toHaveBeenCalledWith($("#test")[0]);
                done();
            }, 200);
        });

        it("should throw on invalid parameters", function() {
            var erd = elementResizeDetectorMaker();

            expect(erd.listenTo).toThrow();

            expect(_.partial(erd.listenTo, $("#test")[0])).toThrow();
        });

        it("should be able to attach multiple listeners to an element", function(done) {
            var erd = elementResizeDetectorMaker();

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
            var erd = elementResizeDetectorMaker();

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
            }, 600);
        });

        //Only run this test if the browser actually is able to get the computed style of an element.
        //Only IE8 is lacking the getComputedStyle method.
        if(window.getComputedStyle) {
            it("should keep the style of the element intact", function(done) {
                var erd = elementResizeDetectorMaker();

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
    });
});
