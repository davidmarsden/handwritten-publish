# Publish Hand

**Handwriting, images and documents → web**

This directory is the future product boundary for the current browser publishing app.

The existing production Vite app remains at the repository root until it can be moved without changing deployment behavior. Publish Hand will own:

- handwritten page/document models;
- PNG/JPEG/WebP/PDF import;
- page ordering and local document state;
- transcripts and handwritten link regions;
- photo/document enrichment;
- `.hwpublish` import/export;
- browser publishing orchestration.

Publisher-specific primitives should live in `packages/publishing-core/` so Publish Hand can add destinations without reshaping its document model around any one service.
