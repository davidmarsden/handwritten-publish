# Helping Hand

Helping Hand is the umbrella for a small family of human-first publishing tools.

The tools share a publishing core, but each has one clear job and should be usable without exposing the complexity of the others.

## The family

### Writing Hand

**reMarkable → Micro.blog.**

Write on a reMarkable, use the tablet's built-in Send by email workflow, and turn the message into a Micro.blog draft or an explicitly published post. Writing Hand owns the Resend inbound-email workflow, reMarkable transcription cleanup, metadata parsing, attachment handling and unattended Micro.blog publishing.

Tagline: **From paper to web at the push of a pen.**

### Publish Hand

**Handwriting, images and documents → web.**

The browser-based publishing tool. It keeps handwritten page images canonical while allowing transcripts, links, photographs and publishing metadata to enrich them. The current Handwritten Publish web app is the starting point for Publish Hand.

Publish Hand should remain destination-neutral at the document-model level. Micro.blog is the first publishing adapter, not the definition of the document format.

### BUM Hand

**Batch Uploader for Micro.blog.**

A focused browser utility for uploading multiple media files to Micro.blog and returning useful URLs/HTML/Markdown. Images are the first use case, but the tool should be designed around media/files rather than "photos" so that supported audio and other uploadable formats can be added cleanly.

## Repository strategy

For now, Helping Hand remains one repository with shared infrastructure. Separate products do not require separate codebases.

Target structure:

```text
apps/
  writing-hand/
  publish-hand/
  bum-hand/
packages/
  publishing-core/
  ui/
```

The existing production application remains at the repository root until each product is extracted safely. The first restructuring work is therefore additive: establish boundaries and shared contracts before moving build entrypoints or Netlify Functions.

## Shared publishing core

The tools should converge on shared code for:

- Micro.blog/Micropub authentication and destination discovery;
- media upload;
- post create/update operations;
- categories and post status;
- privacy-safe public-demo usage controls;
- common configuration and error handling.

Product-specific code should stay outside the shared core. In particular:

- reMarkable/Resend email parsing belongs to Writing Hand;
- handwritten document/page models and link-region editing belong to Publish Hand;
- queue/batch-selection and upload-result presentation belong to BUM Hand.

## Extraction order

1. **BUM Hand** — the smallest and cleanest standalone surface; extract it first using the existing media bridge.
2. **Publish Hand** — move the current browser document publisher behind its own app boundary once shared publishing code exists.
3. **Writing Hand** — give the already mostly server-side reMarkable workflow its own setup/identity after the shared backend has stabilised.
4. Replace the root product page with a **Helping Hand** launcher only after all three tools have working routes.

## Product principle

Helping Hand exists to reduce the machinery between human-made material and publication.

The software may transcribe, route, upload and automate, but the human-created source remains the point. The tools should make authorship easier to preserve, not replace it.
