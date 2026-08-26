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
- Each PNG is uploaded directly to the selected Micro.blog destination's media endpoint.
- Handwritten Publish creates a private Micro.blog draft whose title is the email subject.

## Security model

Each posting address is a revocable incoming credential. A recognisable prefix can identify the destination to the reMarkable user, while the rest of the local-part should remain high entropy and private.

The server accepts a message only when:

1. the webhook signature verifies against `RESEND_WEBHOOK_SECRET`; and
2. one of the webhook recipients exactly matches a configured private posting route.

Mail sent to another alias is ignored with a successful webhook response. Mail addressed to configured aliases for more than one Micro.blog destination is also ignored rather than guessing which destination to use.

Rotating an alias means replacing that address in `POST_BY_EMAIL_ROUTES`; once the old address is removed, it becomes inert from Handwritten Publish's point of view.

Do not expose posting addresses publicly. Anyone who knows one can create a private draft in the destination mapped to that address unless a future optional sender restriction is enabled.

## Required server configuration

Post by email is opt-in. The endpoint returns `503 Post by email is not configured` until the shared credentials and at least one valid posting route are configured.

Shared variables:

- `RESEND_API_KEY` — Resend API key with access to received-email attachments.
- `RESEND_WEBHOOK_SECRET` — signing secret for the Resend webhook.
- `MICROBLOG_EMAIL_TOKEN` — revocable Micro.blog app token used only by unattended email publishing.

For one or more destination-specific aliases, set `POST_BY_EMAIL_ROUTES` to a JSON object whose keys are exact private recipient addresses and whose values are Micro.blog Micropub destination UIDs/blog URLs. For example:

```json
{
  "david-<private-random>@example.resend.app": "https://david.example/",
  "southall-<different-private-random>@example.resend.app": "https://southall.example/"
}
```

`POST_BY_EMAIL_ROUTES` is authoritative whenever it is non-empty. If it contains malformed JSON, the wrong JSON shape, an empty object, non-string destinations, blank addresses, or blank destinations, the endpoint fails closed with `503`; it does not fall back to legacy settings.

For backward compatibility, installations that do not set `POST_BY_EMAIL_ROUTES` may instead use the original single-route pair:

- `POST_BY_EMAIL_ADDRESS` — exact private recipient address.
- `MICROBLOG_EMAIL_DESTINATION` — explicit Micropub destination UID/blog URL.

These values are intentionally separate from the browser workflow. The browser app token remains ephemeral and is not persisted by this feature.

## Activation sequence

1. Deploy the `post-by-email` endpoint.
2. Obtain the Resend-managed inbound domain/address.
3. Choose a recognisable but still secret address for each Micro.blog destination, such as `david-<random>@...` and `southall-<different-random>@...`.
4. Add `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and `MICROBLOG_EMAIL_TOKEN` in Netlify.
5. Add `POST_BY_EMAIL_ROUTES` as the JSON address-to-destination map above. Use the legacy address/destination pair only for a single-route installation that has no route table.
6. Register `https://<site>/api/post-by-email` in Resend for the `email.received` event.
7. Save the returned Resend webhook signing secret in Netlify as `RESEND_WEBHOOK_SECRET`.
8. From reMarkable, save each private alias as a recognisable recipient and send a small notebook using **PNG** export.
9. Confirm a private draft appears in the Micro.blog destination mapped to the chosen recipient, with pages in order.

Do not register the webhook until the deployment and environment configuration are ready.

## Current first-slice limits

- PNG attachments only.
- Email subject becomes the post title; empty subjects fall back to `Handwritten note`.
- Email message body is not yet used as summary/content metadata.
- Categories are not yet inferred or supplied by email.
- No remotely retrievable `.hwpublish` source document is created yet.
- The endpoint does not provide a live-publish command.

Webhook retries are protected by durable database-backed idempotency and stale-job reconciliation before any replacement draft is created.
