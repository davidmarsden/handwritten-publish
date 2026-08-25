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
- [x] Detect when the local document has changed since the last Micro.blog sync

## Next

- [ ] Richer draft state and revision history
- [ ] Visual annotation editor
- [ ] Clickable handwritten link regions
- [ ] Original photo assets, placement and alt text
- [ ] handwritten.blog publisher adapter
- [ ] Assisted transcription and accessibility metadata
- [ ] Native reMarkable input/send integration when safely supportable

Publishing from Handwritten Publish remains draft-first. A tracked Micro.blog post must still be a draft before the app will update it.
