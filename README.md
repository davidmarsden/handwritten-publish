# Helping Hand

Helping Hand is a family of small, human-first publishing tools for getting material from paper, tablets and local files onto the web with as little machinery in the way as possible.

## v1.0.0

Helping Hand v1.0.0 is the first complete release of the suite. It now does four distinct jobs:

- **Writing Hand** — reMarkable → Micro.blog. *From paper to web at the push of a pen.* Send edited transcription, original handwritten pages, or both by email. Posts are drafts by default unless `Status: published` is explicitly supplied.
- **Publish Hand** — handwriting, scans, PDFs and photos → a web-ready Micro.blog post. Arrange mixed pages, add links and metadata, keep portable `.handpub` documents, and safely create/update tracked posts.
- **BUM Hand** — **Batch Uploader for Micro.blog**. Use one mixed-file chooser for JPEG/PNG/WebP, MP3/M4A and PDF; upload batches without creating posts; optimise larger photos; optionally add photos directly to Micro.blog Photo Collections; and copy canonical URLs, Markdown or HTML.
- **Markdown Hand** — prepared `.md` → Micro.blog. *Your Markdown. Hands off.* Send raw Markdown directly through Micropub as a draft or published post, then fetch the stored source back and verify that it survived exactly.

The deployed root route `/` is the **Helping Hand** launcher. The tools share publishing infrastructure but keep separate product boundaries.

See [`docs/helping-hand.md`](docs/helping-hand.md) for the suite architecture, [`docs/bum-hand.md`](docs/bum-hand.md) for the mixed-media uploader, and [`docs/STATUS.md`](docs/STATUS.md) for the current release boundary.

## Set up your own copy

The project is open source and designed to work as a personal, self-hosted tool. Fork or clone the repository, deploy your own copy to Netlify, and connect your own Micro.blog account. Writing Hand additionally uses Resend inbound email and a dedicated server-side Micro.blog token.

**[Read the complete self-hosted setup guide →](docs/setup.md)**

## Publish Hand

Publish Hand is local-first. Handwritten page images remain canonical; transcripts, links, photographs and publishing metadata enrich them rather than replace them.

It can:

- import ordered reMarkable PNG pages and browser-rendered PDFs;
- mix handwritten pages with standalone JPEG, PNG and WebP photographs;
- reorder mixed pages with touch/mouse drag controls or arrow fallbacks;
- keep a working document locally in IndexedDB;
- export and re-import portable `.handpub` bundles with SHA-256 integrity checks;
- add transcripts, summaries, categories and clickable link/photo annotations;
- create private Micro.blog drafts through Micropub;
- update tracked drafts without re-uploading unchanged media;
- safely update an already-published tracked post after explicit confirmation;
- recover the canonical public URL when Micro.blog replaces the original private-draft URL;
- optimise oversized photo derivatives while retaining untouched local originals.

## Writing Hand

Writing Hand turns reMarkable's Send by email workflow into a direct publishing path. It cleans reMarkable boilerplate, accepts transcription and/or original PNG pages, and supports leading metadata such as:

```text
Title: Optional title
Categories: reMarkable, notes
Status: draft
```

Draft is the safe default. `Status: published` must be explicit to publish immediately. Recipient routing, webhook verification and idempotency are handled server-side in the user's own deployment.

## BUM Hand

BUM Hand uses one mixed-media queue rather than separate uploaders.

- **Images:** JPEG, PNG and WebP, with local optimisation for larger files and optional direct Photo Collection assignment.
- **Audio:** MP3 and M4A, streamed through a same-origin Netlify Edge proxy to Micro.blog.
- **Documents:** PDF, using the same streamed route and preserving useful file/link semantics.
- **Mixed batches:** any supported combination can be selected together and uploaded in one run.
- **Results:** canonical URLs plus type-appropriate Markdown and HTML; audio also gets browser playback.

Android/Google Photos selections are eagerly staged into browser-owned files immediately after selection so later items in a batch remain readable.

## Markdown Hand

Markdown Hand exists to avoid rewriting carefully prepared Markdown in a web editor.

- choose a local `.md` file on desktop or tablet;
- choose the Micro.blog destination;
- optionally supply title, summary and comma-separated categories as Micropub metadata;
- create a draft by default, or explicitly confirm immediate publication;
- send the file contents as raw Micropub `content` without HTML conversion;
- fetch the created post back with `q=source` and report **Markdown preserved exactly ✓** when it matches.

The app deliberately has no Markdown editor. The source file remains the source of truth.

## Portable `.handpub` documents

A `.handpub` file is an ordinary ZIP archive containing a versioned manifest, page images, optional transcript and original photo assets. The format is deliberately inspectable: if the application disappeared, the original handwritten pages would still be ordinary files.

See [`docs/format.md`](docs/format.md) for compatibility rules.

## Architecture and privacy

Most document work happens in the browser. Local files and document state remain local until the user explicitly publishes or uploads.

Micro.blog browser tokens are passed per request and are not stored in IndexedDB, `.handpub` files or Netlify configuration. Writing Hand's unattended email workflow is a separate opt-in boundary using dedicated credentials in the user's own deployment.

Netlify Functions handle the small Micropub bridges. Streamed audio/PDF uploads use a same-origin Netlify Edge Function so large media does not have to fit through the buffered photo bridge.

See [`docs/architecture.md`](docs/architecture.md), [`docs/helping-hand.md`](docs/helping-hand.md) and [`docs/STATUS.md`](docs/STATUS.md).

## Development

Requires a current Node.js/npm environment.

```bash
npm install
npm test
npm run build
npm run dev
```

Vite uses multiple entrypoints: the Helping Hand launcher is built from `index.html`, Publish Hand from `publish/index.html`, and the static Writing Hand/BUM Hand/Markdown Hand/setup/roadmap surfaces live under `public/`. Shared browser publishing primitives live in `packages/publishing-core/`, with Netlify Functions and Edge Functions under `netlify/`.

## Roadmap after v1.0

The core suite is feature-complete for its current use. Remaining ideas stay on the roadmap, but there is no release calendar: they should be implemented only when real use creates a need.

Possible future work includes assisted transcription/accessibility metadata, richer revision/history, additional supported BUM Hand file types or outputs, PDF attachments through Writing Hand, deeper tablet integrations, video if Micro.blog's API and a real use case justify it, and destination-neutral publishing adapters.

The core rule remains: new features should remove repetitive publishing work without turning Helping Hand into another CMS.

## Inspiration and acknowledgements

The browser publisher was partly inspired by handwritten.blog and its appealing idea that handwritten pages can be first-class web publishing content. No handwritten.blog source code is included or known to have been copied into this repository.

Micro.blog integration uses its Micropub and media APIs. reMarkable is a source of exported page images and email/transcription input; this project is not affiliated with or endorsed by reMarkable, Micro.blog or handwritten.blog.

Third-party npm packages remain subject to their respective licences.

## Licence

Helping Hand and its tools are released under the [MIT License](LICENSE).
