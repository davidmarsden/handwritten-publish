# BUM Hand

**BUM Hand** is the Batch Uploader for Micro.blog. It is deliberately small: select local media, send it to your own Micro.blog account, and get useful canonical URLs back without having to create a post.

The hosted tool lives at `/bum/`.

## Current image and Photo Collections release

The image workflow is now considered the stable baseline for BUM Hand.

### What it does

- accepts batches of JPEG, PNG and WebP images;
- supports up to 30 selected images in one batch;
- discovers the user's available Micro.blog blogs from an app token;
- uploads images without creating a blog post;
- can add every successful upload directly to an existing Micro.blog Photo Collection;
- can create a new Photo Collection from BUM Hand and use it immediately;
- returns Micro.blog's canonical uploaded-media URLs;
- provides copyable URL, Markdown and HTML output;
- keeps per-file status and explicit retry controls;
- keeps a successful media upload successful even if collection assignment later fails, so retrying collection assignment does not duplicate the upload.

### Large-photo handling

BUM Hand uses the shared browser-side photo optimiser from the Helping Hand publishing core. Larger photos are resized/compressed locally into temporary upload derivatives before being sent through the Micro.blog media bridge. The original local files are never changed.

The optimisation threshold is intentionally a bridge-safe threshold rather than Micro.blog's nominal maximum file size. This leaves transport headroom for the Netlify request bridge instead of relying on a fragile file-size boundary.

### Android / Google Photos batch handling

Android photo providers can expose selected photos through temporary provider-backed `File` handles. In real multi-photo testing those handles could become unreadable while later items waited in the upload queue, producing apparently unrelated image-decoding and `Failed to fetch` errors.

BUM Hand now eagerly stages the selected batch into browser-owned `File` objects immediately after selection, while provider access is fresh. Resizing and upload then work only from those stable local copies.

This was verified in a mixed-size 15-photo Google Photos batch: all 15 files uploaded successfully, larger files were optimised where needed, and all 15 were added to the chosen Micro.blog Photo Collection.

## Privacy and credentials

Micro.blog app tokens are supplied per session/request. BUM Hand does not store the token in its local document storage or Netlify configuration.

Selected media is staged and processed locally in the browser until the user explicitly starts an upload.

## Next milestone: audio

Audio is the next BUM Hand priority before document/PDF uploads.

The first target is explicit support for Micro.blog-compatible audio formats, beginning with **MP3 and M4A**. The desired workflow is the same small-tool model as images:

1. select one or more audio files;
2. validate supported type and size clearly;
3. upload without requiring a post;
4. return canonical Micro.blog URLs and useful copy formats;
5. preserve reliable per-file progress and retry behaviour.

Audio must not simply inherit the photo bridge's small-request assumptions. Real audio files can be much larger than photographs, so the implementation should first verify Micro.blog's current media-upload API and limits and choose an upload architecture that supports realistically sized tracks without forcing them through an unsuitable Netlify function payload.

Potential later audio workflow: optionally turn an uploaded track into a ready-to-use Micro.blog post or podcast enclosure, while keeping plain upload-only mode as the default.

## After audio: documents

PDF and other explicitly supported document uploads remain useful, but follow audio in priority. The intended PDF workflow is upload-only first: preserve the file, return its canonical URL, and provide sensible link/Markdown/HTML snippets rather than pretending a PDF is an image.

## Product boundary

BUM Hand should remain a batch uploader, not become a media library or second CMS. New features belong when they remove repetitive publishing work while leaving Micro.blog as the destination and source of truth.
