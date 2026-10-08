# BUM Hand

**Batch Uploader for Micro.blog**

BUM Hand is the focused batch-file utility in the Helping Hand family. The live surface is `/bum/`.

## v1.0 boundary

BUM Hand uses one mixed-file chooser and queue rather than separate uploaders. It supports:

- JPEG, PNG and WebP images;
- MP3 and M4A audio;
- PDF documents;
- mixed batches of up to 30 files;
- automatic local optimisation of larger photos;
- eager browser-owned staging of provider-backed Android/Google Photos selections;
- Micro.blog destination discovery;
- destination-aware uploads for every supported media type;
- direct assignment of image uploads to existing or newly-created Photo Collections;
- streamed audio/PDF uploads through a same-origin Netlify Edge proxy;
- per-file upload retry and separate Photo Collection retry;
- canonical URLs, Markdown and type-appropriate HTML results;
- browser playback controls for uploaded audio.

Images use the buffered Micro.blog media bridge after local optimisation. BUM Hand passes the chosen destination through the browser client and Netlify bridge, which forwards it to Micro.blog as multipart `mp-destination`. Audio and PDFs use the streamed Edge route and include the same destination field, so all media types behave consistently for tokens that can access multiple blogs.

The destination-aware image path has automated regression coverage. Provider-backed Android/Google Photos staging is also a shipped reliability safeguard, but it is not currently claimed as covered by the automated test suite.

Micro.blog tokens remain in page memory and are sent only for requested operations.

## Product boundary

BUM Hand is an uploader, not a media library or CMS. New file types or outputs should be added only when they remove a real repetitive publishing task.

Shared Micro.blog primitives live in `packages/publishing-core/` where practical. Product-specific mixed-queue orchestration remains in the BUM Hand surface.

## Audio processing

The upload screen offers opt-in browser-local MP3 conversion at 192 kbps and segmentation of recordings longer than 15 minutes into 1, 2, 3, 4, 5, 10 or 15 minute parts. Conversion uses FFmpeg WASM loaded on demand; processed files are available as a ZIP, and parts are uploaded sequentially through the existing Micro.blog stream-media route. MP3 inputs remain unchanged when no split is necessary. Original source files are never overwritten on the device.

The native-form upload ceiling for MP3, M4A, MP4 and PDF is 100 MB per file. Browser-local FFmpeg conversion and splitting also accept source audio up to 100 MB, including 58 MB recordings. This is an upper bound rather than a device-memory guarantee: FFmpeg WASM may require significantly more RAM than the compressed input size. Segment encoding runs sequentially, but generated parts remain in memory for ZIP download and upload retries. The Netlify edge proxy buffers the incoming upload to build native FormData; 100 MB uploads therefore require real-world testing against edge runtime and Micro.blog upstream limits. The stop button prevents subsequent parts/uploads but does not interrupt an in-flight FFmpeg operation or network upload. MP4 video remains a video upload, not an implicit audio extraction. Existing uploads are reconciled by filename; choose unique names for distinct recordings.

Regression checks: `npm test` (audio segment boundaries, valid lengths, naming), `npm run build`, plus manual 44.1 kHz and 48 kHz M4A-to-MP3 conversion, a >15-minute recording, MP3 pass-through, interrupted/retried segment uploads, ZIP download and Android file picker.
