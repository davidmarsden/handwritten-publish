# Writing Hand

**reMarkable → Micro.blog**

From paper to web at the push of a pen.

Writing Hand is the reMarkable publishing bridge in the Helping Hand family. The live setup/product surface is `/setup/email/`.

## v1.0 boundary

Writing Hand owns:

- reMarkable Send-by-email ingestion;
- Resend inbound webhook verification;
- transcription/body cleanup;
- original handwritten PNG attachment handling;
- `Title:`, `Categories:` and `Status:` metadata parsing;
- draft-by-default unattended Micro.blog publishing;
- explicit `Status: published` handling;
- recipient-to-destination routing;
- durable email retry/idempotency and reconciliation.

The implementation remains mostly server-side in repository-level Netlify Functions because those functions are shared deployment infrastructure, not because Writing Hand is unfinished.

Future work such as PDF email attachments or deeper native tablet integration is optional and need-driven.

Shared Micropub/media primitives belong in `packages/publishing-core/`; reMarkable/Resend-specific behaviour belongs to Writing Hand.
