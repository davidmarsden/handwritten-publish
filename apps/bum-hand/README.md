# BUM Hand

**Batch Uploader for Micro.blog**

BUM Hand is the focused batch-media utility in the Helping Hand family. It lets a user upload multiple files to Micro.blog and copy useful results without opening the document-publishing workflow.

## v1 implementation

The first standalone BUM Hand surface is deployed from `public/bum/` and is available at `/bum/`.

It currently supports:

- multiple-file selection and drag/drop;
- PNG, JPEG and WebP uploads through the existing Micro.blog media bridge;
- a maximum of 30 files per browser batch;
- the bridge's current 5 MB per-file limit;
- sequential uploads to avoid unnecessary request bursts;
- per-file queued/uploading/success/failure state;
- retrying upload failures without re-uploading successful items;
- copyable individual Micro.blog media URLs;
- bulk copy as URLs, Markdown or HTML;
- a token that stays in page memory and is sent only with upload requests.

Preflight failures such as unsupported file types or files over 5 MB are not offered for retry until the user chooses a valid file instead.

## Next boundary

The product is intentionally designed around media/files rather than only photos. Micro.blog's media APIs also expose uploaded files such as MP3s, but BUM Hand should not widen the public bridge until the accepted file types, limits and abuse controls are explicitly verified.

Shared Micro.blog authentication, destination discovery and upload primitives ultimately belong in `packages/publishing-core/`. The static `/bum/` entrypoint is the first safe extraction; moving its client code behind the shared package boundary can happen after the standalone workflow has proved itself.
