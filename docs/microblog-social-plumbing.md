# Dent Hand: social provider plumbing

Dent Hand is the deliberately small social layer in the Helping Hand family. It is **not** another long-form publishing surface and it does not replace the dedicated Top 100, Southall Stories or Helping Hand publishing workflows.

The live surface is `/social/` and the installed web-app identity is **Dent Hand / dent.hand**.

Dent Hand now has two authenticated providers:

- Micro.blog;
- Mastodon-compatible servers.

The providers share a product surface and provider contract, but keep their authentication, upstream APIs and capabilities separate.

## Product boundary

The useful loop is:

1. choose the account/network that should power the current timeline;
2. read a chronological home timeline;
3. reply and use the interactions the chosen provider supports;
4. browse or open profiles;
5. keep a local Dent Hand Circle independent of either network;
6. write a short post/status without turning Dent Hand into a long-form editor;
7. keep social interaction separate from proper writing and publishing.

Proper writing remains in the existing publishing/editorial tools.

## Provider abstraction

`src/socialProvider.ts` defines the boundary between Dent Hand's product UI and network-specific clients. Capabilities are explicit so a provider does not have to pretend to implement another network's API.

Current providers:

- `src/microblogSocial.ts` — Micro.blog account, timeline, conversations, bookmarks, replies, profiles, own posts/destinations and micropost publishing;
- `src/mastodonSocial.ts` — Mastodon-compatible authenticated account, chronological home timeline, replies, favourites, bookmarks, boosts and new-status publishing.

The local Circle is intentionally outside either provider. Switching network does not make Circle membership a server-side follow/list feature.

## Micro.blog authentication and privacy

Dent Hand uses Micro.blog's OAuth / IndieAuth authorization-code flow. The browser redirects to Micro.blog for approval and receives only an opaque Dent Hand session cookie after the callback. The Micro.blog access token is encrypted server-side and is never exposed to browser JavaScript.

Dent Hand requests the scopes its Micro.blog surface actually needs:

```text
profile read create update
```

`read` is required for timeline and other social reads; `profile` supports account/profile access; `create` covers posting and replies; `update` covers mutable social actions such as bookmarks. If scopes change, the user must sign out and sign back in so Micro.blog can issue a new token.

`/account/verify` is used to identify the signed-in account. If Micro.blog returns a replacement token during verification, Dent Hand persists that replacement into the same encrypted server-side session before subsequent social calls use it.

## Mastodon / compatible-server authentication and privacy

Mastodon sign-in is instance-aware. The user supplies the public HTTPS server where their account lives; Dent Hand then registers or reuses an OAuth application for that server and the current Dent Hand callback origin.

The OAuth client secret is never embedded in browser JavaScript. Dent Hand stores Mastodon application secrets and user access tokens encrypted server-side using the same `DENT_HAND_SESSION_SECRET` encryption boundary used for authenticated social sessions. Browser JavaScript receives only an opaque `HttpOnly` session cookie.

The authenticated Mastodon provider requests:

```text
read write
```

The current write layer covers replies, favourites, bookmarks, boosts and new statuses.

Because the server name is user-controlled input, Dent Hand treats outbound instance access as an SSRF boundary:

- only public HTTPS hostnames are accepted;
- direct IPs, localhost/private-style names, ports, credentials, paths, query strings and fragments are rejected during normalization;
- IPv4/IPv6 DNS results are checked for private/reserved address ranges;
- HTTPS connects directly to the already-validated public IP while preserving the intended hostname in the HTTP `Host` header and TLS `servername`;
- upstream redirects are not followed automatically.

That pinning avoids a second DNS resolution between validation and connection, reducing DNS-rebinding risk.

ActivityPub federation alone is not enough to call a server Dent Hand-compatible. The authenticated provider depends on a Mastodon-compatible client API. Other Fediverse software should be tested by capability instead of being assumed compatible because it federates.

## Shared session configuration

Every Dent Hand deployment that enables authenticated social providers must set a high-entropy `DENT_HAND_SESSION_SECRET` of at least 32 characters in the Netlify environment, scoped to Functions/runtime. Do not commit it to the repository.

For example, generate a secret locally with:

```bash
openssl rand -base64 48
```

Then add the generated value to Netlify as:

```text
DENT_HAND_SESSION_SECRET
```

After adding or rotating the secret, redeploy the site. Rotating it invalidates the ability to decrypt existing Dent Hand sessions and stored Mastodon OAuth application secrets, so users may need to reconnect.

The production `hand.davidmarsden.info` deployment already has this variable configured. Forks and fresh/self-hosted deployments must supply their own value.

Session cookies are `HttpOnly`, `SameSite=Lax` and `Secure` on HTTPS deployments. Session rows live in Netlify Database.

## Micro.blog bridge operations

The Micro.blog social function remains an allow-listed bridge, not an arbitrary proxy. Known operations include:

- `GET timeline` → `/posts/timeline`
- `GET bookmarks` → `/posts/bookmarks`
- `GET mentions` → `/posts/mentions` where Micro.blog supports it reliably
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

## Mastodon bridge operations

The Mastodon bridge is also allow-listed and always resolves the authenticated session server-side. Current operations include:

- `GET account` → `/api/v1/accounts/verify_credentials`
- `GET timeline` → `/api/v1/timelines/home`
- `POST reply` → `/api/v1/statuses` with `in_reply_to_id`
- `POST favourite` / `POST unfavourite` → `/api/v1/statuses/:id/favourite` and `/unfavourite`
- `POST bookmark` / `POST unbookmark` → `/api/v1/statuses/:id/bookmark` and `/unbookmark`
- `POST boost` / `POST unboost` → `/api/v1/statuses/:id/reblog` and `/unreblog`
- `POST publish` → `/api/v1/statuses`

Mastodon IDs are treated as opaque strings because compatible servers are not required to use stock Mastodon's numeric-ID shape.

Normalized timeline items preserve remote action state such as `favourited`, `bookmarked` and `reblogged`, as well as the visible status id for boosted posts so actions apply to the status the user sees rather than the wrapper event.

## Public Mastodon compatibility

Dent Hand's earlier public Mastodon adapter remains useful even when the active provider is Micro.blog. When a Micro.blog timeline item points to a Mastodon profile, Dent Hand can resolve and display fuller public profile/status history from that account's home server.

Those public statuses are marked as remote/read-only in Micro.blog mode so Dent Hand does not accidentally send a Mastodon id to a Micro.blog action endpoint. Media attachments are normalized alongside status content, and remote ids are namespaced locally to avoid collisions.

## Product surface

Dent Hand's current surface includes:

- `/social/` — network chooser plus the active provider's main client surface;
- `/social/my-posts/` — signed-in Micro.blog user's own posts;
- secure Micro.blog OAuth / IndieAuth;
- secure Mastodon-compatible instance OAuth;
- chronological timelines;
- local Circle membership;
- Micro.blog conversations, replies, bookmarks, profiles and short-form posting;
- Mastodon replies, favourites, bookmarks, boosts, profile links and new-status posting;
- `public/dent-hand.webmanifest` — installable app metadata;
- `public/dent-hand-icon.svg` and Dent Hand brand assets — app identity;
- `public/dent-hand-sw.js` — lightweight app-shell caching.

## Diagnostics and failure handling

For feed-style Micro.blog social requests routed through the shared `upstream()` helper, upstream failures include the HTTP status in Dent Hand's user-facing error and server logs retain safe request-path/status metadata. Tokens, authorization headers and request bodies are not logged.

Mastodon bridge errors are similarly surfaced without exposing stored credentials. A token created under an older read-only Mastodon OAuth registration cannot silently gain write access; reconnecting through the newer scope-versioned app registration is required.

The temporary `/api/microblog/diagnostics` endpoint was added while tracing the Micro.blog OAuth 403. Its purpose remains narrow and it should be removed once no longer useful for diagnosis.

## Next layers

Further work should stay need-driven and keep the client deliberately small. Useful additions may include:

- better paging/history;
- interaction-state polish and more deliberate optimistic updates;
- lightweight caching where it solves real friction;
- testing/documenting additional Mastodon-compatible servers;
- capability detection where compatible servers differ;
- additional authenticated providers only where a usable client API exists and the workflow justifies it.

Micro.blog mentions should remain optional/degraded until the relevant endpoint is reliable enough to depend on.

The intended outcome remains a social reader/responding client first, with short-form publishing as a secondary action rather than a reason to recreate the full Micro.blog or Mastodon web apps.
