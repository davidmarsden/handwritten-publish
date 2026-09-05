# BUM Hand

**BUM Hand** is the Batch Uploader for Micro.blog. It is deliberately small: select local files, send them to your own Micro.blog account, and get useful canonical URLs back without having to create a post.

The hosted tool lives at `/bum/`.

## Current mixed-media workflow

BUM Hand uses a single file chooser and queue. Files are classified after selection and routed to the appropriate upload path behind the scenes. Mixed batches can contain images, audio and PDFs.

### Images

- JPEG, PNG and WebP;
- local resize/compression for larger photos;
- destination-aware upload to the selected Micro.blog blog;
- direct assignment to existing or newly created Micro.blog Photo Collections;
- URL, Markdown and HTML output;
- per-file retry and separate collection retry.

Android/provider-backed files are eagerly staged into browser-owned `File` objects immediately after selection so later items do not become unreadable while a batch is processed.

Image uploads use the buffered Micro.blog media bridge after local optimisation. BUM Hand passes the chosen destination through the browser client and Netlify bridge, which forwards it to Micro.blog as multipart `mp-destination`. This destination-routing path has automated regression coverage so multi-blog tokens do not silently fall back to an implicit media destination.

### Audio

BUM Hand accepts MP3 and M4A files in the same queue. Audio uses a same-origin Netlify Edge proxy that streams the file to Micro.blog's media endpoint, avoiding browser CORS restrictions and the smaller buffered photo bridge.

The current streamed-media limit is 75 MB per file. Audio results include canonical URLs, Markdown links, `<audio>` HTML and a browser playback control.

The streamed route carries the selected Micro.blog destination too, so audio and image uploads behave consistently for accounts that can access more than one blog.

### Documents

BUM Hand accepts PDF files in the same mixed queue. PDFs use the same streamed Edge media path as audio, preserving the selected filename in the multipart upload rather than pretending the document is an image.

PDF results provide:

- the canonical Micro.blog upload URL;
- Markdown such as `[Annual report (PDF)](https://example.com/uploads/annual-report.pdf)`;
- HTML such as `<a href="https://example.com/uploads/annual-report.pdf">Annual report (PDF)</a>`.

The visible link label is derived from the original filename: the `.pdf` extension is removed, hyphens and underscores become spaces, whitespace is tidied, and `(PDF)` is appended. The original local file is not renamed or modified.

Photo Collection assignment applies only to image items in a mixed batch; audio and PDFs ignore it.

## Destination routing and reliability

The selected Micro.blog blog is part of BUM Hand's upload contract for every supported media type:

- images use the buffered media bridge with multipart `mp-destination`;
- audio and PDFs use the streamed Edge route with the same destination field;
- Photo Collection operations use the same selected destination.

This matters most for tokens that can access multiple blogs: BUM Hand should never depend on Micro.blog choosing an implicit default destination.

Real-device reliability work remains first-class maintenance. The Android/provider-backed staging fix is documented because it solved a genuine batch-read failure in use; automated regression coverage currently exists for destination-aware image uploads and multi-blog routing.

## Privacy and credentials

Micro.blog app tokens are supplied per session/request. BUM Hand does not store the token in its local document storage or Netlify configuration.

Selected files are staged locally in the browser until upload. Images use the photo upload path; audio and PDFs are streamed through BUM Hand's same-origin Edge proxy directly onward to Micro.blog rather than being stored by BUM Hand.

## Product boundary

BUM Hand should remain a batch uploader, not become a media library or second CMS. New file types belong when they remove repetitive publishing work while leaving Micro.blog as the destination and source of truth.
