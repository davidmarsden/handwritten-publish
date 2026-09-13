# Helping Hand

Helping Hand is a family of small, human-first publishing tools for getting material from paper, tablets and local files onto the web with as little machinery in the way as possible — plus a deliberately small multi-network social client for the conversational side of Micro.blog and Mastodon-compatible Fediverse servers.

## v1.0.0 and beyond

Helping Hand v1.0.0 was the first complete release of the original four-tool publishing suite. Dent Hand later joined the family as a fifth, post-v1.0 product boundary:

- **Writing Hand** — reMarkable → Micro.blog. *From paper to web at the push of a pen.* Send edited transcription, original handwritten pages, or both by email. Posts are drafts by default unless `Status: published` is explicitly supplied.
- **Publish Hand** — handwriting, scans, PDFs and photos → a web-ready Micro.blog post. Arrange mixed pages, add links and metadata, keep portable `.handpub` documents, and safely create/update tracked posts.
- **BUM Hand** — **Batch Uploader for Micro.blog**. Use one mixed-file chooser for JPEG/PNG/WebP, MP3/M4A and PDF; upload batches without creating posts; optimise larger photos; optionally add photos directly to Micro.blog Photo Collections; and copy canonical URLs, Markdown or HTML.
- **Markdown Hand** — prepared `.md` → private GitHub working draft or Micro.blog. *Your Markdown. Hands off.* Save raw Markdown unchanged to a configured private working-draft repository, or send it through Micropub as a draft or published post and verify the stored source round trip.
- **Dent Hand** — a minimal social client for Micro.blog and Mastodon-compatible Fediverse servers: timelines, replies, profiles, bookmarks/favourites, boosts and short-form posting, with a local Circle that is independent of the connected network. It keeps social reading/responding separate from the longer-form publishing tools.

The deployed root route `/` is the **Helping Hand** launcher. The tools share infrastructure but keep separate product boundaries. Dent Hand lives at `/social/`.

See [`docs/helping-hand.md`](docs/helping-hand.md) for the suite architecture, [`docs/bum-hand.md`](docs/bum-hand.md) for the mixed-media uploader, [`docs/microblog-social-plumbing.md`](docs/microblog-social-plumbing.md) for Dent Hand's social boundary, and [`docs/STATUS.md`](docs/STATUS.md) for the release boundary.

## Set up your own copy

The project is open source and designed to work as a personal, self-hosted tool. Fork or clone the repository, deploy your own copy to Netlify, and connect the destinations you actually use. Micro.blog browser publishing uses your own app token; Writing Hand additionally uses Resend inbound email and a dedicated server-side Micro.blog token; private GitHub working drafts use a narrowly-scoped server-side repository token plus a separate browser write key.

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

- **Images:** JPEG, PNG and WebP, with local optimisation for larger files, destination-aware upload and optional direct Photo Collection assignment.
- **Audio:** MP3 and M4A, streamed through a same-origin Netlify Edge proxy to Micro.blog.
- **Documents:** PDF, using the same streamed route and preserving useful file/link semantics.
- **Destinations:** the selected Micro.blog blog is carried through every supported media upload, including images via `mp-destination`, so multi-blog tokens do not rely on an implicit default.
- **Mixed batches:** any supported combination can be selected together and uploaded in one run.
- **Results:** canonical URLs plus type-appropriate Markdown and HTML; audio also gets browser playback.

Android/Google Photos selections are eagerly staged into browser-owned files immediately after selection so later items in a batch remain readable. The destination-routing path is also regression-tested because multi-blog failures can otherwise be invisible in a single-blog development setup.

## Markdown Hand

Markdown Hand exists to avoid rewriting carefully prepared Markdown in a web editor and has two deliberate destinations.

- choose a local `.md` file on desktop or tablet;
- save it unchanged to a configured private GitHub working-draft repository, where a research/review workflow can pick it up;
- saving the same filename again updates the existing private draft rather than creating a duplicate;
- keep the GitHub repository token server-side and authorise browser saves with a separate write key;
- or choose Micro.blog, select the destination blog, and optionally supply title, summary and comma-separated categories as Micropub metadata;
- create a Micro.blog draft by default, or explicitly confirm immediate publication;
- send the file contents as raw Micropub `content` without HTML conversion;
- fetch the created Micro.blog post back with `q=source` and report **Markdown preserved exactly ✓** when it matches.

The app deliberately has no Markdown editor. The source file remains the source of truth whichever destination is chosen.

## Dent Hand

Dent Hand is the social reader/responding client in the family. The live surface is `/social/`.

It is deliberately smaller than a general-purpose social dashboard. The focus is on the social loop: read chronological timelines, reply, browse profiles, keep a local Circle and use the actions each connected provider actually supports. Micro.blog adds conversations, bookmarks, replies, own-post browsing and destination-aware microposting. Mastodon-compatible servers add favourites, bookmarks, boosts, replies and short-form publishing.

Dent Hand uses a provider boundary rather than baking one network into the UI. Micro.blog signs in through OAuth / IndieAuth. Mastodon-compatible servers use instance-aware OAuth. In both cases reusable access credentials stay encrypted server-side and browser JavaScript receives only an opaque `HttpOnly` session cookie. Mastodon client secrets are also kept server-side. The social bridges are allow-listed rather than arbitrary upstream proxies, and Mastodon instance connections are restricted to validated public hosts with DNS/IP pinning protections.

ActivityPub federation by itself does not guarantee Dent Hand compatibility: a server also needs a compatible client API. See [`docs/microblog-social-plumbing.md`](docs/microblog-social-plumbing.md) for the current provider and security boundary.

## Portable `.handpub` documents

A `.handpub` file is an ordinary ZIP archive containing a versioned manifest, page images, optional transcript and original photo assets. The format is deliberately inspectable: if the application disappeared, the original handwritten pages would still be ordinary files.

See [`docs/format.md`](docs/format.md) for compatibility rules.

## Architecture and privacy

Most document work happens in the browser. Local files and document state remain local until the user explicitly publishes, uploads or saves a private working draft.

Browser publishing tokens used by Publish Hand, BUM Hand and Markdown Hand remain separate from Dent Hand's authentication model and are not stored in `.handpub` files. Writing Hand's unattended email workflow is a separate opt-in boundary using dedicated credentials in the user's own deployment. Private GitHub draft routing is another explicit boundary: the repository token stays server-side and the browser receives only the separate write-key interface. Dent Hand keeps its Micro.blog and Mastodon-compatible provider credentials encrypted server-side and routes only allow-listed social operations; the browser gets an opaque `HttpOnly` session cookie rather than a reusable bearer token.

Netlify Functions handle the small Micropub, GitHub and social bridges. Buffered image uploads carry the selected Micro.blog destination through to the upstream media request. Streamed audio/PDF uploads use a same-origin Netlify Edge Function and carry the same destination, so large media does not have to fit through the buffered photo bridge and all BUM Hand media types target the chosen blog consistently.

See [`docs/architecture.md`](docs/architecture.md), [`docs/helping-hand.md`](docs/helping-hand.md) and [`docs/STATUS.md`](docs/STATUS.md).

## Development

Requires a current Node.js/npm environment.

```bash
npm install
npm test
npm run build
npm run dev
```

Vite uses multiple entrypoints: the Helping Hand launcher is built from `index.html`, Publish Hand from `publish/index.html`, and Dent Hand from `social/index.html` plus `social/my-posts/index.html`. The static Writing Hand/BUM Hand/Markdown Hand/setup/roadmap surfaces live under `public/`. Shared browser publishing primitives live in `packages/publishing-core/`, with Netlify Functions and Edge Functions under `netlify/`.

## Roadmap after v1.0

The original publishing suite is feature-complete for its current use. Later additions such as Dent Hand still follow the same rule: implement them when real use creates a need, not to fill a release calendar.

Possible future work includes assisted transcription/accessibility metadata, richer revision/history, PDF attachments through Writing Hand, additional supported BUM Hand file types or outputs, deeper tablet integrations, video if Micro.blog's API and a real use case justify it, optional encrypted Micro.blog Notes creation/notebook selection, Dent Hand paging/state polish, compatibility testing and capability detection across Mastodon-compatible servers, additional social providers only where a real use case justifies them, and other destination-neutral publishing adapters where there is a genuine workflow.

Reliability work remains part of the roadmap even when it is not a new feature: real-device file-provider bugs, destination-routing regressions, API changes and browser quirks take priority over speculative additions.

The core rule remains: new features should remove repetitive publishing or interaction work without turning Helping Hand into another CMS or a bloated social dashboard.

## Inspiration and acknowledgements

The browser publisher was partly inspired by handwritten.blog and its appealing idea that handwritten pages can be first-class web publishing content. No handwritten.blog source code is included or known to have been copied into this repository.

Micro.blog integration uses its Micropub, media and social APIs. reMarkable is a source of exported page images and email/transcription input; this project is not affiliated with or endorsed by reMarkable, Micro.blog or handwritten.blog.

Third-party npm packages remain subject to their respective licences.

## Licence

Helping Hand and its tools are released under the [MIT License](LICENSE).
