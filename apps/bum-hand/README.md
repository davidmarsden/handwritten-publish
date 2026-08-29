# BUM Hand

**Batch Uploader for Micro.blog**

BUM Hand is the focused batch-media utility in the Helping Hand family. It lets a user upload multiple files to Micro.blog, optionally add them straight to a Micro.blog Photo Collection, and copy useful results without opening the document-publishing workflow.

## Current implementation

The standalone BUM Hand surface is deployed from `public/bum/` and is available at `/bum/`.

It currently supports:

- multiple-file selection and drag/drop;
- PNG, JPEG and WebP uploads through the existing Micro.blog media bridge;
- automatic local resizing/compression of photos over the bridge's 5 MB upload limit, using the same shared optimizer as Publish Hand;
- a maximum of 30 files per browser batch;
- sequential uploads to avoid unnecessary request bursts;
- per-file queued/optimizing/uploading/success/failure state;
- retrying upload failures without re-uploading successful items;
- discovery of the token's Micro.blog blogs and Photo Collections;
- creating a Photo Collection from BUM Hand;
- adding a successful batch directly to a selected Photo Collection without creating a blog post;
- retrying collection assignment separately from media upload;
- copyable individual Micro.blog media URLs;
- bulk copy as URLs, Markdown or HTML;
- a token that stays in page memory and is sent only with Micro.blog requests.

Unsupported or empty files fail preflight. Oversized supported photos are not rejected: BUM Hand keeps the original browser file untouched and prepares a temporary Micro.blog-safe JPEG derivative for upload.

## Next boundary

The product is intentionally designed around media/files rather than only photos. Micro.blog's media APIs also expose uploaded files such as MP3s, but BUM Hand should not widen the public bridge until the accepted file types, limits and abuse controls are explicitly verified.

Shared Micro.blog authentication, destination discovery, collection operations, media upload and photo optimization live in `packages/publishing-core/` where practical. Product-specific batch orchestration remains in the BUM Hand surface.
