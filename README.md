# element-resize-detector
Super-optimized cross-browser resize listener for elements.

```npm install element-resize-detector```

### Include script
Include the script in the browser:
```html
<!DOCTYPE hml>
<html>
    <head></head>
    <body>
        <script src="node_modules/element-resize-detector/dist/element-resize-detector.min.js"></script>
    </body>
</html>
```
This will create a global function ```elementResieDetectorMaker```, which is the maker function that makes an element resize detector instance.

You can also ```require``` it like so:
```js
var elementResizeDetectorMaker = require("element-resize-detector");
```

### Create instance
```js
//With default options (will use the object-based approach).
var erdDefault = elementResizeDetectorMaker();

//With the experimental super fast scroll-based approach.
var erdUltraFast = elementResizeDetectorMaker({
    strategy: "scroll" //<- For ultra performance. 
});
```

### API
#### listenTo(element, listener)
Listens to the element for resize events and calls the listener function with the element as argument on resize events.

**Example usage:**
```js
erd.listenTo(document.getElementById("test"), function(element) {
  //Should probably use jQuery for the width and height for compability.
  var width = element.offsetWidth;
  var height = element.offsetHeight;
  console.log("Size: " + width + "x" + height);
});
```

**Caveats:**

1. If the element has ```display: static``` it will be changed to ```display: relative```. This means if you have unintentional ```top/right/bottom/left``` styles on the element (which was ignored when being ```static```) they will now be applied to the element. This will also mean that if there are any elements with ```position: absolute``` as children to the element, they will now be positioned relative to the element.
2. An ```<object>``` element will be injected as a direct child to the element. It has ```position: absolute``` so it will not affect the page flow. It is also visibly hidden.

### Credits
This library is using the two approaches (scroll and object) as first described at [http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/](backalleycoder).

The scroll based approach implementation was based on Marc J's implementation [https://github.com/marcj/css-element-queries/blob/master/src/ResizeSensor.js](ResizeSensor).

Please note that both approaches have been heavily reworked for better performance and robustness.
