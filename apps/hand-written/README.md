# Hand Written

**reMarkable → Micro.blog**

From paper to web at the push of a pen.

This directory is the future product boundary for the reMarkable publishing bridge.

Current implementation remains in the repository-level Netlify Functions while the suite is restructured safely. Hand Written will own:

- reMarkable Send-by-email ingestion;
- Resend inbound webhook handling;
- transcription/body cleanup;
- `Title:`, `Categories:` and `Status:` metadata parsing;
- handwritten/image attachment handling;
- unattended Micro.blog draft/publish behavior;
- email-specific retry/reconciliation.

Do not move shared Micropub/media primitives here; those belong in `packages/publishing-core/`.
