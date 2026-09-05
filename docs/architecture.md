# Architecture

Helping Hand is built around small product surfaces that share publishing primitives without collapsing into one application. Publish Hand also keeps its handwritten document model destination-neutral.

```text
human source material
        ↓
Writing Hand / Publish Hand / BUM Hand / Markdown Hand
        ↓
local parsing, staging, editing or validation
        ↓
shared publishing primitives where useful
        ↓
explicit destination adapter
  ├── Micro.blog Micropub / media APIs
  └── configured private GitHub working-draft route
```

## Core rule

The human-created source remains canonical. A transcript, hyperlink region, photograph overlay, alt text, optimisation derivative, upload destination or publication adapter may enrich or route that source, but should not silently replace it.

That rule is both a product choice and a portability guarantee.

## Publish Hand document model

A `HandwrittenDocument` has a stable UUID across edits. Ordered pages carry SHA-256 content hashes and media metadata. Handwritten pages may contain normalized link/photo annotations; standalone photo pages can occupy their own positions in the same sequence. Original photo assets are first-class document content rather than temporary publishing files.

Normalized annotation coordinates are stored from `0..1`, so overlays remain aligned when page images are displayed responsively.

## Local persistence and portable format

Publish Hand working state is stored browser-locally in IndexedDB, including source page/photo files. The same logical document can be exported to a `.handpub` ZIP bundle and imported again with SHA-256 verification.

The portable format is intended to remain inspectable and destination-neutral. See `format.md`.

BUM Hand and Markdown Hand do not create a second local content store: they stage or read the selected files only for the operation the user has requested.

## Micro.blog adapters

Micro.blog integration uses Micropub and media APIs through same-origin Netlify boundaries. The bridges exist to avoid browser CORS/CSRF inconsistencies, keep transport rules explicit and avoid persisting browser tokens or uploaded content.

Publish Hand creates new remote posts as private drafts. A tracked post can later be updated as either a draft or published post after status verification; live published updates require explicit user confirmation.

When Micro.blog replaces the original private-draft URL after publication, the adapter can recover the canonical published URL by finding a unique post containing all previously tracked page-media URLs. Zero or multiple matches fail safely rather than using title/slug guesses.

Micro.blog-visible content has its own revision fingerprint so annotation/title/transcript changes can mark a remote post stale without forcing unchanged source media to be uploaded again.

## BUM Hand media transport

BUM Hand has two media transport paths:

- JPEG/PNG/WebP images use the buffered Netlify Function bridge after local optimisation when required;
- MP3/M4A audio and PDFs use a same-origin Netlify Edge Function so larger request bodies can be streamed to Micro.blog.

The selected Micro.blog destination is part of both contracts. For images, the browser client sends `X-Microblog-Destination` to the Function and the Function forwards the value as multipart `mp-destination`. The Edge path likewise writes `mp-destination` into its streamed multipart body.

This matters for tokens that can access more than one blog: destination selection must control the media upload itself, not only later post creation or Photo Collection assignment. The destination field is request metadata and is not persisted by Helping Hand.

## Media derivatives

Source files remain canonical locally. If a JPEG/PNG/WebP photo is too large for the current Micro.blog bridge, the browser creates a temporary web JPEG derivative for upload. That derivative does not replace the original file, original hash or `.handpub` asset.

Handwritten source pages are not silently subjected to lossy optimisation.

## Private GitHub working drafts

Markdown Hand can route an unchanged `.md` file to a configured private GitHub working-draft repository. The repository credential stays server-side behind a separate browser write key; the public browser surface does not need to expose the private repository identity.

The GitHub route is an intermediate working state, not a replacement for the source Markdown file and not a requirement for using the rest of Helping Hand.

## Privacy and credentials

Page processing and file preparation remain browser-local unless the user explicitly chooses a publishing, upload or save operation.

Micro.blog app tokens are kept in browser memory and passed per request. They are not persisted in IndexedDB, source documents, `.handpub` bundles or Netlify configuration.

Writing Hand's unattended email workflow and Markdown Hand's private GitHub route use separate server-side credentials appropriate to those opt-in workflows.

Any future publisher or assisted-transcription feature should keep this network boundary obvious and preserve a useful local workflow.

## Future adapters

Optional Micro.blog Notes, assisted transcription/accessibility metadata, deeper tablet integrations and other publisher adapters should remain boundaries around existing human-owned source material. They should be added only when they solve a concrete workflow and should not require rewriting the canonical representation of a handwritten document or prepared Markdown file.
