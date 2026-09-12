# Micro.blog social client plumbing

This is the deliberately unnamed social layer for a future Micro.blog client. It is **not** another long-form publishing surface and it does not replace the dedicated Top 100 or Southall Stories workflows.

## Product boundary

The first useful loop is:

1. read the signed-in timeline;
2. open a conversation;
3. reply or bookmark;
4. browse bookmarks / the user's own replies / another user's timeline;
5. later, quote or react into a short micropost with an explicit destination blog.

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

## Next plumbing layers

Before visual design or naming:

1. add IndieAuth / token setup UX suitable for a private personal client;
2. add a destination-blog inventory using Micro.blog's Micropub configuration endpoint;
3. add short-form Micropub publishing that **always** sends an explicit destination and never relies on Micro.blog's implicit/default blog;
4. add quote/embed helpers that preserve a link to the original timeline post;
5. add optimistic bookmark state and lightweight timeline caching;
6. treat mentions as optional/degraded until the currently reported `/posts/mentions` reliability issue is confirmed fixed;
7. add the actual `/social/` UI only after the above contracts are stable.

The intended outcome is a social reader/responding client first, with micropost publishing as a guarded secondary action.
