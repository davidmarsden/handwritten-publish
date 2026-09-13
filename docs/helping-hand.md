# Helping Hand

Helping Hand is the umbrella for a small family of human-first publishing tools. The original four-tool publishing suite reached its first complete release at v1.0.0; Dent Hand later joined the family as the lightweight social side of the toolkit and now supports both Micro.blog and Mastodon-compatible servers.

The tools share infrastructure, but each has one clear job and should be usable without exposing the complexity of the others.

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

BUM Hand discovers the blogs available to the supplied Micro.blog token and treats the selected blog as part of the upload contract. Buffered image uploads and streamed audio/PDF uploads all forward the chosen destination to Micro.blog, so multi-blog accounts do not rely on an implicit default.

### Markdown Hand

**Prepared Markdown → private working draft or publication.**

A deliberately tiny router for finished `.md` files. It reads the chosen file locally and sends it unchanged either to a configured private GitHub working-draft repository or to Micro.blog. Saving the same filename updates the existing private draft. The Micro.blog route keeps title/summary/categories separate as optional metadata, defaults to draft, and fetches the created post source back with `q=source` to verify an exact round trip.

Tagline: **Your Markdown. Hands off.**

Markdown Hand intentionally has no editor. Its job is to keep a prepared Markdown file as the source of truth while routing it to the right next stage.

### Dent Hand

**A small chronological social-web client, without the clutter.**

Dent Hand lives at `/social/`. It is for reading and responding rather than long-form publishing: chronological home timelines, replies, bookmarks, favourites, boosts, profiles, a local Circle and short-form posting stay close at hand, while proper writing remains in the dedicated publishing tools.

Micro.blog and Mastodon-compatible servers are separate providers behind the same Dent Hand product boundary. A network chooser selects the account that powers the current timeline, while the Circle belongs to Dent Hand itself and remains local to the browser rather than to either network.

For Micro.blog, Dent Hand signs in through OAuth / IndieAuth with the `profile read create update` scopes its actual features require. The access token is encrypted server-side; browser JavaScript receives only an opaque `HttpOnly` session cookie. The Micro.blog social API layer is deliberately allow-listed rather than a general proxy.

For Mastodon-compatible servers, Dent Hand asks for the user's home server, registers/authenticates server-side, encrypts both OAuth application secrets and user access tokens, and again exposes only an opaque browser session. The authenticated provider supports the chronological home timeline, profile links, replies, favourites, bookmarks, boosts and new statuses. Public Mastodon profile/status reading also remains available for federated authors encountered through Micro.blog.

ActivityPub federation by itself is not treated as a client API guarantee. Additional Fediverse software should be tested by capability rather than assumed compatible simply because it federates.

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
  markdown/
  roadmap/
  setup/
social/
publish/
netlify/
  functions/
  edge-functions/
```

The root `/` route is the Helping Hand launcher. `/publish/` is Publish Hand, `/setup/email/` is Writing Hand's product/setup surface, `/bum/` is BUM Hand, `/markdown/` is Markdown Hand, and `/social/` is Dent Hand.

## Shared publishing and provider boundaries

Shared code belongs in common plumbing when it is genuinely shared:

- Micro.blog/Micropub authentication and destination discovery;
- media upload primitives, including destination-aware image upload headers;
- post create/update operations;
- categories and post status;
- image optimisation;
- privacy-safe public-demo usage controls;
- common configuration and error handling;
- Dent Hand's provider contract, while network-specific API behavior remains in the relevant provider.

Product-specific code stays outside the shared core:

- reMarkable/Resend email parsing belongs to Writing Hand;
- handwritten document/page models and annotation editing belong to Publish Hand;
- queue/batch selection, streamed-file routing and upload-result presentation belong to BUM Hand;
- raw Markdown file reading, private GitHub draft routing and Micro.blog source-verification behaviour belong to Markdown Hand;
- timeline, Circle, interaction and social-session behavior belongs to Dent Hand, with Micro.blog and Mastodon details kept behind provider-specific clients and server bridges.

## Destination boundaries

Helping Hand no longer assumes that every useful intermediate state is a Micro.blog post.

- Micro.blog remains the main publication platform used across the publishing tools and one first-class Dent Hand social provider.
- BUM Hand treats the selected Micro.blog blog as explicit request metadata for every supported media upload.
- Markdown Hand can instead stop at a configured private GitHub working draft when a piece is still research or newsroom material.
- Dent Hand can authenticate either a Micro.blog account or a Mastodon-compatible account without collapsing the networks into one fake common API.
- Dent Hand's provider credentials remain server-side and encrypted; browser sessions are represented only by opaque cookies.
- User-supplied Mastodon server names are validated as public HTTPS destinations and outbound requests are pinned to validated public addresses before any OAuth or API traffic is sent.
- The GitHub repository credential is server-side and narrowly scoped; the browser uses a separate write key.
- Destination-specific adapters should remain small boundaries around human-owned source files or explicit social actions, not reasons to reshape the core formats.

## v1.0 release boundary

The original extraction/restructuring plan is complete, and the later Markdown round-trip proof earned a place in the same release because it solved an immediate publishing frustration before the v1.0 tag was cut:

1. [x] Establish BUM Hand as a standalone product surface.
2. [x] Establish Publish Hand behind its own `/publish/` route.
3. [x] Give the reMarkable email workflow the Writing Hand identity and setup surface.
4. [x] Add Markdown Hand behind `/markdown/` for editor-free `.md` routing and publishing.
5. [x] Replace the root application page with the Helping Hand launcher.
6. [x] Share Micro.blog/media primitives without collapsing the four original product boundaries.
7. [x] Add consistent suite navigation, setup and roadmap surfaces.
8. [x] Add the first non-Micro.blog working destination: a configured private GitHub working-draft route.
9. [x] Make BUM Hand media routing explicit for multi-blog Micro.blog accounts across images, audio and PDFs.

Dent Hand is post-v1.0 work: a fifth product boundary created because an actual need emerged, not because the architecture had room for another box. Its secure Micro.blog OAuth/session layer now supports real multi-user sign-in without exposing bearer tokens to browser storage, and its later provider abstraction allowed Mastodon-compatible accounts to become a second authenticated provider without rewriting the product around one network.

The Mastodon layer deliberately arrived in stages: public profile reading first; provider abstraction second; secure instance-aware OAuth and home timeline next; then replies, favourites, bookmarks, boosts, publishing and profile navigation after live-account testing proved the flow.

Future work is intentionally need-driven. There is no requirement to add another product, destination or social network simply because the architecture allows it.

## Reliability as roadmap work

After v1.0, maintenance is a first-class part of the roadmap rather than an afterthought. The Android/provider-backed file staging fix, the multi-blog `mp-destination` fix, Dent Hand's Micro.blog OAuth/scope hardening, the Mastodon DNS-pinning correction and live profile/action fixes are examples: none is merely decorative, and each protects a workflow that real use exposed.

Real-device regressions, API changes, browser quirks, OAuth/scope changes, instance compatibility and destination-routing failures therefore take priority over speculative additions.

## Product principle

Helping Hand exists to reduce the machinery between human-made material and publication or conversation.

The software may transcribe, route, upload, automate, read or reply, but the human-created source and human interaction remain the point. New features should preserve that authorship, solve a concrete frustration, and avoid turning the suite into a second CMS or a bloated social dashboard.
