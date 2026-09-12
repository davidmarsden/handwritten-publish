# Dent Hand: Micro.blog social client plumbing

Dent Hand is the deliberately small social layer in the Helping Hand family. It is **not** another long-form publishing surface and it does not replace the dedicated Top 100, Southall Stories or Helping Hand publishing workflows.

The live surface is `/social/` and the installed web-app identity is **Dent Hand / dent.hand**.

## Product boundary

The useful loop is:

1. read the signed-in timeline;
2. open a conversation;
3. reply or bookmark;
4. browse bookmarks, the user's own posts/replies, or another user's timeline;
5. keep short social interaction separate from proper writing and publishing.

Proper writing remains in the existing publishing/editorial tools.

## Authentication and privacy

The browser supplies the user's Micro.blog app token with each request. The token is forwarded in the `Authorization: Bearer …` header and is not stored in Netlify configuration, IndexedDB or source files.

The Netlify function is an allow-listed bridge, not an arbitrary proxy. Only known Micro.blog social operations are accepted, and ids / usernames are validated before an upstream request is made.

## Implemented bridge operations

- `GET timeline` → `/posts/timeline`
- `GET bookmarks` → `/posts/bookmarks`
- `GET replies` → `/posts/replies`
- `GET conversation` → `/posts/conversation?id=…`
- `GET profile` → `/posts/[username]`
- `POST bookmark` → `/posts/bookmarks`
- `DELETE unbookmark` → `/posts/bookmarks/[id]`
- `POST reply` → `/posts/reply`

Timeline-style calls support `count`, `before_id` and `since_id` for paging.

## Typed browser client

`src/microblogSocial.ts` wraps the bridge so UI code never assembles Micro.blog API routes directly. The client exposes:

- `timeline()`
- `conversation(id)`
- `bookmarks()`
- `bookmark(id)` / `unbookmark(id)`
- `replies()`
- `reply(id, content)`
- `profile(username)`

## Product surface

Dent Hand now has a real UI rather than being plumbing for a hypothetical future client:

- `/social/` — the main Dent Hand timeline/client surface;
- `/social/my-posts/` — the signed-in user's own posts;
- `public/dent-hand.webmanifest` — installable app metadata;
- `public/dent-hand-icon.svg` and the Dent Hand brand assets — app identity;
- `public/dent-hand-sw.js` — lightweight app-shell caching.

## Next layers

Further work should stay need-driven and keep the client deliberately small. Useful additions may include better paging/history, guarded short-form posting with an explicit destination blog, quote/embed helpers, optimistic interaction state and lightweight caching where they solve real friction.

Mentions should remain optional/degraded until the relevant Micro.blog endpoint is reliable enough to depend on.

The intended outcome remains a social reader/responding client first, with publishing as a secondary action rather than a reason to recreate the full Micro.blog web app.
