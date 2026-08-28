# BUM Hand

**Batch Uploader for Micro.blog**

This directory is the future product boundary for a focused batch uploader.

BUM Hand should let a user select many supported files, upload them to Micro.blog, and copy useful results without opening the document-publishing workflow.

Initial scope:

- multiple-file selection;
- image upload through the existing Micro.blog media bridge;
- per-file success/failure state;
- copyable Micro.blog media URLs;
- copyable Markdown/HTML snippets;
- retry failed items without re-uploading successful ones.

The product should be designed around media/files rather than photos so supported audio and other uploadable formats can be added later.

Shared Micro.blog authentication, destination discovery and upload primitives belong in `packages/publishing-core/`.
