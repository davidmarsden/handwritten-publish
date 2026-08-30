# Helping Hand status

## Current release: v1.0.0

Helping Hand is now a complete four-tool publishing suite for the workflows it was built to solve. The core v1.0 release is feature-complete for current use; future work is optional and should be driven by real needs rather than a release calendar.

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
- [x] Add photos directly to existing Photo Collections
- [x] Create new Photo Collections from BUM Hand
- [x] Stream audio/PDF through a same-origin Netlify Edge proxy
- [x] Per-file retry and separate collection retry
- [x] Canonical URL, Markdown and HTML results
- [x] Browser audio playback controls

## Markdown Hand — working

- [x] Choose a local `.md` file on desktop or tablet
- [x] Send raw Markdown directly as Micropub `content`
- [x] Optional title, summary and category metadata
- [x] Choose a Micro.blog destination
- [x] Draft-first publishing
- [x] Explicit confirmation before immediate publication
- [x] Fetch the created post back with Micropub `q=source`
- [x] Verify and report exact Markdown round-trip matches
- [x] Preserve the created post URL if source verification fails
- [x] Dedicated app mark and page-specific favicon

## Safety and privacy boundary

- Browser Micro.blog tokens remain ephemeral and are not persisted by Helping Hand.
- Writing Hand uses separate, revocable server-side credentials in the user's own deployment.
- New Publish Hand and Markdown Hand posts are draft-first.
- Writing Hand email posts are draft-first unless `Status: published` is explicitly supplied.
- Published tracked-post mutations require explicit confirmation and current-state verification.
- Oversized image derivatives never replace local originals.
- BUM Hand stages selected files locally and forwards them only after the user starts an upload.
- Markdown Hand reads the chosen file locally and sends its source only when the user explicitly creates a post.

## After v1.0

There is no mandatory next phase. Possible future work remains intentionally open-ended:

- [ ] Assisted transcription and accessibility metadata
- [ ] Richer document revision/history
- [ ] PDF attachments through Writing Hand
- [ ] Additional BUM Hand file types or useful output formats when needed
- [ ] Video only when Micro.blog's API and a real use case justify the complexity
- [ ] Deeper native reMarkable or other tablet integration
- [ ] Destination-neutral publisher adapters when a real need appears

The product rule is simple: add something when it removes a real publishing frustration, not because the roadmap has an empty box.
