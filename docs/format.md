# `.hwpublish` format v1

A `.hwpublish` file is an ordinary ZIP archive. Its goal is boring portability: handwriting remains readable as standard PNG files even if this application disappears.

## Layout

```text
post.hwpublish
├── manifest.json
├── transcript.md       # optional
├── pages/
│   ├── page-0001.png
│   ├── page-0002.png
│   └── …
└── assets/             # reserved for original photos and other future assets
```

## Manifest

`manifest.json` is UTF-8 JSON. Version 1 has this top-level shape:

```json
{
  "format": "handwritten-publish",
  "version": 1,
  "id": "uuid",
  "title": "Post title",
  "createdAt": "ISO-8601 timestamp",
  "updatedAt": "ISO-8601 timestamp",
  "transcript": "optional transcript",
  "pages": []
}
```

Each page records its stable application ID, display position, original filename, SHA-256 digest, dimensions, media type, and annotations.

Page files inside the archive are renamed by display position (`page-0001.png`, etc.). The original export filename remains in the manifest.

## Coordinates

Annotations use normalized coordinates where `x`, `y`, `width`, and `height` are numbers from `0` to `1`, measured against the source page dimensions. This keeps future hyperlink and photograph overlays aligned at any responsive display size.

## Compatibility principles

- Existing version-1 fields must not silently change meaning.
- Unknown fields should be ignored by readers where possible.
- New annotation types may be added without altering the source PNG.
- Page images are canonical. Transcripts and annotations enrich them; they do not replace them.
- A document `id` is stable across edits and republishes.
- SHA-256 digests identify page content and can later be combined into a document revision digest.
