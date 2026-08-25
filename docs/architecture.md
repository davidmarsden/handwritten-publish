# Architecture

Handwritten Publish is built around a destination-neutral document model.

```text
PNG/PDF/native tablet input
        ↓
HandwrittenDocument
        ↓
local preview / annotations / transcript
        ↓
.hwpublish bundle
        ↓
publisher adapters
  ├── Micro.blog Micropub
  └── handwritten.blog
```

## Core rule

The page image is canonical. A transcript, hyperlink region, photograph overlay, alt text, or publishing destination enriches the page but does not replace it.

## Input adapters

The first supported input is a user-selected ordered set of PNG files exported from reMarkable. PDF import and native tablet access are later adapters into the same document model.

## Publisher adapters

Publisher code must consume a `HandwrittenDocument`; it must not dictate the core schema. Publishing should create drafts by default.

## Privacy

Page processing should remain browser-local unless an explicitly chosen feature requires upload. A future publisher or AI transcription feature must make its network boundary obvious.

## Revision identity

A document has a stable UUID across edits. Each page has a SHA-256 content digest. A future revision digest can combine the ordered page hashes and relevant metadata to detect unchanged documents and update existing drafts safely.
