# Helping Hand

Helping Hand is a family of small, human-first publishing tools for getting material from paper, tablets and local files onto the web with as little machinery in the way as possible.

The suite is being separated into three focused tools:

- **Writing Hand** — reMarkable → Micro.blog. *From paper to web at the push of a pen.*
- **Publish Hand** — handwriting, images and documents → web. This is the current browser publishing app.
- **BUM Hand** — **Batch Uploader for Micro.blog**, designed to grow beyond photos to other supported media/files.

The tools share publishing infrastructure but have separate product boundaries. See [`docs/helping-hand.md`](docs/helping-hand.md) for the architecture and extraction plan.

> **Migration note:** the repository and deployed browser app still use the existing Handwritten Publish layout while the suite is split safely. This first restructuring step is additive and does not change production paths or behavior.

## Publish Hand / current browser app

The current browser application is a local-first web app for turning handwritten page images into portable, publishable documents without turning the handwriting itself into disposable input.

The page image remains canonical. Transcripts, links, photographs and publishing metadata enrich it rather than replace it.

## Set up your own copy

The project is open source and designed to work well as a personal, self-hosted tool. Fork or clone the repository, deploy your own copy to Netlify, and connect it to your own Micro.blog and Resend accounts.

**[Read the complete self-hosted setup guide →](docs/setup.md)**

The browser app works without post-by-email. The optional email workflow is becoming **Writing Hand** and adds the direct reMarkable **write → send → private Micro.blog draft** path.

## v0.1.0

This is the first genuinely usable release of the browser publisher.

It can:

- import ordered PNG pages exported from reMarkable;
- mix handwritten pages with standalone JPEG, PNG and WebP photo pages;
- reorder pages with touch/mouse drag controls or keyboard-friendly arrows;
- keep a working document locally in IndexedDB;
- export and re-import portable `.hwpublish` bundles with SHA-256 integrity checks;
- add an optional transcript;
- draw clickable link regions over handwriting;
- place original photo assets over handwritten pages with alt text;
- create private Micro.blog drafts through Micropub;
- update tracked Micro.blog drafts without re-uploading unchanged media;
- safely update an already-published tracked Micro.blog post after explicit confirmation;
- recover the canonical public URL when Micro.blog has replaced the original private-draft URL;
- optimise oversized photo derivatives for Micro.blog while retaining untouched originals locally.

New Micro.blog posts are always created as private drafts. Published-post updates are available only for posts already tracked by the document and require explicit confirmation.

## Portable `.hwpublish` documents

A `.hwpublish` file is an ordinary ZIP archive containing a versioned manifest, page images, optional transcript and original photo assets. The format is deliberately boring and inspectable: if this application disappeared, the handwritten pages would still be ordinary image files.

See [`docs/format.md`](docs/format.md) for the format and compatibility rules.

## Architecture and privacy

Most document work happens in the browser. Page files, annotations, photo assets and local draft state remain local unless the user explicitly chooses a publishing operation.

Micro.blog publishing uses small Netlify Functions as request bridges for Micropub configuration, media uploads and post creation/update. Micro.blog app tokens are passed per request and are not stored in IndexedDB, `.hwpublish` files or Netlify configuration.

See [`docs/architecture.md`](docs/architecture.md), [`docs/helping-hand.md`](docs/helping-hand.md) and [`docs/STATUS.md`](docs/STATUS.md).

## Development

Requires a current Node.js/npm environment.

```bash
npm install
npm test
npm run build
npm run dev
```

The production app is currently a Vite build at the repository root with Netlify Functions under `netlify/functions/`. The new `apps/` and `packages/` directories establish product boundaries without moving those production entrypoints yet.

## Near-term roadmap

1. extract **BUM Hand** as the first standalone app using the existing media bridge;
2. extract shared Micro.blog/Micropub primitives into `packages/publishing-core/`;
3. move the browser publisher behind the **Publish Hand** app boundary;
4. give the reMarkable email workflow its own **Writing Hand** setup/identity;
5. replace the root product page with a **Helping Hand** launcher once all three routes are working;
6. continue destination-neutral publishing work, including handwritten.blog and other suitable endpoints.

The destination-neutral document model is intentional: publisher integrations should adapt a `HandwrittenDocument`, not reshape the core format around one service.

## Inspiration and acknowledgements

The browser publisher was partly inspired by [handwritten.blog](https://handwritten.blog/) and its simple, appealing idea that handwritten pages can be first-class web publishing content. The ordered mixed handwritten/photo workflow was also informed by looking at that product experience.

No handwritten.blog source code is included or known to have been copied into this repository. The current implementation, document format and Micro.blog integration were developed independently. handwritten.blog remains a planned future publishing destination rather than a code dependency.

Micro.blog integration uses its Micropub and media APIs. reMarkable is a source of exported page images and email/transcription input; this project is not affiliated with or endorsed by reMarkable, Micro.blog or handwritten.blog.

Third-party npm packages remain subject to their respective licences.

## Licence

Helping Hand and its tools are released under the [MIT License](LICENSE).
