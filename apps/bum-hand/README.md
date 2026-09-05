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
