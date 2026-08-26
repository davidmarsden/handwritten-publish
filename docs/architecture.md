# Architecture

Handwritten Publish is built around a destination-neutral document model.

```text
PNG/photo/tablet input
        ↓
HandwrittenDocument
        ↓
local preview / annotations / transcript / photo assets
        ↓
IndexedDB + portable .hwpublish bundle
        ↓
publisher adapters
  ├── Micro.blog Micropub (v0.1.0)
  └── handwritten.blog (planned)
```

## Core rule

The page image is canonical. A transcript, hyperlink region, photograph overlay, alt text, or publishing destination enriches the page but does not replace it.

That rule is both a product choice and a portability guarantee: the user's handwriting remains readable independently of transcription services, publisher APIs or this application.

## Document model

A `HandwrittenDocument` has a stable UUID across edits. Ordered pages carry SHA-256 content hashes and media metadata. Handwritten pages may contain normalized link/photo annotations; standalone photo pages can occupy their own positions in the same sequence. Original photo assets are first-class document content rather than temporary publishing files.

Normalized annotation coordinates are stored from `0..1`, so overlays remain aligned when page images are displayed responsively.

## Local persistence and portable format

Working state is stored browser-locally in IndexedDB, including source page/photo files. The same logical document can be exported to a `.hwpublish` ZIP bundle and imported again with SHA-256 verification.

The portable format is intended to remain inspectable and destination-neutral. See `format.md`.

## Publisher adapters

Publisher code consumes a `HandwrittenDocument`; it must not dictate the core schema.

### Micro.blog

The v0.1.0 publisher uses Micro.blog's Micropub/media APIs through thin same-origin Netlify Functions. The bridge exists to avoid browser CORS/CSRF inconsistencies and does not persist credentials or document content.

New remote posts are always created as private drafts. A tracked post can later be updated as either a draft or published post after status verification; live published updates require explicit user confirmation.

When Micro.blog replaces the original private-draft URL after publication, the adapter can recover the canonical published URL by finding a unique post containing all previously tracked page-media URLs. Zero or multiple matches fail safely rather than using title/slug guesses.

Micro.blog-visible content has its own revision fingerprint so annotation/title/transcript changes can mark a remote post stale without forcing unchanged source media to be uploaded again.

## Media derivatives

Source files remain canonical locally. If a JPEG/PNG/WebP photo is too large for the current Micro.blog bridge, the browser creates a temporary web JPEG derivative for upload. That derivative does not replace the original file, original hash or `.hwpublish` asset.

Handwritten source pages are not silently subjected to lossy optimisation.

## Privacy and credentials

Page processing remains browser-local unless the user explicitly chooses a publishing operation.

Micro.blog app tokens are kept in browser memory and passed to Netlify Functions per request. They are not persisted in IndexedDB, source documents, `.hwpublish` bundles or Netlify configuration.

Any future publisher or assisted-transcription feature should keep this network boundary obvious and preserve a useful non-AI/local document workflow.

## Future adapters

handwritten.blog publishing, assisted transcription/accessibility metadata, and safer native tablet input/send integrations should be adapters around the existing document model. They should not require rewriting the canonical representation of a handwritten document.
