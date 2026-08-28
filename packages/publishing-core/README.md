# Publishing Core

Shared publishing primitives for the Helping Hand tools.

This package boundary is intentionally product-neutral. It is the future home for reusable code such as:

- Micro.blog/Micropub token handling;
- destination discovery;
- media upload;
- post create/update;
- categories and post status;
- common publisher errors/results.

It must not depend on reMarkable email parsing, Hand Published document/page models, or Hand Up batch UI state.

No production code has moved here yet. Extraction will happen incrementally with tests so the existing deployment continues to work throughout the restructure.
