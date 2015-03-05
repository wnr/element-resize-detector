jasmine.getFixtures().fixturesPath = "/base/test/";

describe("element-resize-detector", function() {
    beforeEach(function() {
        loadFixtures("element-resize-detector_fixture.html");
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

            expect(erd.listenTo.bind(null, $("#test")[0])).toThrow();
        });

        it("should be able to attach multiple listeners to an element", function(done) {
            var erd = elementResizeDetectorMaker();

            var listener1 = jasmine.createSpy("listener1");
            var listener2 = jasmine.createSpy("listener2");

            erd.listenTo($("#test")[0], function() {
                debugger;
            });
            erd.listenTo($("#test")[0], function() {
                debugger;
            });

            setTimeout(function() {
                $("#test").width(300);
            }, 100);

            setTimeout(function() {
                expect(listener1).toHaveBeenCalledWith($("#test")[0]);
                expect(listener2).toHaveBeenCalledWith($("#test")[0]);
                done();
            }, 200);
        });
    });
});
