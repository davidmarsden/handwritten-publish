# Changelog

## Unreleased

### BUM Hand

- Route JPEG/PNG/WebP uploads to the selected Micro.blog blog by carrying the chosen destination through the browser client and Netlify image bridge as `mp-destination`.
- Keep image routing consistent with the existing streamed MP3/M4A/PDF path, which already sends `mp-destination`.
- Add regression coverage for destination-aware image uploads so multi-blog tokens cannot silently fall back to an implicit media destination.
- Refresh BUM Hand, suite, architecture, status and public roadmap documentation to treat real-device and multi-blog reliability work as first-class maintenance.

### Markdown Hand

- Add a configured private GitHub working-draft destination alongside Micro.blog.
- Preserve selected Markdown unchanged when saving under `drafts/`, updating the same filename rather than creating duplicates.
- Keep the GitHub repository token server-side behind a separate browser write key.
- Update the Helping Hand launcher, setup, suite documentation and roadmap to describe the working-draft → publication boundary.

### Roadmap

- Record optional Micro.blog Notes support — encrypted note creation and notebook selection — as a possible future addition rather than a current priority.
- Make reliability work explicit: browser/provider regressions, API compatibility and destination-routing failures take priority over speculative features.

## v1.0.0 — 2026-08-30

Helping Hand reaches its first complete release: the four-tool suite now covers handwritten reMarkable publishing, mixed-media post building, batch file uploads and direct prepared-Markdown publishing to Micro.blog.

### Helping Hand

- Established the four-tool suite: Writing Hand, Publish Hand, BUM Hand and Markdown Hand.
- Added a unified launcher, setup guide, product branding and shared navigation/footer structure.
- Kept the project open source and self-hostable, with user-owned Micro.blog and Resend credentials.

### Writing Hand

- Added the reMarkable → email → Micro.blog workflow using Resend inbound email.
- Clean reMarkable subject/body boilerplate and support edited transcription, original PNG pages, or both.
- Support leading handwritten metadata for optional title, categories and explicit draft/published status.
- Default all email-created posts to draft unless `Status: published` is explicitly present.
- Add durable webhook/idempotency handling and multi-destination recipient routing.

### Publish Hand

- Import ordered handwritten PNG pages and browser-rendered PDFs.
- Mix handwriting with standalone JPEG/PNG/WebP photographs.
- Add transcripts, summaries, categories, links and positioned photo annotations.
- Persist work locally and export/import portable `.handpub` bundles with integrity checks.
- Create private Micro.blog drafts, safely update tracked drafts and explicitly-confirmed published posts, and recover canonical published URLs when Micro.blog replaces draft URLs.
- Optimise oversized photo derivatives while preserving local originals.

### BUM Hand

- Add one mixed-file chooser and queue for JPEG, PNG, WebP, MP3, M4A and PDF.
- Batch-upload up to 30 selected files without creating posts.
- Optimise larger photos locally and eagerly stage Android/Google Photos selections to stable browser-owned files.
- Add successful photos directly to existing or newly-created Micro.blog Photo Collections.
- Stream MP3/M4A and PDF uploads through a same-origin Netlify Edge proxy to avoid browser CORS and small buffered-function limits.
- Return canonical URLs plus type-appropriate Markdown and HTML; audio also gets a browser playback control.
- Keep per-file retry and separate collection retry without duplicating successful uploads.

### Markdown Hand

- Add direct `.md` file → Micro.blog publishing without passing the source through a web editor or HTML conversion.
- Keep the raw Markdown as ordinary Micropub `content`, with optional title, summary and categories supplied separately.
- Default to draft and require explicit confirmation before immediate publication.
- Fetch the created post back with Micropub `q=source` and report when the stored Markdown matches exactly.
- Preserve the created post URL even when source verification fails.
- Add a dedicated Markdown Hand mark and page-specific favicon.

### Release boundary

v1.0.0 is feature-complete for the workflows currently needed. Future roadmap items are intentionally optional and should be driven by real use rather than a release schedule.

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