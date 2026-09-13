import { json } from './_shared/microblog';
import { mastodonFetch, mastodonSession } from './_shared/mastodon-session';

export const config = {
  path: '/api/mastodon/social',
  rateLimit: {
    windowLimit: 120,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};

type MastodonAccount = {
  username?: unknown;
  acct?: unknown;
  display_name?: unknown;
  avatar?: unknown;
  url?: unknown;
};

type MastodonMediaAttachment = {
  type?: unknown;
  url?: unknown;
  remote_url?: unknown;
  preview_url?: unknown;
  description?: unknown;
};

type MastodonStatus = {
  id?: unknown;
  url?: unknown;
  uri?: unknown;
  content?: unknown;
  created_at?: unknown;
  account?: MastodonAccount;
  reblog?: MastodonStatus | null;
  media_attachments?: unknown;
};

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safeHttpUrl(value: unknown): string | undefined {
  const cleaned = cleanText(value);
  if (!cleaned) return undefined;
  try {
    const url = new URL(cleaned);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mediaHtml(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.flatMap(raw => {
    if (!raw || typeof raw !== 'object') return [];
    const attachment = raw as MastodonMediaAttachment;
    const href = safeHttpUrl(attachment.url) || safeHttpUrl(attachment.remote_url) || safeHttpUrl(attachment.preview_url);
    if (!href) return [];
    const preview = safeHttpUrl(attachment.preview_url) || (cleanText(attachment.type) === 'image' ? safeHttpUrl(attachment.url) : undefined);
    const alt = escapeAttribute(cleanText(attachment.description) || 'Media attachment');
    if (preview) return [`<p><a href="${escapeAttribute(href)}"><img src="${escapeAttribute(preview)}" alt="${alt}"></a></p>`];
    return [`<p><a href="${escapeAttribute(href)}">${alt}</a></p>`];
  }).join('');
}

function displayUsername(account: MastodonAccount, host: string): string {
  const acct = cleanText(account.acct) || cleanText(account.username) || 'unknown';
  return acct.includes('@') ? acct.replace(/^@/, '') : `${acct.replace(/^@/, '')}@${host}`;
}

function authorFrom(account: MastodonAccount, host: string) {
  const username = displayUsername(account, host);
  return {
    name: cleanText(account.display_name) || `@${username}`,
    username,
    avatar: cleanText(account.avatar),
    url: cleanText(account.url),
  };
}

function normalizeStatus(status: MastodonStatus, host: string) {
  const visible = status.reblog && typeof status.reblog === 'object' ? status.reblog : status;
  const remoteId = cleanText(status.id);
  if (!remoteId) return null;
  const visibleId = cleanText(visible.id) || remoteId;
  const author = authorFrom(visible.account || {}, host);
  const content = `${cleanText(visible.content) || ''}${mediaHtml(visible.media_attachments)}`;
  return {
    id: `mastodon:${host}:${remoteId}`,
    url: cleanText(visible.url) || cleanText(visible.uri),
    content_html: content,
    date_published: cleanText(status.created_at) || cleanText(visible.created_at),
    author,
    _microblog: {
      source: 'mastodon',
      remote_id: remoteId,
      visible_remote_id: visibleId,
      ...(status.reblog ? { reblogged_by: authorFrom(status.account || {}, host).name } : {}),
    },
  };
}

export function mastodonPagingId(value?: string): string | undefined {
  const cleaned = value?.trim();
  if (!cleaned) return undefined;

  // Mastodon-compatible APIs define IDs as strings. Keep them opaque instead of
  // assuming the numeric IDs used by stock Mastodon.
  const namespaced = cleaned.match(/^mastodon:[^:]+:(.+)$/s);
  const candidate = namespaced?.[1] ?? cleaned;
  if (!candidate || candidate.length > 512 || /[\s\u0000-\u001f\u007f]/.test(candidate)) return undefined;
  return candidate;
}

async function authenticated(request: Request) {
  const session = await mastodonSession(request);
  if (!session) return null;
  const host = new URL(session.instanceOrigin).hostname;
  return { ...session, host };
}

async function account(request: Request): Promise<Response> {
  const session = await authenticated(request);
  if (!session) return json({ error: 'Connect a Mastodon account first.' }, 401);
  const response = await mastodonFetch(session.instanceOrigin, '/api/v1/accounts/verify_credentials', {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!response.ok) return json({ error: `Mastodon account request failed (${response.status}).` }, response.status === 401 ? 401 : 502);
  const payload = await response.json().catch(() => null) as MastodonAccount | null;
  if (!payload) return json({ error: 'Mastodon returned an invalid account response.' }, 502);
  const username = displayUsername(payload, session.host);
  return json({
    name: cleanText(payload.display_name) || `@${username}`,
    username,
    avatar: cleanText(payload.avatar),
    defaultSite: session.host,
  });
}

async function timeline(request: Request): Promise<Response> {
  const session = await authenticated(request);
  if (!session) return json({ error: 'Connect a Mastodon account first.' }, 401);
  const url = new URL(request.url);
  const count = Math.max(1, Math.min(40, Number.parseInt(url.searchParams.get('count') || '40', 10) || 40));
  const api = new URL('/api/v1/timelines/home', session.instanceOrigin);
  api.searchParams.set('limit', String(count));
  const maxId = mastodonPagingId(url.searchParams.get('before_id') || undefined);
  const sinceId = mastodonPagingId(url.searchParams.get('since_id') || undefined);
  if (maxId) api.searchParams.set('max_id', maxId);
  if (sinceId) api.searchParams.set('since_id', sinceId);

  const response = await mastodonFetch(session.instanceOrigin, `${api.pathname}${api.search}`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!response.ok) return json({ error: `Mastodon timeline request failed (${response.status}).` }, response.status === 401 ? 401 : 502);
  const payload = await response.json().catch(() => []) as MastodonStatus[];
  const items = Array.isArray(payload) ? payload.flatMap(status => {
    const item = normalizeStatus(status, session.host);
    return item ? [item] : [];
  }) : [];
  return json({ items });
}

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') return json({ error: 'Unsupported Mastodon social operation.' }, 405);
  const op = new URL(request.url).searchParams.get('op');
  if (op === 'account') return account(request);
  if (op === 'timeline') return timeline(request);
  return json({ error: 'Unsupported Mastodon social operation.' }, 405);
};
