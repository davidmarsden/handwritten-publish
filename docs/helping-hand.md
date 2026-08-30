# Helping Hand

Helping Hand is the umbrella for a small family of human-first publishing tools. The suite reached its first complete release at v1.0.0.

The tools share publishing infrastructure, but each has one clear job and should be usable without exposing the complexity of the others.

## The family

### Writing Hand

**reMarkable → Micro.blog.**

Write on a reMarkable, use the tablet's built-in Send by email workflow, and turn the message into a Micro.blog draft or an explicitly published post. Writing Hand owns Resend inbound email, reMarkable transcription cleanup, metadata parsing, original-page attachment handling, recipient routing and unattended retry/idempotency.

Tagline: **From paper to web at the push of a pen.**

### Publish Hand

**Handwriting, images and documents → web.**

The browser-based publishing workbench. It keeps handwritten page images canonical while allowing transcripts, links, photographs and publishing metadata to enrich them. It imports PNG/photo/PDF material, persists local documents, exports portable `.handpub` bundles and publishes safely to Micro.blog.

Publish Hand remains destination-neutral at the document-model level. Micro.blog is the first publishing adapter, not the definition of the document format.

### BUM Hand

**Batch Uploader for Micro.blog.**

A focused mixed-file uploader for JPEG/PNG/WebP images, MP3/M4A audio and PDFs. One chooser feeds one queue; the files are routed to the correct upload path behind the scenes. Successful photos can be added directly to Micro.blog Photo Collections, while all supported files return useful canonical URL/Markdown/HTML results.

## Repository strategy

Helping Hand deliberately remains one repository with shared infrastructure. Separate products do not require separate codebases.

Current structure:

```text
apps/
  writing-hand/
  publish-hand/
  bum-hand/
packages/
  publishing-core/
public/
  bum/
  roadmap/
  setup/
publish/
netlify/
  functions/
  edge-functions/
```

The root `/` route is the Helping Hand launcher. `/publish/` is Publish Hand, `/setup/email/` is Writing Hand's product/setup surface, and `/bum/` is BUM Hand.

## Shared publishing core

Shared code belongs in common plumbing when it is genuinely shared:

- Micro.blog/Micropub authentication and destination discovery;
- media upload primitives;
- post create/update operations;
- categories and post status;
- image optimisation;
- privacy-safe public-demo usage controls;
- common configuration and error handling.

Product-specific code stays outside the shared core:

- reMarkable/Resend email parsing belongs to Writing Hand;
- handwritten document/page models and annotation editing belong to Publish Hand;
- queue/batch selection, streamed-file routing and upload-result presentation belong to BUM Hand.

## v1.0 release boundary

The original extraction/restructuring plan is complete:

1. [x] Establish BUM Hand as a standalone product surface.
2. [x] Establish Publish Hand behind its own `/publish/` route.
3. [x] Give the reMarkable email workflow the Writing Hand identity and setup surface.
4. [x] Replace the root application page with the Helping Hand launcher.
5. [x] Share Micro.blog/media primitives without collapsing the three product boundaries.
6. [x] Add consistent suite navigation, setup and roadmap surfaces.

Future work is intentionally need-driven. There is no requirement to add another product or another destination simply because the architecture allows it.

## Product principle

Helping Hand exists to reduce the machinery between human-made material and publication.

The software may transcribe, route, upload and automate, but the human-created source remains the point. New features should preserve that authorship, solve a concrete publishing frustration, and avoid turning the suite into a second CMS.
