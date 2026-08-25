# Handwritten Publish status

Handwritten Publish is now a working local-first publishing tool, not just a format prototype.

## Working

- [x] Import multiple reMarkable PNG pages
- [x] Import standalone JPEG/PNG/WebP photo pages into the same ordered document sequence
- [x] Natural filename ordering and manual page reordering
- [x] Touch/mouse drag-and-drop page ordering with keyboard-friendly arrow fallbacks
- [x] Move handwritten pages and standalone photo pages together with the same page-order controls
- [x] Remove standalone photo pages and edit their alt text
- [x] Stable document identity and page SHA-256 hashes
- [x] IndexedDB local draft persistence, including page files
- [x] Portable `.hwpublish` export and verified round-trip import
- [x] Backward-compatible import of older PNG-only `.hwpublish` bundles
- [x] Optional transcript
- [x] Micro.blog account/destination discovery
- [x] Micro.blog media upload through a thin Netlify bridge
- [x] Private Micro.blog draft creation and preview
- [x] Track/update an existing Micro.blog draft
- [x] Detect Micro.blog-visible changes since the last sync
- [x] Visual page annotation editor
- [x] Normalized link regions with URL/label metadata
- [x] Normalized photo regions with asset ID/alt metadata
- [x] Annotation overlays in the local page preview
- [x] Annotation metadata persists through IndexedDB and `.hwpublish`
- [x] Publish responsive clickable handwritten link regions to Micro.blog drafts
- [x] Reuse existing page media when only link overlays change
- [x] First-class JPEG/PNG/WebP photo assets with original filename, dimensions and SHA-256
- [x] Bind existing/new photo assets to photo regions in the annotation editor
- [x] Render bound original photos over the handwritten placeholder locally
- [x] Persist original photo files through IndexedDB and `.hwpublish` bundles
- [x] Verify bundled photo assets by SHA-256 on import
- [x] Upload only photo assets referenced by published photo regions
- [x] Publish bound original photos as responsive overlays in Micro.blog drafts
- [x] Publish photo-region alt text
- [x] Reuse unchanged previously uploaded photo assets across draft updates
- [x] Treat photo binding, asset content, geometry and alt-text edits as Micro.blog-visible revisions
- [x] Publish standalone photo pages in sequence alongside handwritten pages
- [x] Reuse standalone photo-page media when only alt text or other non-file content changes

## Next

- [ ] Richer draft state and revision history
- [ ] handwritten.blog publisher adapter
- [ ] Assisted transcription and accessibility metadata
- [ ] Native reMarkable input/send integration when safely supportable

Publishing from Handwritten Publish remains draft-first. A tracked Micro.blog post must still be a draft before the app will update it. Handwritten pages, standalone photo pages, completed HTTP/HTTPS link annotations and bound photo annotations are included in Micro.blog output. Unbound or missing photo regions block sync before media upload rather than being silently omitted.
