# PDF import

PDF import is an input adapter into the existing `HandwrittenDocument` model.

The browser renders each PDF page locally with PDF.js and turns the result into an ordinary PNG-backed handwritten page. From that point onward, the page follows exactly the same persistence, annotation, `.hwpublish`, and publishing paths as a directly selected reMarkable PNG.

## Rendering boundary

- The source PDF is read only in the browser.
- No PDF/page content is uploaded merely to perform the import.
- Pages are rendered onto a white-backed canvas.
- The target longest edge is approximately 2200 pixels, capped at 2.5× the PDF's native coordinate scale.
- The generated PNG becomes the canonical source page stored by Handwritten Publish.

This keeps the portable bundle deliberately boring: page images remain standard PNG files rather than requiring future readers to reproduce a specific PDF rendering engine.
