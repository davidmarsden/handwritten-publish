# `.hwpublish` format v1

A `.hwpublish` file is an ordinary ZIP archive. Its goal is boring portability: source pages and photos remain usable standard image files even if this application disappears.

## Layout

A bundle can contain handwritten pages, standalone photo pages, original photo assets used as overlays, and an optional transcript.

```text
post.hwpublish
├── manifest.json
├── transcript.md                 # optional
├── pages/
│   ├── page-0001.png
│   ├── page-0002.jpg             # standalone photo pages may use their media type
│   └── …
└── assets/                       # optional original overlay-photo assets
    ├── <asset-id>.jpg
    └── …
```

Exact page/asset filenames are implementation details recorded by the manifest; consumers should read the manifest rather than infer document meaning from archive filenames alone.

## Manifest

`manifest.json` is UTF-8 JSON. Version 1 has this conceptual top-level shape:

```json
{
  "format": "handwritten-publish",
  "version": 1,
  "id": "uuid",
  "title": "Post title",
  "createdAt": "ISO-8601 timestamp",
  "updatedAt": "ISO-8601 timestamp",
  "transcript": "optional transcript",
  "pages": [],
  "assets": []
}
```

Older version-1 bundles may omit fields introduced later, including `assets`; readers remain backward-compatible with the earlier PNG-only shape.

Each page records stable application identity, display position, original filename, SHA-256 digest, dimensions, media type and page-specific metadata. Handwritten pages can carry annotations. Standalone photo pages carry their own photo-page metadata such as alt text.

Photo assets record a stable asset ID, original filename, media type, SHA-256 digest and dimensions. Annotation bindings refer to those stable IDs.

## Page kinds

Version 1 supports two logical page kinds:

- **handwritten page** — normally a PNG exported/rendered from a handwriting device; may contain normalized link and photo annotations;
- **standalone photo page** — JPEG, PNG or WebP occupying its own position in the ordered document sequence.

Older bundles without an explicit page-kind distinction are interpreted compatibly as handwritten pages.

## Coordinates

Annotations use normalized coordinates where `x`, `y`, `width`, and `height` are numbers from `0` to `1`, measured against the source page dimensions. This keeps hyperlink and photograph overlays aligned at any responsive display size.

A link annotation stores its destination URL and optional label. A photo annotation stores an asset ID plus optional alt text. The original handwritten page image is not modified to bake those annotations in.

## Integrity

Source page files and photo assets are identified by SHA-256 digests in the manifest. Import verifies file content against those recorded hashes before accepting the bundle.

Publishing derivatives are not part of the portable source format. For example, a temporary recompressed JPEG produced to satisfy a remote media-size limit does not replace the original asset or its digest in `.hwpublish`.

## Compatibility principles

- Existing version-1 fields must not silently change meaning.
- Missing fields from earlier version-1 bundles should receive backward-compatible defaults.
- Unknown fields should be ignored by readers where possible.
- New annotation types may be added without altering the source page image.
- Source page images and original photo assets are canonical. Transcripts, annotations and publishing state enrich them; they do not replace them.
- A document `id` is stable across edits and republishes.
- Page and asset SHA-256 digests identify source content independently of remote publishing URLs.
- Publisher-specific state may be recorded as metadata but must not make the core document dependent on one destination.
