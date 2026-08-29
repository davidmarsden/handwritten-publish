# Publish Hand

**Handwriting, images and documents → web**

Publish Hand is the browser publishing tool in the Helping Hand family. The live hosted surface is `/publish/`.

It owns:

- handwritten page/document models;
- PNG/JPEG/WebP/PDF import;
- page ordering and local document state;
- transcripts and handwritten link regions;
- photo/document enrichment;
- `.handpub` import/export;
- browser publishing orchestration.

The root `/` route is the Helping Hand launcher rather than a second copy of Publish Hand.

Publisher-specific transport primitives live in `packages/publishing-core/` so Publish Hand can add destinations without reshaping its document model around any one service.
