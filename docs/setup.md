# Set up your own Handwritten Publish

Handwritten Publish is designed to be useful as a personal, self-hosted publishing tool. You do not need an account on somebody else's Handwritten Publish installation: fork or clone the repository, deploy your own copy, and connect it to your own Micro.blog and Resend accounts.

The browser app works without post-by-email. The email workflow is optional, but it is the part that gives reMarkable the direct **write → send → Micro.blog** path. Email posts are drafts by default; an explicit `Status: published` metadata line can publish immediately.

## What you need

For the browser app:

- a GitHub account;
- a Netlify account;
- a Micro.blog account if you want to publish from the app.

For post-by-email as well:

- a Resend account with inbound email enabled;
- a private incoming email address;
- a dedicated Micro.blog app token for unattended email publishing;
- Netlify Database, which Netlify provisions automatically when this repository is deployed.

A reMarkable tablet is the workflow this feature was built around, but the browser app itself can import compatible page images without one.

## 1. Fork or clone the repository

Fork this repository on GitHub if you want your own copy that can receive future upstream changes, or clone it directly for local development.

```bash
git clone https://github.com/davidmarsden/handwritten-publish.git
cd handwritten-publish
npm install
npm test
npm run build
```

For local browser development:

```bash
npm run dev
```

The application is a Vite/React app. The production build is written to `dist/` and the server-side bridges live in `netlify/functions/`.

## 2. Deploy to Netlify

Create a new Netlify project from your GitHub fork/repository.

Use:

- **Build command:** `npm run build`
- **Publish directory:** `dist`

Netlify recognises functions in `netlify/functions/`.

The repository also contains a Netlify Database migration under `netlify/database/migrations/`. Netlify Database automatically provisions the database and applies the migration during deployment. The database is used only by post-by-email to make webhook retries and interrupted jobs safe.

If you are only using the browser app, you can leave the post-by-email environment variables unset. The email endpoint will remain disabled.

## 3. Connect Micro.blog in the browser

The normal browser publishing workflow asks for a Micro.blog app token when you publish. That token is kept in browser memory; it is not written into IndexedDB, `.hwpublish` files or Netlify environment variables.

Micro.blog app tokens can be created under **Account → App tokens / Edit Apps**.

If you have more than one Micro.blog-hosted blog, Handwritten Publish uses Micro.blog's Micropub destinations to choose the target blog.

New posts created by the browser workflow are private drafts.

## 4. Enable post-by-email (optional)

Post-by-email uses a different security model because it runs unattended. It therefore uses a dedicated server-side Micro.blog token rather than the temporary browser token.

The flow is:

```text
reMarkable
  ↓ Send by email
private Resend address
  ↓ email.received webhook
Netlify Function
  ↓
Micro.blog draft by default
  or live post when Status: published is explicit
```

The safe default is always `draft`. Live publication requires an explicit `Status: published` line in the leading transcription metadata block.

### Create a private receiving address in Resend

Enable inbound email in Resend. For the simplest setup, Resend provides an address on a Resend-managed inbound domain in the form:

```text
<anything>@<id>.resend.app
```

Choose an address that is recognisable to you but contains a high-entropy private component, for example:

```text
blog-f7c2a91d@<id>.resend.app
```

Treat this address like a password. Anyone who knows it can create a post in the Micro.blog destination mapped to it and, if they know the metadata syntax, could explicitly request live publication.

You can later use your own receiving domain/subdomain if you prefer; the Handwritten Publish side only requires the exact recipient address to match its configured route.

### Create a dedicated Micro.blog token

In Micro.blog, create a separate app token for post-by-email rather than reusing a general-purpose token. This makes the unattended credential easy to revoke independently.

Add it to Netlify as:

```text
MICROBLOG_EMAIL_TOKEN
```

### Add the Resend API key

Create a Resend API key that can read received email bodies and attachments, then add it to Netlify as:

```text
RESEND_API_KEY
```

### Configure the posting route

For one or more destinations, add `POST_BY_EMAIL_ROUTES` to Netlify. Its value is a JSON object mapping each exact private email address to the corresponding Micro.blog Micropub destination UID/blog URL.

Example:

```json
{
  "blog-f7c2a91d@abc123.resend.app": "https://example.micro.blog/"
}
```

For several blogs:

```json
{
  "personal-f7c2a91d@abc123.resend.app": "https://personal.example/",
  "project-82d4b610@abc123.resend.app": "https://project.example/"
}
```

Micro.blog returns destination UIDs from its Micropub configuration endpoint. They are normally blog URLs.

`POST_BY_EMAIL_ROUTES` is authoritative when present and deliberately fails closed if the JSON is malformed.

Older single-destination installations can instead use:

```text
POST_BY_EMAIL_ADDRESS
MICROBLOG_EMAIL_DESTINATION
```

Do not set both approaches unless you understand the precedence rules; `POST_BY_EMAIL_ROUTES` wins whenever it is non-empty.

## 5. Create the Resend webhook

Once the Netlify deployment and environment variables are ready, create a Resend webhook for the `email.received` event.

Use this endpoint:

```text
https://YOUR-SITE.example/api/post-by-email
```

Resend gives the webhook a signing secret. Add that secret to Netlify as:

```text
RESEND_WEBHOOK_SECRET
```

Then redeploy so the function receives the final configuration.

Do not register a live webhook before the deployment and route configuration are ready.

## 6. Test from reMarkable

On reMarkable, save your private incoming address as a recipient and send a small notebook/page.

Handwritten Publish currently supports:

- transcription only;
- original pages as PNG;
- transcription plus PNG pages.

For original handwritten pages, choose **PNG** rather than PDF or SVG.

A normal send should create a **private draft** in the configured Micro.blog destination. Test that first before trying live publication.

## Titles, categories and status from handwriting

A transcription can begin with a small metadata block:

```text
Title: A proper long-post title
Categories: Notes, reMarkable
Status: published

This is the post itself.
```

All three fields are optional. Without `Title:`, transcription posts remain untitled. Without `Status:`, the post is a draft.

`Status:` accepts exactly `draft` or `published`, case-insensitively:

```text
Status: draft
```

keeps the post private, while:

```text
Status: published
```

publishes it immediately.

Unknown or misspelled status values are left in the post body and the post stays a draft. That fail-safe is intentional: a typo should never accidentally publish something.

You can also use a leading line of hashtags as category shorthand:

```text
#Notes #reMarkable

This is the post itself.
```

Only categories that already exist on the selected Micro.blog destination are applied. Ordinary hashtags later in the post remain part of the post.

reMarkable notebook/page tags are not included in Send by email messages, so they cannot currently be mapped automatically.

## Environment-variable reference

| Variable | Required for browser app | Required for post-by-email | Purpose |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | No | Yes | Fetch received email content and attachment URLs from Resend |
| `RESEND_WEBHOOK_SECRET` | No | Yes | Verify signed Resend webhooks |
| `MICROBLOG_EMAIL_TOKEN` | No | Yes | Dedicated Micro.blog token for unattended email publishing |
| `POST_BY_EMAIL_ROUTES` | No | Recommended | JSON map of private receiving addresses to Micro.blog destinations |
| `POST_BY_EMAIL_ADDRESS` | No | Legacy single-route only | Exact private receiving address |
| `MICROBLOG_EMAIL_DESTINATION` | No | Legacy single-route only | Micro.blog destination for the legacy single route |

## Security notes

- Keep private posting addresses private.
- Treat each posting address as a publishing credential, because explicit metadata can request live publication.
- Use a dedicated Micro.blog token for email publishing so it can be revoked independently.
- Do not put tokens into the repository or `.hwpublish` files.
- The Resend webhook is rejected unless its signature verifies.
- Email sent to an unknown route is ignored.
- A message addressed to configured aliases for more than one destination is ignored rather than guessed.
- Missing status always means draft; only explicit `Status: published` requests live publication.

## Troubleshooting

### `503 Post by email is not configured`

At least one required environment variable or valid posting route is missing. Check `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MICROBLOG_EMAIL_TOKEN`, and `POST_BY_EMAIL_ROUTES`.

### The webhook is accepted but no post appears

Check that the exact recipient in Resend matches a key in `POST_BY_EMAIL_ROUTES`, including the full domain. Also confirm that the destination value is the correct Micro.blog Micropub destination UID.

### `Status: published` appears in the post instead of publishing

The value must be exactly `published` (case-insensitively) and must appear in the leading metadata block before the ordinary post body. Unknown values deliberately remain body text and default to draft.

### Transcription works but pages do not

Send original reMarkable pages as **PNG**. PDF email attachments are not yet supported by the server-side email path.

### Categories are missing

The requested categories must already exist in the selected Micro.blog destination. Matching is case-insensitive, but unknown categories are ignored rather than created.

### A webhook is retried

That is safe. Post-by-email records the Resend email ID in Netlify Database and reconciles stale/interrupted jobs before creating a replacement post.

## More detail

- [`post-by-email.md`](post-by-email.md) — implementation, security model and email behaviour
- [`architecture.md`](architecture.md) — overall architecture and privacy boundaries
- [`format.md`](format.md) — portable `.hwpublish` format
- [`metadata.md`](metadata.md) — document metadata
- [`STATUS.md`](STATUS.md) — current implementation status
