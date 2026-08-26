import { bearer, json, MICROPUB_ENDPOINT, upstreamError } from './_shared/microblog';

type ReceivedAttachment = {
  id: string;
  filename: string;
  size?: number;
  content_type: string;
  download_url: string;
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

const RESEND_API = 'https://api.resend.com';
const PNG_MEDIA_TYPE = 'image/png';
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function pageHtml(mediaUrls: string[], emailId: string): string {
  const pages = mediaUrls.map((url, index) => (
    `<figure class="handwritten-page" style="margin:0 0 1rem"><img src="${escapeHtml(url)}" alt="Handwritten page ${index + 1}" style="display:block;width:100%;height:auto" /></figure>`
  )).join('\n');
  return `<!-- handwritten-publish-email:${escapeHtml(emailId)} -->\n${pages}`;
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
  title: string,
  html: string,
): Promise<{ url: string; preview: string }> {
  const payload = {
    type: ['h-entry'],
    'mp-destination': destination,
    properties: {
      name: [title],
      content: [{ html }],
      'post-status': ['draft'],
    },
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
    const error = await upstreamError(response, `Micro.blog could not create the email draft (HTTP ${response.status}).`);
    const detail = await error.json().catch(() => null) as { error?: string } | null;
    throw new Error(detail?.error || 'Micro.blog could not create the email draft.');
  }
  const result = await response.json().catch(() => ({})) as { url?: string; preview?: string };
  const url = result.url || response.headers.get('Location') || '';
  if (!url) throw new Error('Micro.blog created the draft but returned no post URL.');
  return { url, preview: result.preview || url };
}

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const webhookSecret = env('RESEND_WEBHOOK_SECRET');
  const resendApiKey = env('RESEND_API_KEY');
  const postingAddress = normalizeRecipient(env('POST_BY_EMAIL_ADDRESS'));
  const microblogToken = env('MICROBLOG_EMAIL_TOKEN');
  const destination = env('MICROBLOG_EMAIL_DESTINATION');
  if (!webhookSecret || !resendApiKey || !postingAddress || !microblogToken || !destination) {
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
  if (!recipients.some(recipient => normalizeRecipient(recipient) === postingAddress)) {
    // A rotated/unknown alias is intentionally a no-op. Returning 2xx stops webhook retries.
    return json({ ignored: true, reason: 'unknown posting address' });
  }

  try {
    const attachments = (await listReceivedAttachments(resendApiKey, emailId))
      .filter(attachment => attachment.content_type.toLowerCase() === PNG_MEDIA_TYPE);
    if (!attachments.length) {
      return json({ ignored: true, reason: 'no PNG attachments' });
    }

    const mediaEndpoint = await microblogMediaEndpoint(microblogToken);
    const mediaUrls: string[] = [];
    for (const attachment of attachments) {
      mediaUrls.push(await uploadAttachmentToMicroblog(attachment, mediaEndpoint, microblogToken));
    }

    const title = event.data?.subject?.trim() || 'Handwritten note';
    const draft = await createMicroblogEmailDraft(
      microblogToken,
      destination,
      title,
      pageHtml(mediaUrls, emailId),
    );
    return json({ created: true, pages: mediaUrls.length, url: draft.url, preview: draft.preview });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not create Micro.blog draft from email.' }, 502);
  }
};

export const config = { path: '/api/post-by-email' };
