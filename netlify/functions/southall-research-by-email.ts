import { json } from './_shared/microblog';
import {
  parseRemarkablePostMetadata,
  transcriptionFromRemarkableEmail,
} from './_shared/remarkable-email';

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
  };
};

const RESEND_API = 'https://api.resend.com';
const GITHUB_API = 'https://api.github.com';
const REPOSITORY = 'davidmarsden/Southall-Research';
const BRANCH = 'main';
const DRAFTS_DIRECTORY = 'drafts';
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
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

function isRemarkableEmailSubject(subject?: string): boolean {
  return (subject?.trim() ?? '').toLowerCase().startsWith(REMARKABLE_SUBJECT_PREFIX.toLowerCase());
}

function titleFromEmailSubject(subject?: string): string {
  const trimmed = subject?.trim() ?? '';
  const title = isRemarkableEmailSubject(trimmed)
    ? trimmed.slice(REMARKABLE_SUBJECT_PREFIX.length).trim()
    : trimmed;
  return title || 'Handwritten Southall Stories draft';
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'handwritten-draft';
}

function safeEmailSuffix(emailId: string): string {
  const cleaned = emailId.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned.slice(-12) || 'email';
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function uniqueCategories(categories: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const category of categories.map(value => value.trim()).filter(Boolean)) {
    const key = category.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(category);
  }
  return result;
}

export function southallDraftMarkdown(
  emailId: string,
  title: string,
  body: string,
  categories: string[],
  date = new Date(),
): string {
  const categoryLines = uniqueCategories(categories).map(category => `  - ${yamlString(category)}`);
  const frontMatter = [
    '---',
    `title: ${yamlString(title)}`,
    `date: ${date.toISOString().slice(0, 10)}`,
    ...(categoryLines.length ? ['categories:', ...categoryLines] : []),
    'review_complete: false',
    `helping_hand_email_id: ${yamlString(emailId)}`,
    '---',
  ];
  return `${frontMatter.join('\n')}\n\n# ${title}\n\n${body.trim()}\n`;
}

async function getReceivedEmail(apiKey: string, emailId: string): Promise<ReceivedEmail> {
  const response = await fetch(`${RESEND_API}/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`Resend email lookup failed (HTTP ${response.status}).`);
  const payload = await response.json().catch(() => null) as ReceivedEmail | null;
  return payload ?? {};
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Helping-Hand-Southall-Research-Email',
  };
}

async function saveDraftToGitHub(
  githubToken: string,
  filename: string,
  markdown: string,
): Promise<{ updated: boolean; path: string; url: string; commitUrl: string | null }> {
  const path = `${DRAFTS_DIRECTORY}/${filename}`;
  const apiUrl = `${GITHUB_API}/repos/${REPOSITORY}/contents/${encodeURIComponent(DRAFTS_DIRECTORY)}/${encodeURIComponent(filename)}`;
  const headers = githubHeaders(githubToken);

  let existingSha: string | undefined;
  const existingUrl = new URL(apiUrl);
  existingUrl.searchParams.set('ref', BRANCH);
  const existingResponse = await fetch(existingUrl, { headers });
  if (existingResponse.ok) {
    const existing = await existingResponse.json().catch(() => null) as { sha?: string } | null;
    existingSha = existing?.sha;
  } else if (existingResponse.status !== 404) {
    throw new Error(`GitHub could not inspect the private draft (HTTP ${existingResponse.status}).`);
  }

  const commitBody = {
    message: existingSha ? `Update reMarkable draft: ${filename}` : `Add reMarkable draft: ${filename}`,
    content: Buffer.from(markdown, 'utf8').toString('base64'),
    branch: BRANCH,
    ...(existingSha ? { sha: existingSha } : {}),
  };
  const writeResponse = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(commitBody),
  });
  if (!writeResponse.ok) {
    throw new Error(`GitHub could not save the private draft (HTTP ${writeResponse.status}).`);
  }

  const result = await writeResponse.json().catch(() => null) as {
    content?: { html_url?: string; path?: string };
    commit?: { html_url?: string };
  } | null;
  return {
    updated: Boolean(existingSha),
    path: result?.content?.path || path,
    url: result?.content?.html_url || `https://github.com/${REPOSITORY}/blob/${BRANCH}/${path}`,
    commitUrl: result?.commit?.html_url || null,
  };
}

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const webhookSecret = env('RESEND_WEBHOOK_SECRET');
  const resendApiKey = env('RESEND_API_KEY');
  const githubToken = env('SOUTHALL_RESEARCH_GITHUB_TOKEN');
  const postingAddress = normalizeRecipient(env('SOUTHALL_RESEARCH_EMAIL_ADDRESS'));
  if (!webhookSecret || !resendApiKey || !githubToken || !postingAddress) {
    return json({ error: 'Southall Research post by email is not configured.' }, 503);
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
  if (!recipients.map(normalizeRecipient).includes(postingAddress)) {
    return json({ ignored: true, reason: 'unknown posting address' });
  }
  if (!isRemarkableEmailSubject(event.data?.subject)) {
    return json({ ignored: true, reason: 'not a reMarkable send-by-email message' });
  }

  try {
    const receivedEmail = await getReceivedEmail(resendApiKey, emailId);
    const transcription = transcriptionFromRemarkableEmail(receivedEmail);
    const metadata = parseRemarkablePostMetadata(transcription);
    if (!metadata.body) return json({ ignored: true, reason: 'no transcription' });

    const title = metadata.title || titleFromEmailSubject(event.data?.subject);
    const filename = `${slugify(title)}-${safeEmailSuffix(emailId)}.md`;
    const markdown = southallDraftMarkdown(
      emailId,
      title,
      metadata.body,
      metadata.requestedCategories,
    );
    const saved = await saveDraftToGitHub(githubToken, filename, markdown);

    return json({
      saved: true,
      updated: saved.updated,
      path: saved.path,
      url: saved.url,
      commitUrl: saved.commitUrl,
      status: 'draft',
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Could not create Southall Research draft from email.',
    }, 502);
  }
};

export const config = { path: '/api/southall-research/by-email' };
