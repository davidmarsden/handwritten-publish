# Running a public Handwritten Publish instance

The browser app can be publicly hosted while each visitor supplies their own Micro.blog app token. The token is used only for that visitor's requests and is not stored by Handwritten Publish.

Post-by-email is separate: it uses the deployment owner's server-side Resend and Micro.blog configuration and is not opened up to public browser users.

## What the public bridge can see

The Netlify functions necessarily receive a visitor's Micro.blog token long enough to make the requested Micro.blog API call. Handwritten Publish does not persist or log that token.

Public-usage monitoring intentionally records only:

- whether a successful browser operation was a `create` or `update`;
- the timestamp.

It does not record visitor identity, IP addresses in application logs, Micro.blog tokens, post titles, post content, destination URLs or media URLs.

Netlify itself maintains normal platform request/function logs according to the account's plan and retention settings.

## Public monthly counter and demo limit

Every successful browser Micro.blog create/update is also recorded in Netlify Database as a privacy-minimal usage event. The public app reads `/api/public-usage` and displays the current month's total in its footer.

Set an optional positive integer in Netlify:

```text
PUBLIC_MONTHLY_POST_LIMIT=100
```

With that example, the footer shows `Public demo · 23 of 100 publishes used this month`. When the count reaches 100, new browser Micro.blog media uploads and create/update requests return HTTP 429 until the next UTC calendar month begins, or until the limit is increased/removed and the deployment is refreshed.

The counter is global, not per-user. It deliberately does not use accounts, cookies or fingerprinting. Your own browser publishing therefore counts toward the same demo allowance.

If `PUBLIC_MONTHLY_POST_LIMIT` is unset, blank, zero or invalid, the counter still reports successful browser publishes but no monthly cap is enforced.

Because the limit is checked immediately before requests rather than holding a database lock open across external Micro.blog calls, a burst of genuinely simultaneous final publish requests could exceed the configured cap by a very small number. The per-IP rate limits remain the first line of defence against automated hammering.

## See when and how often the public bridge is used

Every successful browser Micro.blog create/update writes a function log entry like:

```text
[public-usage] create 2026-08-28T08:00:00.000Z
```

or:

```text
[public-usage] update 2026-08-28T08:05:00.000Z
```

In Netlify, open the project's function logs and filter for `public-usage`. Function metrics/Observability can also show invocation volume for the Micro.blog bridge functions.

These entries include your own browser publishing too. Handwritten Publish deliberately does not fingerprint or identify visitors merely to distinguish the owner from everybody else.

## Optional email alert for every successful browser post

Alerts are disabled unless all three of these environment variables are present:

```text
PUBLIC_USAGE_RESEND_API_KEY
PUBLIC_USAGE_ALERT_FROM
PUBLIC_USAGE_ALERT_TO
```

Use a Resend API key permitted to send mail. `PUBLIC_USAGE_ALERT_FROM` must be an address/domain Resend allows that account to send from, and `PUBLIC_USAGE_ALERT_TO` is the address that should receive alerts.

One alert is sent per successful **post create or update**, not per image upload. Alert delivery is best-effort and bounded: a Resend problem never causes an otherwise successful Micro.blog post to fail.

The alert contains only the action and timestamp.

## Emergency public-publishing switch

Set this Netlify environment variable:

```text
PUBLIC_PUBLISHING_ENABLED=false
```

and redeploy/restart the production configuration so the Functions receive the new environment value. Verify that the browser Micro.blog bridge returns HTTP 503 before treating the switch as active.

The browser Micro.blog config, media and draft endpoints will then return HTTP 503. Local browser document editing/export remains available, and the separate post-by-email endpoint is not affected.

Remove the variable, or set it to `true`, then redeploy and verify again to enable the public Micro.blog bridge.

## Rate limits

The public Micro.blog endpoints use Netlify's per-IP code-based rate limiting:

- config: 30 requests per minute;
- media: 60 requests per minute;
- draft/create/update: 12 requests per minute.

Normal use should stay comfortably below these limits while automated hammering from one client receives HTTP 429 responses.

The media bridge also retains its existing 5 MB per-image limit and accepts only PNG, JPEG and WebP.

## Netlify cost alerts

Netlify separately provides plan-level usage/billing notifications as account usage approaches its allowance. These are useful as the final cost backstop even if custom Handwritten Publish usage alerts are not configured.
