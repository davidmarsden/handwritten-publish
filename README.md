# Handwritten Publish

Handwritten Publish is a local-first web app for turning handwritten page images into portable, publishable documents without turning the handwriting itself into disposable input.

The page image remains canonical. Transcripts, links, photographs and publishing metadata enrich it rather than replace it.

## Set up your own copy

Handwritten Publish is open source and designed to work well as a personal, self-hosted tool. Fork or clone the repository, deploy your own copy to Netlify, and connect it to your own Micro.blog and Resend accounts.

**[Read the complete self-hosted setup guide →](docs/setup.md)**

The browser app works without post-by-email. The optional email workflow adds the direct reMarkable **write → send → private Micro.blog draft** path.

## v0.1.0

This is the first genuinely usable release.

Handwritten Publish can:

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

See [`docs/architecture.md`](docs/architecture.md) and [`docs/STATUS.md`](docs/STATUS.md).

## Development

Requires a current Node.js/npm environment.

```bash
npm install
npm test
npm run build
npm run dev
```

The production app is a Vite build with Netlify Functions under `netlify/functions/`.

## Roadmap

The next major directions are:

1. handwritten.blog publishing support;
2. assisted transcription and accessibility metadata;
3. richer revision/history support;
4. safer direct tablet input/send integrations where platform APIs permit them.

The destination-neutral document model is intentional: publisher integrations should adapt a `HandwrittenDocument`, not reshape the core format around one service.

## Inspiration and acknowledgements

Handwritten Publish was partly inspired by [handwritten.blog](https://handwritten.blog/) and its simple, appealing idea that handwritten pages can be first-class web publishing content. The ordered mixed handwritten/photo workflow was also informed by looking at that product experience.

No handwritten.blog source code is included or known to have been copied into this repository. The current Handwritten Publish implementation, document format and Micro.blog integration were developed independently. handwritten.blog remains a planned future publishing destination rather than a code dependency.

Micro.blog integration uses its Micropub and media APIs. reMarkable is a source of exported page images; this project is not affiliated with or endorsed by reMarkable, Micro.blog or handwritten.blog.

Third-party npm packages remain subject to their respective licences.

## Licence

Handwritten Publish is released under the [MIT License](LICENSE).
