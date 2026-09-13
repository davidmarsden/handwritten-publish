# Helping Hand status

## Current release: v1.0.0 core + post-v1.0 additions

Helping Hand's original four-tool publishing suite reached feature-complete v1.0.0 status for the workflows it was built to solve. Dent Hand has since joined the family as a fifth, deliberately small multi-network social client for Micro.blog and Mastodon-compatible servers. Future work remains optional and should be driven by real needs rather than a release calendar.

## Writing Hand — working

- [x] reMarkable Send by email → Micro.blog
- [x] Edited transcription only
- [x] Original handwritten PNG pages only
- [x] Transcription + original pages
- [x] Strip reMarkable subject/body boilerplate
- [x] Optional leading `Title:` metadata
- [x] Optional Micro.blog `Categories:` metadata
- [x] Explicit `Status: draft` / `Status: published`
- [x] Draft by default when status is absent or invalid
- [x] Leading hashtag shorthand for existing Micro.blog categories
- [x] Signed Resend webhook verification
- [x] Durable idempotency/retry handling for received email jobs
- [x] Recipient → Micro.blog destination routing
- [x] Self-hosted setup and security documentation

Still optional/future: PDF email attachments and deeper native tablet integrations.

## Publish Hand — working

### Documents and local persistence

- [x] Import multiple reMarkable PNG pages
- [x] Import PDFs locally in the browser and render them into ordinary pages
- [x] Import standalone JPEG/PNG/WebP photo pages into the same ordered sequence
- [x] Natural filename ordering and manual mixed-page reordering
- [x] Touch/mouse drag controls with arrow fallbacks
- [x] IndexedDB local draft persistence
- [x] Portable `.handpub` export/import with SHA-256 integrity checks
- [x] Optional transcript, summary and category metadata

### Annotations and mixed media

- [x] Visual page annotation editor
- [x] Normalized clickable link regions
- [x] Positioned photo regions with alt text
- [x] First-class original JPEG/PNG/WebP photo assets
- [x] Persist original photo files through local storage and `.handpub`

### Micro.blog publishing

- [x] Account/destination discovery
- [x] Existing category discovery
- [x] Summary/category sync through Micropub
- [x] Media upload through Netlify bridges
- [x] Create private Micro.blog drafts
- [x] Track and update existing drafts
- [x] Reuse unchanged uploaded media
- [x] Publish responsive link/photo annotations
- [x] Publish standalone photo pages in document order
- [x] Optimise oversized image derivatives while preserving originals
- [x] Inspect tracked post status before mutation
- [x] Safely update an already-published tracked post after explicit confirmation
- [x] Recover canonical published URLs after Micro.blog replaces private-draft URLs

## BUM Hand — working

- [x] One mixed-file chooser and queue
- [x] JPEG, PNG and WebP image uploads
- [x] MP3 and M4A audio uploads
- [x] PDF document uploads
- [x] Mixed image/audio/PDF batches in one run
- [x] Up to 30 selected files per queue
- [x] Local optimisation for larger photos
- [x] Android/Google Photos eager file staging for reliable batch reads
- [x] Choose a Micro.blog destination blog
- [x] Route image uploads to the selected Micro.blog destination with `mp-destination`
- [x] Route streamed audio/PDF uploads to the selected Micro.blog destination
- [x] Add photos directly to existing Photo Collections
- [x] Create new Photo Collections from BUM Hand
- [x] Stream audio/PDF through a same-origin Netlify Edge proxy
- [x] Per-file retry and separate collection retry
- [x] Canonical URL, Markdown and HTML results
- [x] Browser audio playback controls
- [x] Regression coverage for destination-aware image uploads and multi-blog routing

## Markdown Hand — working

- [x] Choose a local `.md` file on desktop or tablet
- [x] Keep the selected Markdown unchanged whichever destination is chosen
- [x] Save a private working draft to a configured GitHub repository
- [x] Update an existing private draft when the same filename is saved again
- [x] Keep the GitHub repository token server-side behind a separate browser write key
- [x] Trigger the configured private draft-review workflow through ordinary `drafts/**` changes
- [x] Send raw Markdown directly as Micro.blog Micropub `content`
- [x] Optional title, summary and category metadata for Micro.blog
- [x] Choose a Micro.blog destination
- [x] Draft-first Micro.blog publishing
- [x] Explicit confirmation before immediate Micro.blog publication
- [x] Fetch the created Micro.blog post back with Micropub `q=source`
- [x] Verify and report exact Markdown round-trip matches
- [x] Preserve the created post URL if source verification fails
- [x] Dedicated app mark and page-specific favicon

## Dent Hand — working

### Shared product surface

- [x] Live `/social/` product surface
- [x] Installable Dent Hand / dent.hand web-app identity
- [x] Provider abstraction separating the UI from network-specific clients
- [x] Network chooser and account switching between Micro.blog and Mastodon-compatible servers
- [x] Local Dent Hand Circle that remains independent of either provider
- [x] Lightweight app-shell/service-worker support

### Micro.blog provider

- [x] Micro.blog OAuth / IndieAuth sign-in
- [x] Server-side encrypted Micro.blog access tokens
- [x] Opaque `HttpOnly` session cookie in the browser
- [x] Request the Micro.blog scopes Dent Hand actually needs: `profile read create update`
- [x] Signed-in Micro.blog timeline
- [x] Open conversations
- [x] Reply to posts
- [x] Bookmark and unbookmark posts
- [x] Browse bookmarks and replies
- [x] Browse profiles/user timelines
- [x] Dedicated `/social/my-posts/` view for the user's own posts
- [x] Guarded short-form posting to an explicitly chosen Micro.blog destination
- [x] Typed browser client in `src/microblogSocial.ts`
- [x] Allow-listed Netlify social bridge rather than a general proxy

### Mastodon / compatible-server provider

- [x] Public Mastodon profile/status reading from Micro.blog-fed federated authors
- [x] Secure instance-aware OAuth registration and sign-in
- [x] DNS/private-network validation and pinned HTTPS requests for user-supplied server names
- [x] Server-side encrypted Mastodon client secrets and user access tokens
- [x] Opaque `HttpOnly` Mastodon session cookie in the browser
- [x] Authenticated chronological home timeline
- [x] Remote profile links from the timeline
- [x] Reply to statuses
- [x] Favourite and unfavourite statuses
- [x] Bookmark and unbookmark statuses
- [x] Boost and unboost statuses
- [x] Publish new short-form statuses
- [x] Preserve provider action state (`favourited`, `bookmarked`, `reblogged`) in normalized timeline items
- [x] Typed browser client in `src/mastodonSocial.ts`

Further Dent Hand work should stay deliberately small and need-driven: better history/paging, interaction-state polish, capability detection for compatible Fediverse servers, and lightweight caching only where they remove real friction. Micro.blog mentions should remain optional/degraded until the relevant endpoint is reliable enough to depend on.

## Safety and privacy boundary

- Browser publishing tokens used by Publish Hand, BUM Hand and Markdown Hand remain ephemeral unless that product explicitly documents otherwise.
- Dent Hand does **not** keep reusable Micro.blog or Mastodon bearer tokens in browser storage: provider access tokens are encrypted server-side and browser JavaScript receives only opaque `HttpOnly` session cookies.
- Mastodon OAuth application secrets are also encrypted server-side rather than embedded in browser JavaScript.
- Dent Hand's production deployment requires `DENT_HAND_SESSION_SECRET` (at least 32 characters) for server-side token and OAuth-secret encryption.
- User-supplied Mastodon server names are restricted to public HTTPS hosts; Dent Hand validates DNS results and pins outbound HTTPS connections to the validated public address to reduce SSRF/DNS-rebinding risk while preserving the intended Host header and TLS SNI.
- Writing Hand uses separate, revocable server-side credentials in the user's own deployment.
- Private GitHub working drafts use a narrowly-scoped server-side repository token plus a separate browser write key.
- New Publish Hand and Markdown Hand Micro.blog posts are draft-first.
- Writing Hand email posts are draft-first unless `Status: published` is explicitly supplied.
- Published tracked-post mutations require explicit confirmation and current-state verification.
- Oversized image derivatives never replace local originals.
- BUM Hand stages selected files locally and forwards them only after the user starts an upload.
- BUM Hand forwards the chosen Micro.blog destination with every supported media upload so multi-blog accounts do not rely on an implicit default.
- Markdown Hand reads the chosen file locally and sends its source only when the user explicitly saves or publishes it.
- Dent Hand forwards authenticated requests only through provider-specific allow-listed operations rather than exposing a general-purpose proxy.

## After v1.0

There is no mandatory next phase. Possible future work remains intentionally open-ended:

- [ ] Assisted transcription and accessibility metadata
- [ ] Richer document revision/history
- [ ] PDF attachments through Writing Hand
- [ ] Additional BUM Hand file types or useful output formats when needed
- [ ] Video only when Micro.blog's API and a real use case justify the complexity
- [ ] Optional Micro.blog Notes destination, including encrypted note creation and notebook selection, if it becomes useful in real use
- [ ] Deeper native reMarkable or other tablet integration
- [ ] Better Dent Hand history/paging and interaction-state polish when real use justifies it
- [ ] Test and document additional Mastodon-compatible Fediverse servers, using capability detection rather than assuming every ActivityPub implementation exposes the same client API
- [ ] Consider additional authenticated social providers only where they expose a suitable client API and solve a real use case
- [ ] Additional destination-neutral publisher adapters when a real need appears

The product rule is simple: add something when it removes a real publishing or interaction frustration, not because the roadmap has an empty box.
