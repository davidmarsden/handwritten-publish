# Publish Hand

**Handwriting, images and documents → web**

Publish Hand is the browser publishing tool in the Helping Hand family. The live hosted surface is `/publish/`.

It owns:

- handwritten page/document models;
- PNG/JPEG/WebP/PDF import;
- page ordering, page removal and local document state;
- transcripts and handwritten link regions;
- photo/document enrichment;
- `.handpub` import/export;
- browser publishing orchestration.

Imported PDF pages can be removed from the document before publishing. Removal is non-destructive: the original PDF is untouched, while the local Publish Hand document, portable bundle and publisher output use only the remaining pages. A document must retain at least one page.

The root `/` route is the Helping Hand launcher rather than a second copy of Publish Hand.

Publisher-specific transport primitives live in `packages/publishing-core/` so Publish Hand can add destinations without reshaping its document model around any one service.
