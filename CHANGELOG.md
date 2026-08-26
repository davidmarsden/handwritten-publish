# Changelog

## v0.1.0 — 2026-08-26

First genuinely usable release of Handwritten Publish.

### Document workflow

- Import ordered handwritten PNG pages exported from reMarkable.
- Add standalone JPEG/PNG/WebP photo pages to the same ordered sequence.
- Reorder mixed page types with touch/mouse drag controls or arrow fallbacks.
- Persist working documents locally in IndexedDB.
- Export/import portable `.hwpublish` ZIP bundles with source-file SHA-256 verification.
- Preserve backward compatibility with earlier PNG-only version-1 bundles.
- Add optional transcripts.

### Rich handwritten content

- Draw normalized hyperlink regions over handwriting.
- Publish those regions as responsive accessible links without altering source page images.
- Make link regions visibly discoverable at the Micro.blog end despite HTML/CSS filtering.
- Add first-class original JPEG/PNG/WebP photo assets.
- Bind photos to positioned regions over handwritten pages and publish alt text.
- Preserve original photo assets through local persistence and `.hwpublish` round trips.

### Micro.blog

- Discover Micro.blog destinations using Micropub configuration.
- Upload page/photo media through thin Netlify request bridges.
- Create new posts as private Micro.blog drafts only.
- Track and safely update existing drafts.
- Detect Micro.blog-visible content revisions separately from source-media changes.
- Reuse unchanged page and photo media across updates.
- Optimise oversized photo derivatives for upload while retaining untouched local originals.
- Inspect tracked post state before remote mutation.
- Safely update an already-published tracked Micro.blog post after explicit confirmation.
- Recover the canonical public post URL after Micro.blog retires the original private-draft URL, using unique tracked-media fingerprints rather than title/slug guesses.

### Safety and privacy

- New posts remain draft-first.
- Published mutations require explicit confirmation and immediate status verification.
- Ambiguous published-URL recovery fails closed.
- Micro.blog tokens remain ephemeral and are not stored in documents, IndexedDB or Netlify configuration.
- Invalid or unbound annotations block sync before media upload rather than being silently omitted.

### Project

- Documented current architecture, status and portable format.
- Added MIT licence.
- Added explicit acknowledgement that handwritten.blog inspired part of the product idea/workflow; no handwritten.blog source code is included or known to have been copied.

### Next

Likely post-v0.1 directions include a handwritten.blog publisher adapter, assisted transcription/accessibility metadata, richer revision history and safer native tablet input/send integrations.
