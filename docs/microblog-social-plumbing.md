# Dent Hand: Micro.blog social client plumbing

Dent Hand is the deliberately small social layer in the Helping Hand family. It is **not** another long-form publishing surface and it does not replace the dedicated Top 100, Southall Stories or Helping Hand publishing workflows.

The live surface is `/social/` and the installed web-app identity is **Dent Hand / dent.hand**.

## Product boundary

The useful loop is:

1. read the signed-in timeline;
2. open a conversation;
3. reply or bookmark;
4. browse bookmarks, the user's own posts/replies, or another user's timeline;
5. write a short micropost to an explicitly chosen destination blog, including quote-style posts when useful;
6. keep short social interaction separate from proper writing and publishing.

Proper writing remains in the existing publishing/editorial tools.

## Authentication and privacy

Dent Hand uses Micro.blog's OAuth / IndieAuth authorization-code flow. The browser redirects to Micro.blog for approval and receives only an opaque Dent Hand session cookie after the callback. The Micro.blog access token is encrypted server-side and is never exposed to browser JavaScript.

The session cookie is `HttpOnly`, `SameSite=Lax` and `Secure` on HTTPS deployments. Session rows live in Netlify Database and the encrypted token is protected with `DENT_HAND_SESSION_SECRET`.

### Required self-hosted configuration

Every Dent Hand deployment that enables Micro.blog sign-in must set a high-entropy `DENT_HAND_SESSION_SECRET` of at least 32 characters in the Netlify environment, scoped to Functions/runtime. Do not commit it to the repository.

For example, generate a secret locally with:

```bash
openssl rand -base64 48
```

Then add the generated value to Netlify as:

```text
DENT_HAND_SESSION_SECRET
```

After adding or rotating the secret, redeploy the site. Rotating it invalidates the ability to decrypt existing Dent Hand sessions, so users will need to sign in again.

The production `hand.davidmarsden.info` deployment already has this variable configured. Forks and fresh/self-hosted deployments must supply their own value.

The Netlify social function remains an allow-listed bridge, not an arbitrary proxy. Only known Micro.blog social operations are accepted, and ids / usernames / publishing destinations are validated before an upstream request is made.

## Implemented bridge operations

- `GET timeline` → `/posts/timeline`
- `GET bookmarks` → `/posts/bookmarks`
- `GET replies` → `/posts/replies`
- `GET conversation` → `/posts/conversation?id=…`
- `GET profile` → `/posts/[username]`
- `GET account` → the signed-in account resolved from the server session
- `GET destinations` → the signed-in account's Micropub destinations
- `POST bookmark` → `/posts/bookmarks`
- `DELETE unbookmark` → `/posts/bookmarks/[id]`
- `POST reply` → `/posts/reply`
- `POST micropost` → guarded short-form publishing to an explicitly selected destination blog

Timeline-style calls support `count`, `before_id` and `since_id` for paging.

## Typed browser client

`src/microblogSocial.ts` wraps the bridge so UI code never assembles Micro.blog API routes directly. In normal Dent Hand use it authenticates through the secure same-origin session cookie; the optional bearer-token constructor path remains only for compatibility/tests and self-hosted integrations.

The client exposes:

- `timeline()`
- `conversation(id)`
- `bookmarks()`
- `bookmark(id)` / `unbookmark(id)`
- `replies()`
- `reply(id, content)`
- `profile(username)`
- `account()`
- `destinations()`
- `micropost(...)`

On construction the shared client also removes the legacy `microblog-social-token` value from `sessionStorage`, so older Dent Hand tabs migrate away from browser-held bearer tokens regardless of whether the user enters through `/social/` or `/social/my-posts/`.

## Product surface

Dent Hand now has a real UI rather than being plumbing for a hypothetical future client:

- `/social/` — the main Dent Hand timeline/client surface;
- `/social/my-posts/` — the signed-in user's own posts;
- guarded short-form posting that requires an explicit destination blog before publishing;
- quote-style post helpers built by the social UI before submission;
- `public/dent-hand.webmanifest` — installable app metadata;
- `public/dent-hand-icon.svg` and the Dent Hand brand assets — app identity;
- `public/dent-hand-sw.js` — lightweight app-shell caching.

## Next layers

Further work should stay need-driven and keep the client deliberately small. Useful additions may include better paging/history, optimistic interaction state and lightweight caching where they solve real friction.

Mentions should remain optional/degraded until the relevant Micro.blog endpoint is reliable enough to depend on.

The intended outcome remains a social reader/responding client first, with publishing as a secondary action rather than a reason to recreate the full Micro.blog web app.
