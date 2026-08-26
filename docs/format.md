# `.hwpublish` format

A `.hwpublish` file is an ordinary ZIP archive. Its goal is boring portability: source pages and photos remain usable standard image files even if this application disappears.

Handwritten Publish currently reads two manifest versions:

- **version 1** — the legacy PNG-only handwritten-page format;
- **version 2** — the current mixed-media format used by Handwritten Publish v0.1.0 and later compatible releases.

New producers should write version 2. Version 1 remains supported for backward compatibility and must retain its original PNG-only page shape.

## Version 2 layout

A version-2 bundle can contain handwritten pages, standalone photo pages, original photo assets used as overlays, document metadata such as a post summary/categories, and an optional transcript.

```text
post.hwpublish
├── manifest.json
├── transcript.md                 # optional
├── pages/
│   ├── page-0001.png
│   ├── page-0002.jpg             # extension follows the page media type
│   └── …
└── assets/                       # optional original overlay-photo assets
    ├── <asset-id>.jpg
    └── …
```

Archive paths are part of the current interchange convention and are derived deterministically; they are **not** stored as paths in the manifest.

Pages are first ordered by their numeric `position`. The first ordered page is stored as `pages/page-0001.<ext>`, the second as `pages/page-0002.<ext>`, and so on. The extension is `png` for `image/png`, `jpg` for `image/jpeg`, and `webp` for `image/webp`. The manifest `filename` field preserves the user's original filename and must not be interpreted as the ZIP entry name.

Each photo asset is stored as `assets/<id>.<ext>`, where `<id>` is the manifest asset ID and the extension is derived from its media type using the same `png` / `jpg` / `webp` convention. The manifest asset `filename` likewise preserves the original user filename rather than an archive path.

Version-1 bundles use the same numbered page-path convention but every page entry is PNG (`pages/page-NNNN.png`) and no asset entries are defined by that format.

## Manifest

`manifest.json` is UTF-8 JSON. The current version-2 document has this conceptual top-level shape:

```json
{
  "format": "handwritten-publish",
  "version": 2,
  "id": "uuid",
  "title": "Post title",
  "createdAt": "ISO-8601 timestamp",
  "updatedAt": "ISO-8601 timestamp",
  "summary": "optional post summary",
  "categories": ["optional", "category names"],
  "transcript": "optional transcript",
  "pages": [],
  "assets": []
}
```

`summary`, `categories`, `transcript`, and `assets` may be omitted when empty. `summary` is plain text. `categories` is an array of category-name strings. These are document-level publishing metadata rather than Micro.blog credentials or remote state, so they remain portable with the document.

Each page records stable application identity, display position, original filename, SHA-256 digest, dimensions, media type and page-specific metadata. Handwritten pages can carry annotations. Standalone photo pages carry their own photo-page metadata such as alt text.

Photo assets record a stable asset ID, original filename, media type, SHA-256 digest and dimensions. Annotation bindings refer to those stable IDs.

## Page kinds

Version 2 supports two logical page kinds:

- **handwritten page** — a PNG exported/rendered from a handwriting device; may contain normalized link and photo annotations;
- **standalone photo page** — JPEG, PNG or WebP occupying its own position in the ordered document sequence.

Version 1 predates that page-kind distinction. It contains handwritten PNG pages only, without the mixed-media `kind` model or photo-asset collection. Handwritten Publish upgrades valid version-1 documents to the current in-memory model when importing them.

## Coordinates

Annotations use normalized coordinates where `x`, `y`, `width`, and `height` are numbers from `0` to `1`, measured against the source page dimensions. This keeps hyperlink and photograph overlays aligned at any responsive display size.

A link annotation stores its destination URL and optional label. A photo annotation stores an asset ID plus optional alt text. The original handwritten page image is not modified to bake those annotations in.

## Integrity

Source page files and photo assets are identified by SHA-256 digests in the manifest. Import verifies file content against those recorded hashes before accepting the bundle.

Publishing derivatives are not part of the portable source format. For example, a temporary recompressed JPEG produced to satisfy a remote media-size limit does not replace the original asset or its digest in `.hwpublish`.

## Compatibility principles

- Version 1 is the legacy PNG-only schema; its existing fields must not silently change meaning.
- Version 2 is the current mixed-media schema and should be used by new producers.
- Backward-compatible optional document metadata may be added within version 2; incompatible schema changes require a new version.
- Archive entry naming follows the deterministic convention documented above.
- Unknown manifest fields should be ignored by readers where possible.
- Future schema changes that cannot be represented compatibly should use a new format version rather than redefining an existing one.
- Source page images and original photo assets are canonical. Summaries, categories, transcripts, annotations and publishing state enrich them; they do not replace them.
- A document `id` is stable across edits and republishes.
- Page and asset SHA-256 digests identify source content independently of remote publishing URLs.
- Publisher-specific state may be recorded as metadata but must not make the core document dependent on one destination.
