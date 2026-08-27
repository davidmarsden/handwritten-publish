import { getDatabase } from '@netlify/database';
import { bearer, json, MICROPUB_ENDPOINT, upstreamError } from './_shared/microblog';
import {
  matchExistingCategories,
  parseRemarkablePostMetadata,
  transcriptionFromRemarkableEmail,
} from './_shared/remarkable-email';

type ReceivedAttachment = {
  id: string;
  filename: string;
  size?: number;
  content_type: string;
  download_url: string;
};

type ReceivedEmail = {
  text?: string | null;
  html?: string | null;
};

type ReceivedEmailEvent = {
  type?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    attachments?: Array<{
      id?: string;
      filename?: string;
      content_type?: string;
    }>;
  };
};

type JobRow = {
  email_id: string;
  status: 'processing' | 'completed';
  started_at: string | Date;
  pages: number | null;
  url: string | null;
  preview: string | null;
};

type EmailRoute = {
  address: string;
  destination: string;
};

type CategoryPayload = {
  categories?: unknown[];
  'microblog-categories'?: unknown[];
};

const RESEND_API = 'https://api.resend.com';
const PNG_MEDIA_TYPE = 'image/png';
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
const STALE_PROCESSING_MS = 10 * 60 * 1000;
const REMARKABLE_SUBJECT_PREFIX = 'Document from my reMarkable:';

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function base64Bytes(value: string): Uint8Array {
  const decoded = atob(value);
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}

function base64String(bytes: ArrayBuffer): string {
  const values = new Uint8Array(bytes);
  let binary = '';
  for (const value of values) binary += String.fromCharCode(value);
  return btoa(binary);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyResendWebhook(request: Request, payload: string, secret: string): Promise<boolean> {
  const id = request.headers.get('svix-id') ?? '';
  const timestamp = request.headers.get('svix-timestamp') ?? '';
  const signatureHeader = request.headers.get('svix-signature') ?? '';
  if (!id || !timestamp || !signatureHeader || !secret.startsWith('whsec_')) return false;

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestampSeconds)
    || Math.abs(nowSeconds - timestampSeconds) > WEBHOOK_TOLERANCE_SECONDS) return false;

  let keyBytes: Uint8Array;
  try {
    keyBytes = base64Bytes(secret.slice('whsec_'.length));
  } catch {
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${payload}`);
  const expected = base64String(await crypto.subtle.sign('HMAC', key, signed));
  return signatureHeader
    .split(' ')
    .map(value => value.trim())
    .filter(Boolean)
    .some(value => {
      const [version, signature] = value.split(',', 2);
      return version === 'v1' && Boolean(signature) && constantTimeEqual(signature, expected);
    });
}

function normalizeRecipient(value: string): string {
  return value.trim().toLowerCase();
}

export function isRemarkableEmailSubject(subject?: string): boolean {
  return (subject?.trim() ?? '').toLowerCase().startsWith(REMARKABLE_SUBJECT_PREFIX.toLowerCase());
}

export function titleFromEmailSubject(subject?: string): string {
  const trimmed = subject?.trim() ?? '';
  const title = isRemarkableEmailSubject(trimmed)
    ? trimmed.slice(REMARKABLE_SUBJECT_PREFIX.length).trim()
    : trimmed;
  return title || 'Handwritten note';
}

export function stripRemarkableEmailFooter(body: string): string {
  return body.replace(
    /\s*--\s*\r?\nSent from my reMarkable paper tablet\r?\nGet yours at www\.remarkable\.com\r?\n\r?\nPS: You cannot reply to this email\s*$/i,
    '',
  ).trimEnd();
}

function configuredRoutes(): EmailRoute[] {
  const rawRoutes = env('POST_BY_EMAIL_ROUTES');
  if (rawRoutes) {
    try {
      const parsed = JSON.parse(rawRoutes) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
      const entries = Object.entries(parsed);
      if (!entries.length || entries.some(([, destination]) => typeof destination !== 'string')) return [];
      const routes = entries.map(([address, destination]) => ({
        address: normalizeRecipient(address),
        destination: (destination as string).trim(),
      }));
      return routes.every(route => route.address && route.destination) ? routes : [];
    } catch {
      return [];
    }
  }

  const address = normalizeRecipient(env('POST_BY_EMAIL_ADDRESS'));
  const destination = env('MICROBLOG_EMAIL_DESTINATION');
  return address && destination ? [{ address, destination }] : [];
}

function resolveRoute(recipients: string[], routes: EmailRoute[]): { route: EmailRoute | null; ambiguous: boolean } {
  const recipientSet = new Set(recipients.map(normalizeRecipient));
  const matches = routes.filter(route => recipientSet.has(route.address));
  if (!matches.length) return { route: null, ambiguous: false };
  const destinations = new Set(matches.map(route => route.destination));
  if (destinations.size > 1) return { route: null, ambiguous: true };
  return { route: matches[0], ambiguous: false };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function transcriptionHtml(body: string): string {
  const cleaned = body.trim();
  if (!cleaned) return '';
  return cleaned
    .split(/\r?\n\s*\r?\n/)
    .map(paragraph => `<p>${escapeHtml(paragraph.trim()).replace(/\r?\n/g, '<br />')}</p>`)
    .join('\n');
}

function pageHtml(mediaUrls: string[]): string {
  return mediaUrls.map((url, index) => (
    `<figure class="handwritten-page" style="margin:0 0 1rem"><img src="${escapeHtml(url)}" alt="Handwritten page ${index + 1}" style="display:block;width:100%;height:auto" /></figure>`
  )).join('\n');
}

export function emailDraftHtml(emailId: string, body: string, mediaUrls: string[]): string {
  const marker = `<!-- handwritten-publish-email:${escapeHtml(emailId)} -->`;
  return [marker, transcriptionHtml(body), pageHtml(mediaUrls)].filter(Boolean).join('\n');
}

function staleProcessing(job: JobRow): boolean {
  if (job.status !== 'processing') return false;
  const startedAt = new Date(job.started_at).getTime();
  return Number.isFinite(startedAt) && Date.now() - startedAt >= STALE_PROCESSING_MS;
}

async function getJob(emailId: string): Promise<JobRow | null> {
  const db = getDatabase();
  const rows = await db.sql<JobRow>`
    SELECT email_id, status, started_at, pages, url, preview
    FROM post_by_email_jobs
    WHERE email_id = ${emailId}
  `;
  return rows[0] ?? null;
}

async function claimNewJob(emailId: string): Promise<boolean> {
  const db = getDatabase();
  const rows = await db.sql<{ email_id: string }>`
    INSERT INTO post_by_email_jobs (email_id, status)
    VALUES (${emailId}, 'processing')
    ON CONFLICT (email_id) DO NOTHING
    RETURNING email_id
  `;
  return rows.length === 1;
}

async function reclaimStaleJob(emailId: string, startedAt: string | Date): Promise<boolean> {
  const db = getDatabase();
  const rows = await db.sql<{ email_id: string }>`
    UPDATE post_by_email_jobs
    SET started_at = NOW(), pages = NULL, url = NULL, preview = NULL, completed_at = NULL
    WHERE email_id = ${emailId}
      AND status = 'processing'
      AND started_at = ${new Date(startedAt)}
    RETURNING email_id
  `;
  return rows.length === 1;
}

async function deleteProcessingJob(emailId: string): Promise<void> {
  const db = getDatabase();
  await db.sql`
    DELETE FROM post_by_email_jobs
    WHERE email_id = ${emailId} AND status = 'processing'
  `;
}

async function rememberPageCount(emailId: string, pages: number): Promise<void> {
  const db = getDatabase();
  await db.sql`
    UPDATE post_by_email_jobs
    SET pages = ${pages}
    WHERE email_id = ${emailId} AND status = 'processing'
  `;
}

async function markCompleted(emailId: string, pages: number, url: string, preview: string): Promise<void> {
  const db = getDatabase();
  await db.sql`
    UPDATE post_by_email_jobs
    SET status = 'completed', pages = ${pages}, url = ${url}, preview = ${preview}, completed_at = NOW()
    WHERE email_id = ${emailId} AND status = 'processing'
  `;
}

function sourceUrl(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as { url?: unknown; properties?: Record<string, unknown> };
  if (typeof record.url === 'string') return record.url;
  const value = record.properties?.url;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  if (typeof value === 'string') return value;
  return null;
}

async function findExistingEmailDraft(
  token: string,
  destination: string,
  emailId: string,
): Promise<{ url: string; preview: string } | null> {
  const marker = `handwritten-publish-email:${emailId}`;
  const matches: unknown[] = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const source = new URL(MICROPUB_ENDPOINT);
    source.searchParams.set('q', 'source');
    source.searchParams.set('limit', '100');
    source.searchParams.set('offset', String(offset));
    source.searchParams.set('mp-destination', destination);
    const response = await fetch(source, { headers: bearer(token) });
    if (!response.ok) throw new Error(`Could not reconcile the existing Micro.blog draft (HTTP ${response.status}).`);
    const payload = await response.json().catch(() => null) as { items?: unknown[] } | null;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    for (const item of items) {
      if (JSON.stringify(item).includes(marker)) matches.push(item);
    }
    if (items.length < 100 || matches.length > 1) break;
  }
  if (matches.length > 1) throw new Error('More than one Micro.blog post contains this email marker, so Handwritten Publish will not guess which one is canonical.');
  if (matches.length !== 1) return null;
  const url = sourceUrl(matches[0]);
  return url ? { url, preview: url } : null;
}

async function getReceivedEmail(apiKey: string, emailId: string): Promise<ReceivedEmail> {
  const response = await fetch(`${RESEND_API}/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: bearer(apiKey),
  });
  if (!response.ok) throw new Error(`Resend email lookup failed (HTTP ${response.status}).`);
  const payload = await response.json().catch(() => null) as ReceivedEmail | null;
  return payload ?? {};
}

async function listReceivedAttachments(apiKey: string, emailId: string): Promise<ReceivedAttachment[]> {
  const response = await fetch(`${RESEND_API}/emails/receiving/${encodeURIComponent(emailId)}/attachments`, {
    headers: bearer(apiKey),
  });
  if (!response.ok) throw new Error(`Resend attachment lookup failed (HTTP ${response.status}).`);
  const payload = await response.json().catch(() => null) as { data?: unknown[] } | null;
  if (!Array.isArray(payload?.data)) return [];
  return payload.data.filter((attachment): attachment is ReceivedAttachment => {
    if (!attachment || typeof attachment !== 'object') return false;
    const candidate = attachment as Partial<ReceivedAttachment>;
    return typeof candidate.id === 'string'
      && typeof candidate.filename === 'string'
      && typeof candidate.content_type === 'string'
      && typeof candidate.download_url === 'string';
  });
}

function categoryNames(payload: CategoryPayload | null): string[] {
  const simple = Array.isArray(payload?.categories)
    ? payload.categories.filter((category): category is string => typeof category === 'string')
    : [];
  const rich = Array.isArray(payload?.['microblog-categories'])
    ? payload['microblog-categories']
        .map(category => category && typeof category === 'object' && 'name' in category
          ? (category as { name?: unknown }).name
          : null)
        .filter((name): name is string => typeof name === 'string')
    : [];
  return [...new Set([...simple, ...rich].map(name => name.trim()).filter(Boolean))];
}

async function microblogCategories(token: string, destination: string): Promise<string[]> {
  const categoryUrl = new URL(MICROPUB_ENDPOINT);
  categoryUrl.searchParams.set('q', 'category');
  categoryUrl.searchParams.set('mp-destination', destination);
  const response = await fetch(categoryUrl, { headers: bearer(token) });
  if (!response.ok) throw new Error(`Could not load Micro.blog categories (HTTP ${response.status}).`);
  const payload = await response.json().catch(() => null) as CategoryPayload | null;
  return categoryNames(payload);
}

async function microblogMediaEndpoint(token: string): Promise<string> {
  const response = await fetch(`${MICROPUB_ENDPOINT}?q=config`, { headers: bearer(token) });
  if (!response.ok) throw new Error(`Micro.blog media discovery failed (HTTP ${response.status}).`);
  const config = await response.json().catch(() => null) as { 'media-endpoint'?: string } | null;
  if (!config?.['media-endpoint']) throw new Error('Micro.blog did not return a media endpoint.');
  return config['media-endpoint'];
}

async function uploadAttachmentToMicroblog(
  attachment: ReceivedAttachment,
  mediaEndpoint: string,
  token: string,
): Promise<string> {
  const download = await fetch(attachment.download_url);
  if (!download.ok) throw new Error(`Could not download ${attachment.filename} from Resend.`);
  const bytes = await download.arrayBuffer();
  if (!bytes.byteLength) throw new Error(`${attachment.filename} is empty.`);

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: PNG_MEDIA_TYPE }), attachment.filename);
  const upload = await fetch(mediaEndpoint, {
    method: 'POST',
    headers: bearer(token),
    body: form,
  });
  if (!upload.ok) throw new Error(`Micro.blog could not upload ${attachment.filename} (HTTP ${upload.status}).`);
  const url = upload.headers.get('Location');
  if (!url) throw new Error(`Micro.blog uploaded ${attachment.filename} but returned no media URL.`);
  return url;
}

async function createMicroblogEmailDraft(
  token: string,
  destination: string,
  title: string | null,
  html: string,
  categories: string[],
  status: 'draft' | 'published',
): Promise<{ url: string; preview: string }> {
  const properties: Record<string, unknown> = {
    content: [{ html }],
    'post-status': [status],
  };
  if (title) properties.name = [title];
  if (categories.length) properties.category = categories;

  const payload = {
    type: ['h-entry'],
    'mp-destination': destination,
    properties,
  };
  const response = await fetch(MICROPUB_ENDPOINT, {
    method: 'POST',
    headers: {
      ...bearer(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await upstreamError(response, `Micro.blog could not create the email post (HTTP ${response.status}).`);
    const detail = await error.json().catch(() => null) as { error?: string } | null;
    throw new Error(detail?.error || 'Micro.blog could not create the email post.');
  }
  const result = await response.json().catch(() => ({})) as { url?: string; preview?: string };
  const url = result.url || response.headers.get('Location') || '';
  if (!url) throw new Error('Micro.blog created the post but returned no post URL.');
  return { url, preview: result.preview || url };
}

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const webhookSecret = env('RESEND_WEBHOOK_SECRET');
  const resendApiKey = env('RESEND_API_KEY');
  const routes = configuredRoutes();
  const microblogToken = env('MICROBLOG_EMAIL_TOKEN');
  if (!webhookSecret || !resendApiKey || !routes.length || !microblogToken) {
    return json({ error: 'Post by email is not configured.' }, 503);
  }

  const rawPayload = await request.text();
  if (!(await verifyResendWebhook(request, rawPayload, webhookSecret))) {
    return json({ error: 'Invalid webhook signature.' }, 401);
  }

  const event = JSON.parse(rawPayload) as ReceivedEmailEvent;
  if (event.type !== 'email.received') return json({ ignored: true });

  const emailId = event.data?.email_id?.trim() ?? '';
  const recipients = event.data?.to ?? [];
  if (!emailId) return json({ ignored: true, reason: 'missing email id' });

  const resolved = resolveRoute(recipients, routes);
  if (resolved.ambiguous) return json({ ignored: true, reason: 'ambiguous posting addresses' });
  if (!resolved.route) return json({ ignored: true, reason: 'unknown posting address' });
  const destination = resolved.route.destination;

  let claimed = await claimNewJob(emailId);
  if (!claimed) {
    const existing = await getJob(emailId);
    if (existing?.status === 'completed' && existing.url && existing.preview) {
      return json({
        created: false,
        duplicate: true,
        pages: existing.pages ?? 0,
        url: existing.url,
        preview: existing.preview,
      });
    }
    if (!existing || !staleProcessing(existing)) {
      return json({ error: 'This email is already being processed. Retry later.' }, 409);
    }

    const reconciled = await findExistingEmailDraft(microblogToken, destination, emailId);
    if (reconciled) {
      const pages = existing.pages ?? 0;
      await markCompleted(emailId, pages, reconciled.url, reconciled.preview);
      return json({ created: false, duplicate: true, reconciled: true, pages, url: reconciled.url, preview: reconciled.preview });
    }

    claimed = await reclaimStaleJob(emailId, existing.started_at);
    if (!claimed) return json({ error: 'Another worker reclaimed this email first. Retry later.' }, 409);
  }

  let draftCreated = false;
  try {
    const remarkableMessage = isRemarkableEmailSubject(event.data?.subject);
    const receivedEmail = remarkableMessage
      ? await getReceivedEmail(resendApiKey, emailId)
      : {};
    const transcription = remarkableMessage ? transcriptionFromRemarkableEmail(receivedEmail) : '';
    const metadata = parseRemarkablePostMetadata(transcription);
    const attachments = (await listReceivedAttachments(resendApiKey, emailId))
      .filter(attachment => attachment.content_type.toLowerCase() === PNG_MEDIA_TYPE);

    if (!metadata.body && !attachments.length) {
      await deleteProcessingJob(emailId);
      return json({ ignored: true, reason: 'no transcription or PNG attachments' });
    }

    const mediaUrls: string[] = [];
    if (attachments.length) {
      const mediaEndpoint = await microblogMediaEndpoint(microblogToken);
      for (const attachment of attachments) {
        mediaUrls.push(await uploadAttachmentToMicroblog(attachment, mediaEndpoint, microblogToken));
      }
    }
    await rememberPageCount(emailId, mediaUrls.length);

    let categories: string[] = [];
    if (metadata.requestedCategories.length) {
      const availableCategories = await microblogCategories(microblogToken, destination);
      categories = matchExistingCategories(metadata.requestedCategories, availableCategories);
    }

    const title = metadata.title ?? (metadata.body
      ? null
      : titleFromEmailSubject(event.data?.subject));
    const draft = await createMicroblogEmailDraft(
      microblogToken,
      destination,
      title,
      emailDraftHtml(emailId, metadata.body, mediaUrls),
      categories,
      metadata.status,
    );
    draftCreated = true;

    try {
      await markCompleted(emailId, mediaUrls.length, draft.url, draft.preview);
    } catch {
      // The remote post already exists. Keep the processing row intact so a later retry can reconcile by email marker.
      return json({
        created: true,
        persistence: 'pending',
        pages: mediaUrls.length,
        url: draft.url,
        preview: draft.preview,
      }, 202);
    }

    return json({ created: true, pages: mediaUrls.length, url: draft.url, preview: draft.preview });
  } catch (error) {
    if (!draftCreated) await deleteProcessingJob(emailId).catch(() => undefined);
    return json({ error: error instanceof Error ? error.message : 'Could not create Micro.blog post from email.' }, 502);
  }
};

export const config = { path: '/api/post-by-email' };
