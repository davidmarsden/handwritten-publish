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
  includeReplies?: boolean;
};

type MastodonAccount = {
  id?: unknown;
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
  media_attachments?: unknown;
};

type PublicProfileTarget = {
  origin: string;
  host: string;
  username: string;
  url: string;
  kind: 'mastodon' | 'channel';
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
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
    if (preview) {
      return [`<p><a href="${escapeAttribute(href)}"><img src="${escapeAttribute(preview)}" alt="${alt}"></a></p>`];
    }
    return [`<p><a href="${escapeAttribute(href)}">${alt}</a></p>`];
  }).join('');
}

function parsePublicProfileUrl(value?: string): PublicProfileTarget | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (!host || host === 'micro.blog') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    let username = '';
    let kind: PublicProfileTarget['kind'] = 'mastodon';
    if (parts[0]?.startsWith('@')) username = parts[0].slice(1);
    else if (parts[0] === 'users' && parts[1]) username = parts[1];
    else if (parts[0] === 'channel' && parts[1]) {
      username = parts[1];
      kind = 'channel';
    }
    if (!username || !/^[A-Za-z0-9_.-]{1,128}$/.test(username)) return null;
    url.hash = '';
    url.search = '';
    return { origin: url.origin, host, username, url: url.toString().replace(/\/$/, ''), kind };
  } catch {
    return null;
  }
}

export function isMastodonProfileUrl(value?: string): boolean {
  return Boolean(parsePublicProfileUrl(value));
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
  const remoteId = cleanText(status.id);
  if (!remoteId) return null;
  const author = authorFrom(status.account || {}, fallback);
  const content = `${cleanText(status.content) || ''}${mediaHtml(status.media_attachments)}`;
  return {
    // Namespace remote IDs so an accidental Micro.blog action can never target
    // an unrelated Micro.blog post with the same numeric identifier.
    id: `mastodon:${fallback.host}:${remoteId}`,
    url: cleanText(status.url) || cleanText(status.uri),
    content_html: content,
    date_published: cleanText(status.created_at),
    author,
    _microblog: {
      source: 'mastodon',
      remote_id: remoteId,
    },
  };
}

function pagingRemoteId(value?: string): string | undefined {
  const cleaned = value?.trim();
  if (!cleaned) return undefined;
  if (/^\d+$/.test(cleaned)) return cleaned;
  const match = cleaned.match(/^mastodon:[^:]+:(\d+)$/);
  return match?.[1];
}

async function fetchPublicChannel(profileUrl: string, paging: MastodonProfilePaging, fetchImpl: typeof fetch): Promise<MastodonProfileResult> {
  const params = new URLSearchParams({ profile: profileUrl });
  if (paging.includeReplies) params.set('mode', 'all');
  const response = await fetchImpl(`/api/fediverse/public?${params.toString()}`, { headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({})) as Partial<MastodonProfileResult> & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Public Fediverse profile request failed (${response.status}).`);
  if (!payload.account || !payload.feed || !Array.isArray(payload.feed.items)) throw new Error('Public Fediverse profile returned invalid data.');
  return payload as MastodonProfileResult;
}

export async function fetchMastodonProfile(profileUrl: string, paging: MastodonProfilePaging = {}, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<MastodonProfileResult> {
  const target = parsePublicProfileUrl(profileUrl);
  if (!target) throw new Error('That profile is not a supported Fediverse URL.');
  if (target.kind === 'channel') return fetchPublicChannel(target.url, paging, fetchImpl);

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
  const maxId = pagingRemoteId(paging.maxId);
  if (maxId) statusesUrl.searchParams.set('max_id', maxId);

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


function hasVisibleContent(item: MicroblogItem): boolean {
  return Boolean(item.content_text?.trim() || item.content_html?.trim() || item.url);
}

function channelProfileUrl(value?: string): string | undefined {
  const target = parsePublicProfileUrl(value);
  return target?.kind === 'channel' ? target.url : undefined;
}

function publishedAt(item: MicroblogItem): number | undefined {
  if (!item.date_published) return undefined;
  const value = Date.parse(item.date_published);
  return Number.isFinite(value) ? value : undefined;
}

function uniquePublishedItem(
  source: MicroblogItem,
  candidates: MicroblogItem[],
  usedRemoteIds: Set<string>,
): MicroblogItem | undefined {
  const sourceTime = publishedAt(source);
  if (sourceTime === undefined) return undefined;

  const matches = candidates.filter(candidate => {
    if (!candidate.id || usedRemoteIds.has(candidate.id)) return false;
    const candidateTime = publishedAt(candidate);
    return candidateTime !== undefined && Math.abs(candidateTime - sourceTime) <= 2 * 60 * 1000;
  });

  // Timestamp matching is only safe when it identifies exactly one unused
  // remote item. If several posts land in the same window, leave the
  // Micro.blog card untouched rather than risk mismatched actions.
  return matches.length === 1 ? matches[0] : undefined;
}

export async function enrichBlankChannelItems(
  feed: MicroblogFeed,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<MicroblogFeed> {
  const blanks = feed.items.filter(item => !hasVisibleContent(item) && channelProfileUrl(item.author?.url));
  if (!blanks.length) return feed;

  const profiles = [...new Set(blanks.flatMap(item => {
    const url = channelProfileUrl(item.author?.url);
    return url ? [url] : [];
  }))];

  const remoteFeeds = new Map<string, MicroblogFeed>();
  await Promise.all(profiles.map(async profileUrl => {
    try {
      const result = await fetchMastodonProfile(profileUrl, { includeReplies: true }, fetchImpl);
      remoteFeeds.set(profileUrl, result.feed);
    } catch {
      // A remote enrichment failure should never break the Micro.blog timeline.
    }
  }));

  const usedRemoteIds = new Set<string>();

  return {
    ...feed,
    items: feed.items.map(item => {
      if (hasVisibleContent(item)) return item;
      const profileUrl = channelProfileUrl(item.author?.url);
      if (!profileUrl) return item;
      const remote = uniquePublishedItem(item, remoteFeeds.get(profileUrl)?.items || [], usedRemoteIds);
      if (!remote) return item;
      usedRemoteIds.add(remote.id);
      return {
        ...item,
        ...(remote.url ? { url: remote.url } : {}),
        ...(remote.content_html ? { content_html: remote.content_html } : {}),
        ...(remote.content_text ? { content_text: remote.content_text } : {}),
        author: {
          ...(remote.author || {}),
          ...(item.author || {}),
          avatar: item.author?.avatar || remote.author?.avatar,
          url: item.author?.url || remote.author?.url,
        },
        _microblog: {
          ...(item._microblog || {}),
          remote_enriched: true,
          remote_source_id: remote.id,
        },
      };
    }),
  };
}
