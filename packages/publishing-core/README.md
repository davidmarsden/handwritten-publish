# Publishing Core

Shared publishing primitives for the Helping Hand tools.

This package boundary is intentionally product-neutral. It now owns the first extracted browser transport layer used by both **Publish Hand** and **BUM Hand**:

- Micro.blog destination discovery;
- category discovery;
- media upload through the shared `/api/microblog/media` bridge;
- common response/error handling for those operations;
- the shared 5 MB bridge limit;
- image MIME inference for PNG/JPEG/WebP when a browser leaves `File.type` empty.

The canonical browser module is `microblog-client.ts`. Publish Hand imports it directly. BUM Hand remains a static page for now, so the `sync:publishing-core` script transpiles that same source into `public/shared/microblog-client.js` before local development and production builds. The generated browser copy is not a second implementation.

Future reusable work can move here incrementally, including post create/update and destination-neutral publisher adapters.

This package must not depend on reMarkable email parsing, Publish Hand document/page models, or BUM Hand batch UI state. Product-specific orchestration stays in its app boundary.
