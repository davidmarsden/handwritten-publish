# Handwritten Publish status

Handwritten Publish is now a working local-first publishing tool, not just a format prototype.

## Working

- [x] Import multiple reMarkable PNG pages
- [x] Natural filename ordering and manual page reordering
- [x] Stable document identity and page SHA-256 hashes
- [x] IndexedDB local draft persistence, including page files
- [x] Portable `.hwpublish` export and verified round-trip import
- [x] Optional transcript
- [x] Micro.blog account/destination discovery
- [x] Micro.blog media upload through a thin Netlify bridge
- [x] Private Micro.blog draft creation and preview
- [x] Track/update an existing Micro.blog draft
- [x] Detect Micro.blog-visible changes since the last sync
- [x] Visual page annotation editor
- [x] Normalized link regions with URL/label metadata
- [x] Normalized photo placeholders with asset ID/alt metadata
- [x] Annotation overlays in the local page preview
- [x] Annotation metadata persists through IndexedDB and `.hwpublish`
- [x] Publish responsive clickable handwritten link regions to Micro.blog drafts
- [x] Reuse existing page media when only link overlays change

## Next

- [ ] Original photo assets, placement and alt text
- [ ] Richer draft state and revision history
- [ ] handwritten.blog publisher adapter
- [ ] Assisted transcription and accessibility metadata
- [ ] Native reMarkable input/send integration when safely supportable

Publishing from Handwritten Publish remains draft-first. A tracked Micro.blog post must still be a draft before the app will update it. Completed HTTP/HTTPS link annotations are included in Micro.blog output; photo placeholders remain local/portable document state for now.
