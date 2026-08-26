# Handwritten Publish status

## Current release: v0.1.0

Handwritten Publish is now a genuinely usable local-first publishing tool rather than a format or publishing prototype.

The v0.1.0 boundary is the first complete end-to-end workflow: import and edit handwritten/mixed-media documents locally, preserve them as portable `.hwpublish` bundles, create private Micro.blog drafts, and safely revise the same tracked post after it has been published.

## Working

### Documents and local persistence

- [x] Import multiple reMarkable PNG pages
- [x] Import standalone JPEG/PNG/WebP photo pages into the same ordered document sequence
- [x] Natural filename ordering and manual page reordering
- [x] Touch/mouse drag page ordering with keyboard-friendly arrow fallbacks
- [x] Move handwritten pages and standalone photo pages together with the same page-order controls
- [x] Remove standalone photo pages and edit their alt text
- [x] Stable document identity and page SHA-256 hashes
- [x] IndexedDB local draft persistence, including page and photo files
- [x] Portable `.hwpublish` export and verified round-trip import
- [x] Backward-compatible import of older PNG-only `.hwpublish` bundles
- [x] Optional transcript

### Annotations and mixed media

- [x] Visual page annotation editor
- [x] Normalized link regions with URL/label metadata
- [x] Normalized photo regions with asset ID/alt metadata
- [x] Annotation overlays in the local page preview
- [x] Annotation metadata persists through IndexedDB and `.hwpublish`
- [x] First-class JPEG/PNG/WebP photo assets with original filename, dimensions and SHA-256
- [x] Bind existing/new photo assets to photo regions in the annotation editor
- [x] Render bound original photos over handwritten pages locally
- [x] Persist original photo files through IndexedDB and `.hwpublish` bundles
- [x] Verify bundled photo assets by SHA-256 on import

### Micro.blog publishing

- [x] Micro.blog account/destination discovery
- [x] Micro.blog media upload through a thin Netlify bridge
- [x] Create private Micro.blog drafts and open private previews
- [x] Track and update an existing Micro.blog draft
- [x] Detect Micro.blog-visible changes since the last successful sync
- [x] Reuse unchanged page media across updates
- [x] Publish responsive clickable handwritten link regions
- [x] Keep link regions visibly discoverable after Micro.blog HTML/CSS filtering
- [x] Upload only photo assets referenced by published photo regions
- [x] Publish bound original photos as responsive overlays with alt text
- [x] Reuse unchanged uploaded photo assets across later updates
- [x] Publish standalone photo pages in document order
- [x] Reuse standalone photo-page media when only non-file content changes
- [x] Optimise oversized standalone/overlay photos into temporary web JPEG derivatives while preserving local originals
- [x] Inspect tracked post status before mutation
- [x] Safely update an already-published tracked Micro.blog post after explicit confirmation
- [x] Preserve published state while replacing only title/content
- [x] Recover a canonical published URL when Micro.blog no longer recognises the original private-draft URL, using tracked media as a unique fingerprint

## Safety and privacy boundary

New Micro.blog posts remain draft-first: Handwritten Publish does not create a newly published post directly.

A tracked post may later be updated after publication, but only when Micro.blog confirms its status and the user explicitly confirms the live update. The bridge re-checks status immediately before mutation and refuses ambiguous URL recovery rather than guessing.

Micro.blog app tokens remain ephemeral. They are not written to IndexedDB, `.hwpublish` bundles or Netlify configuration.

Oversized publishing derivatives never replace the local originals. Unbound or missing photo regions block sync before media upload rather than being silently omitted.

## Next

The v0.1.x line should be treated primarily as hardening/bug-fix territory unless a small change is clearly low-risk.

Likely v0.2+ directions:

- [ ] handwritten.blog publisher adapter
- [ ] Assisted transcription and accessibility metadata
- [ ] Richer document revision/history support
- [ ] Native reMarkable or other tablet input/send integration when safely supportable

The core rule remains unchanged: handwritten page images are canonical; destinations and assistance features enrich them rather than replacing them.
