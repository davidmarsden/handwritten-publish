import type { MicroblogAuthor, MicroblogFeed, MicroblogItem } from './microblogSocial';

export type MastodonProfileAccount = {
  name: string;
  username: string;
  avatar?: string;
  url: string;
};

export type MastodonProfileResult = {
  account: MastodonProfileAccount;
  feed: MicroblogFeed;
};

export type MastodonProfilePaging = {
  limit?: number;
  maxId?: string;
};

type MastodonAccount = {
  id?: unknown;
  username?: unknown;
  acct?: unknown;
  display_name?: unknown;
  avatar?: unknown;
  url?: unknown;
};

type MastodonStatus = {
  id?: unknown;
  url?: unknown;
  uri?: unknown;
  content?: unknown;
  created_at?: unknown;
  account?: MastodonAccount;
};

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseMastodonProfileUrl(value?: string): { origin: string; host: string; username: string; url: string } | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (!host || host === 'micro.blog') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    let username = '';
    if (parts[0]?.startsWith('@')) username = parts[0].slice(1);
    else if (parts[0] === 'users' && parts[1]) username = parts[1];
    if (!username || !/^[A-Za-z0-9_.-]{1,128}$/.test(username)) return null;
    url.hash = '';
    url.search = '';
    return { origin: url.origin, host, username, url: url.toString().replace(/\/$/, '') };
  } catch {
    return null;
  }
}

export function isMastodonProfileUrl(value?: string): boolean {
  return Boolean(parseMastodonProfileUrl(value));
}

function displayUsername(account: MastodonAccount, fallbackUsername: string, host: string): string {
  const acct = cleanText(account.acct) || cleanText(account.username) || fallbackUsername;
  return acct.includes('@') ? acct.replace(/^@/, '') : `${acct.replace(/^@/, '')}@${host}`;
}

function authorFrom(account: MastodonAccount, fallback: { username: string; host: string; url: string }): MicroblogAuthor {
  const username = displayUsername(account, fallback.username, fallback.host);
  return {
    name: cleanText(account.display_name) || `@${username}`,
    username,
    avatar: cleanText(account.avatar),
    url: cleanText(account.url) || fallback.url,
  };
}

function normalizeStatus(status: MastodonStatus, fallback: { username: string; host: string; url: string }): MicroblogItem | null {
  const id = cleanText(status.id);
  if (!id) return null;
  const author = authorFrom(status.account || {}, fallback);
  return {
    id,
    url: cleanText(status.url) || cleanText(status.uri),
    content_html: cleanText(status.content) || '',
    date_published: cleanText(status.created_at),
    author,
  };
}

export async function fetchMastodonProfile(profileUrl: string, paging: MastodonProfilePaging = {}, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<MastodonProfileResult> {
  const target = parseMastodonProfileUrl(profileUrl);
  if (!target) throw new Error('That profile is not a supported Mastodon URL.');

  const lookupUrl = new URL('/api/v1/accounts/lookup', target.origin);
  lookupUrl.searchParams.set('acct', target.username);
  const lookupResponse = await fetchImpl(lookupUrl, { headers: { Accept: 'application/json' } });
  if (!lookupResponse.ok) throw new Error(`Mastodon profile lookup failed (${lookupResponse.status}).`);
  const account = await lookupResponse.json() as MastodonAccount;
  const accountId = cleanText(account.id);
  if (!accountId) throw new Error('Mastodon did not return an account id.');

  const statusesUrl = new URL(`/api/v1/accounts/${encodeURIComponent(accountId)}/statuses`, target.origin);
  const limit = Math.max(1, Math.min(40, Math.trunc(paging.limit || 40)));
  statusesUrl.searchParams.set('limit', String(limit));
  statusesUrl.searchParams.set('exclude_reblogs', 'true');
  if (paging.maxId && /^\d+$/.test(paging.maxId)) statusesUrl.searchParams.set('max_id', paging.maxId);

  const statusesResponse = await fetchImpl(statusesUrl, { headers: { Accept: 'application/json' } });
  if (!statusesResponse.ok) throw new Error(`Mastodon posts request failed (${statusesResponse.status}).`);
  const statuses = await statusesResponse.json() as MastodonStatus[];
  const fallback = { username: target.username, host: target.host, url: target.url };
  const normalizedAccount = authorFrom(account, fallback);

  return {
    account: {
      name: normalizedAccount.name || `@${target.username}`,
      username: normalizedAccount.username || `${target.username}@${target.host}`,
      avatar: normalizedAccount.avatar,
      url: normalizedAccount.url || target.url,
    },
    feed: { items: Array.isArray(statuses) ? statuses.flatMap(status => { const item = normalizeStatus(status, fallback); return item ? [item] : []; }) : [] },
  };
}
