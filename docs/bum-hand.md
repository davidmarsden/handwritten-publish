# BUM Hand

**BUM Hand** is the Batch Uploader for Micro.blog. It is deliberately small: select local media, send it to your own Micro.blog account, and get useful canonical URLs back without having to create a post.

The hosted tool lives at `/bum/`.

## Current media workflow

BUM Hand uses a single mixed-media chooser and queue. The interface does not expose separate uploaders for each media type: files are classified after selection and routed to the appropriate upload path behind the scenes.

### Images

- accepts JPEG, PNG and WebP images;
- supports mixed batches of up to 30 files;
- discovers the user's available Micro.blog blogs from an app token;
- uploads images without creating a blog post;
- can add successful image uploads directly to an existing Micro.blog Photo Collection;
- can create a new Photo Collection from BUM Hand and use it immediately;
- returns Micro.blog's canonical uploaded-media URLs;
- provides copyable URL, Markdown and HTML output;
- keeps per-file status and explicit retry controls;
- keeps a successful media upload successful even if collection assignment later fails, so retrying collection assignment does not duplicate the upload.

BUM Hand uses the shared browser-side photo optimiser from the Helping Hand publishing core. Larger photos are resized/compressed locally into temporary upload derivatives before being sent through the Micro.blog media bridge. The original local files are never changed.

The optimisation threshold is intentionally a bridge-safe threshold rather than Micro.blog's nominal maximum file size. This leaves transport headroom for the Netlify request bridge instead of relying on a fragile file-size boundary.

### Android / Google Photos batch handling

Android photo providers can expose selected photos through temporary provider-backed `File` handles. In real multi-photo testing those handles could become unreadable while later items waited in the upload queue, producing apparently unrelated image-decoding and `Failed to fetch` errors.

BUM Hand eagerly stages the selected batch into browser-owned `File` objects immediately after selection, while provider access is fresh. Resizing and upload then work only from those stable local copies.

This was verified in a mixed-size 15-photo Google Photos batch: all 15 files uploaded successfully, larger files were optimised where needed, and all 15 were added to the chosen Micro.blog Photo Collection.

### Audio

BUM Hand accepts MP3 and M4A audio through the same file chooser and queue as images. Audio files are not sent through the small buffered photo bridge. Instead, they are streamed through a same-origin Netlify Edge Function to Micro.blog's media endpoint, avoiding browser CORS restrictions while supporting normal music-file sizes.

The current explicit audio limit is 75 MB per file, matching Micro.blog's current upload limit. Photo Collection assignment is ignored for audio items in a mixed batch.

Audio support has been verified with multiple files selected together, including a 9.2 MB MP3 comfortably above the ordinary photo bridge's practical payload ceiling.

Uploaded audio appears in the same results list as images, with its canonical URL and a playable browser audio control. Mixed results can be copied as URLs, Markdown, or appropriate HTML for each media type.

## Privacy and credentials

Micro.blog app tokens are supplied per session/request. BUM Hand does not store the token in its local document storage or Netlify configuration.

Selected media is staged and processed locally in the browser until the user explicitly starts an upload. Audio is then streamed through BUM Hand's same-origin Edge proxy to Micro.blog rather than stored by BUM Hand.

## Next milestone: documents

PDF and other explicitly supported document uploads remain useful and now follow audio in priority. The intended PDF workflow is upload-only first: preserve the file, return its canonical URL, and provide sensible link/Markdown/HTML snippets rather than pretending a PDF is an image.

The unified queue is intentional: adding PDFs should mean teaching the queue a new `document` kind and transport/output rules, not adding a third upload interface.

## Product boundary

BUM Hand should remain a batch uploader, not become a media library or second CMS. New features belong when they remove repetitive publishing work while leaving Micro.blog as the destination and source of truth.
