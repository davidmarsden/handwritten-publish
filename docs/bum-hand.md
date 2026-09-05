# BUM Hand

**BUM Hand** is the Batch Uploader for Micro.blog. It is deliberately small: select local files, send them to your own Micro.blog account, and get useful canonical URLs back without having to create a post.

The hosted tool lives at `/bum/`.

## Current mixed-media workflow

BUM Hand uses a single file chooser and queue. Files are classified after selection and routed to the appropriate upload path behind the scenes. Mixed batches can contain images, audio and PDFs.

A connected Micro.blog token can expose more than one blog. BUM Hand therefore treats the selected destination as part of every upload, not just post creation or Photo Collection assignment. Images, audio and PDFs are all sent with the chosen Micro.blog destination so a multi-blog token does not leave media routing ambiguous.

### Images

- JPEG, PNG and WebP;
- local resize/compression for larger photos;
- destination-aware upload to the selected Micro.blog blog;
- direct assignment to existing or newly created Micro.blog Photo Collections;
- URL, Markdown and HTML output;
- per-file retry and separate collection retry.

Images use the buffered Netlify media bridge. The browser sends the selected destination with the image request, and the bridge forwards it to Micro.blog as `mp-destination` in the multipart media upload. This keeps the image path consistent with BUM Hand's streamed audio/PDF path and prevents a multi-blog account from uploading to an unintended blog.

Android/provider-backed files are eagerly staged into browser-owned `File` objects immediately after selection so later items do not become unreadable while a batch is processed.

### Audio

BUM Hand accepts MP3 and M4A files in the same queue. Audio uses a same-origin Netlify Edge proxy that streams the file to Micro.blog's media endpoint, avoiding browser CORS restrictions and the smaller buffered photo bridge. The selected destination is included as `mp-destination` in the streamed multipart request.

The current streamed-media limit is 75 MB per file. Audio results include canonical URLs, Markdown links, `<audio>` HTML and a browser playback control.

### Documents

BUM Hand accepts PDF files in the same mixed queue. PDFs use the same streamed Edge media path as audio, preserving the selected filename and destination in the multipart upload rather than pretending the document is an image.

PDF results provide:

- the canonical Micro.blog upload URL;
- Markdown such as `[Annual report (PDF)](https://example.com/uploads/annual-report.pdf)`;
- HTML such as `<a href="https://example.com/uploads/annual-report.pdf">Annual report (PDF)</a>`.

The visible link label is derived from the original filename: the `.pdf` extension is removed, hyphens and underscores become spaces, whitespace is tidied, and `(PDF)` is appended. The original local file is not renamed or modified.

Photo Collection assignment applies only to image items in a mixed batch; audio and PDFs ignore it. Collection lookup and assignment use the same selected Micro.blog destination as the media upload.

## Privacy and credentials

Micro.blog app tokens are supplied per session/request. BUM Hand does not store the token in its local document storage or Netlify configuration.

Selected files are staged locally in the browser until upload. Images use the buffered photo upload path; audio and PDFs are streamed through BUM Hand's same-origin Edge proxy directly onward to Micro.blog rather than being stored by BUM Hand.

The selected destination is request metadata only. It is forwarded with the upload so Micro.blog can route the media correctly and is not persisted by BUM Hand.

## Reliability notes

Two Android/browser failure modes now have explicit safeguards:

- provider-backed selections are materialised immediately into stable browser-owned `File` objects;
- every supported media type carries the selected Micro.blog destination through to the upstream upload.

Both are covered by regression tests because they can otherwise fail only on real devices or multi-blog accounts while appearing fine in a simple single-blog desktop test.

## Product boundary

BUM Hand should remain a batch uploader, not become a media library or second CMS. New file types belong when they remove repetitive publishing work while leaving Micro.blog as the destination and source of truth.
