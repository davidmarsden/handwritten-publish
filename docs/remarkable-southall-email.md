# reMarkable → Southall Research by email

Helping Hand can turn a reMarkable handwriting transcription directly into a private Southall Stories newsroom draft in `davidmarsden/Southall-Research`.

```text
reMarkable
  ↓ Send by email (transcription)
private Southall Research inbound alias
  ↓ Resend email.received webhook
Helping Hand /api/southall-research/by-email
  ↓
Southall-Research/drafts/*.md
  ↓
private draft-review workflow
```

This route is deliberately **draft-only**. It never publishes to Southall Stories or Micro.blog. A `Status: published` line is accepted as reMarkable transport metadata but cannot make this route publish anything.

## Handwriting format

The same leading metadata syntax used by Writing Hand works here:

```text
Title: The Council Knew
Categories: Investigations, Local Democracy

This is the article body.
```

`Title:` is strongly recommended. If it is omitted, Helping Hand falls back to the reMarkable document/notebook name from the standard subject `Document from my reMarkable: …`.

`Categories:` is optional. Unlike the Micro.blog email route, the names are not checked against a remote category list; they are preserved in the private draft front matter for later editorial work.

The resulting file is publication-workflow compatible:

```yaml
---
title: "The Council Knew"
date: 2026-09-15
categories:
  - "Investigations"
  - "Local Democracy"
review_complete: false
helping_hand_email_id: "..."
---
```

The article follows as ordinary Markdown with a level-one title heading.

## Idempotency

The filename contains a slug of the title plus a stable suffix derived from the Resend email ID. Re-delivery of the same webhook therefore updates the same private file rather than creating another draft.

Sending a newly composed reMarkable email, even with the same title, has a different email ID and creates a new draft. This avoids silently overwriting an older newsroom draft.

## Security boundary

The endpoint accepts a draft only when all of these are true:

1. the Resend webhook signature verifies using `RESEND_WEBHOOK_SECRET`;
2. the message is addressed to the exact private alias in `SOUTHALL_RESEARCH_EMAIL_ADDRESS`;
3. the subject is the standard reMarkable send-by-email form; and
4. the server has the existing narrowly scoped `SOUTHALL_RESEARCH_GITHUB_TOKEN`.

The GitHub token remains server-side. The reMarkable device receives no GitHub credential and the endpoint cannot choose a repository, branch or directory from email input. The destination is fixed in code to:

```text
davidmarsden/Southall-Research
drafts/
main
```

Treat `SOUTHALL_RESEARCH_EMAIL_ADDRESS` as a private posting credential and use a high-entropy local part.

## Required configuration

The route reuses the existing Southall Research GitHub credential and Resend receiving setup. Configure:

```text
RESEND_API_KEY=<existing Resend receiving API key>
RESEND_WEBHOOK_SECRET=<existing Resend webhook signing secret>
SOUTHALL_RESEARCH_GITHUB_TOKEN=<existing fine-grained Southall-Research token>
SOUTHALL_RESEARCH_EMAIL_ADDRESS=<private high-entropy inbound address>
```

Register this endpoint for Resend's `email.received` event:

```text
https://hand.davidmarsden.info/api/southall-research/by-email
```

The webhook receives all inbound events but ignores mail not addressed to `SOUTHALL_RESEARCH_EMAIL_ADDRESS`.

## First test

1. Save the private Southall Research alias as a reMarkable recipient.
2. Write a short notebook page and choose **Convert to text and send**.
3. Put `Title: reMarkable Southall test` at the top of the converted text.
4. Send it to the private alias.
5. Confirm a new file appears under `Southall-Research/drafts/` and the private review workflow runs.
6. Delete the disposable draft after the end-to-end test.

Original PNG/PDF handwriting attachments are not stored by this first version; the GitHub newsroom route is transcription-first. The existing Micro.blog post-by-email route continues to support transcription and PNG pages independently.
