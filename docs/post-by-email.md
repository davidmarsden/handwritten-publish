# Post by email

Post by email is the first native-feeling reMarkable publishing path:

```text
reMarkable
  ↓ Send by email as PNG
private Handwritten Publish address
  ↓ Resend email.received webhook
Handwritten Publish Netlify Function
  ↓ ordered PNG pages
Micro.blog
  ↓
private draft
```

Nothing received through this endpoint is published live. The Micropub payload always sets `post-status` to `draft`.

## Why PNG first

reMarkable can send selected notebook pages by email as PDF, PNG or SVG. PNG is the safest first server-side transport because each selected page arrives as an ordinary image and can use the same image-first publishing model as the browser app. It avoids introducing a second PDF rasterization stack inside Netlify Functions.

PDF email attachments are a planned follow-up. Browser PDF import remains supported independently.

## Receiving provider

The first implementation uses Resend Inbound:

- Resend receives the email and emits an `email.received` webhook.
- The webhook contains attachment metadata, not attachment bytes.
- Handwritten Publish retrieves short-lived attachment download URLs from Resend's Receiving API.
- Each PNG is uploaded directly to the destination Micro.blog media endpoint.
- Handwritten Publish creates a private Micro.blog draft whose title is the email subject.

## Security model

The posting address is a revocable incoming credential.

The server accepts a message only when:

1. the webhook signature verifies against `RESEND_WEBHOOK_SECRET`; and
2. one of the webhook recipients exactly matches `POST_BY_EMAIL_ADDRESS`.

Mail sent to another alias is ignored with a successful webhook response, so rotating the configured posting address immediately makes the old address inert from Handwritten Publish's point of view.

Do not expose the posting address publicly. Anyone who knows it can create a private draft unless a future optional sender restriction is enabled.

## Required server configuration

Post by email is opt-in. The endpoint returns `503 Post by email is not configured` until all of these Netlify environment variables exist:

- `RESEND_API_KEY` — Resend API key with access to received-email attachments.
- `RESEND_WEBHOOK_SECRET` — signing secret for the Resend webhook.
- `POST_BY_EMAIL_ADDRESS` — the exact private recipient address that is allowed to create drafts.
- `MICROBLOG_EMAIL_TOKEN` — revocable Micro.blog app token used only by unattended email publishing.
- `MICROBLOG_EMAIL_DESTINATION` — explicit Micropub destination UID/blog URL.

These values are intentionally separate from the browser workflow. The browser app token remains ephemeral and is not persisted by this feature.

## Activation sequence

1. Deploy the `post-by-email` endpoint.
2. Obtain the Resend-managed inbound address (or configure a receiving domain later).
3. Choose a long random local-part for `POST_BY_EMAIL_ADDRESS`.
4. Add the five environment variables above in Netlify.
5. Register `https://<site>/api/post-by-email` in Resend for the `email.received` event.
6. Save the returned Resend webhook signing secret in Netlify as `RESEND_WEBHOOK_SECRET`.
7. From reMarkable, send a small notebook to the private address using **PNG** export.
8. Confirm a private draft appears in Micro.blog with the pages in order.

Do not register the webhook until the deployment and environment configuration are ready.

## Current first-slice limits

- PNG attachments only.
- Email subject becomes the post title; empty subjects fall back to `Handwritten note`.
- Email message body is not yet used as summary/content metadata.
- Categories are not yet inferred or supplied by email.
- No remotely retrievable `.hwpublish` source document is created yet.
- The endpoint does not provide a live-publish command.

The next hardening step is durable idempotency for webhook retries before the endpoint is considered production-ready for unattended use.
