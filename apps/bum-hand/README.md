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
- direct assignment of image uploads to existing or newly-created Photo Collections;
- streamed audio/PDF uploads through a same-origin Netlify Edge proxy;
- per-file upload retry and separate Photo Collection retry;
- canonical URLs, Markdown and type-appropriate HTML results;
- browser playback controls for uploaded audio.

Images use the existing buffered Micro.blog media bridge after local optimisation. Audio and PDFs use the streamed Edge route so normal media files are not constrained by the small Function request body ceiling.

Micro.blog tokens remain in page memory and are sent only for requested operations.

## Product boundary

BUM Hand is an uploader, not a media library or CMS. New file types or outputs should be added only when they remove a real repetitive publishing task.

Shared Micro.blog primitives live in `packages/publishing-core/` where practical. Product-specific mixed-queue orchestration remains in the BUM Hand surface.
