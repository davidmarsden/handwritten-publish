import type { SocialProvider, SocialProviderCapabilities } from './socialProvider';

export type MicroblogAuthor = {
  name?: string;
  username?: string;
  avatar?: string;
  url?: string;
  _microblog?: {
    username?: string;
    is_following?: boolean;
    [key: string]: unknown;
  };
};

export type MicroblogItem = {
  id: string;
  url?: string;
  content_html?: string;
  content_text?: string;
  date_published?: string;
  author?: MicroblogAuthor;
  _microblog?: {
    is_bookmark?: boolean;
    is_deletable?: boolean;
    date_relative?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type MicroblogFeed = {
  items: MicroblogItem[];
  [key: string]: unknown;
};

export type MicroblogDestination = {
  uid: string;
  name: string;
};

export type MicroblogAccount = {
  name?: string;
  username: string;
  avatar?: string;
  defaultSite?: string;
};

export type Paging = {
  count?: number;
  beforeId?: string;
  sinceId?: string;
};

export type MicroblogSocialClientOptions = {
  token?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
};

const LEGACY_TOKEN_KEY = 'microblog-social-token';
const CIRCLE_KEY = 'dent-hand-circle';
const MAX_TIMELINE_CONVERSATION_ENRICHMENTS = 4;

const MICROBLOG_CAPABILITIES: SocialProviderCapabilities = {
  bookmarks: true,
  mentions: true,
  replies: true,
  conversations: true,
  profiles: true,
  destinations: true,
  bookmarking: true,
  replying: true,
  publishing: true,
};

function clearLegacyBrowserToken(): void {
  try {
    globalThis.sessionStorage?.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    // Storage may be unavailable in tests, private browsing, or non-browser runtimes.
  }
}

function assertId(id: string): string {
  if (!/^\d+$/.test(id)) throw new Error('Micro.blog post id must be numeric.');
  return id;
}

function appendPaging(params: URLSearchParams, paging?: Paging): void {
  if (!paging) return;
  if (paging.count && paging.count > 0) params.set('count', String(Math.trunc(paging.count)));
  if (paging.beforeId) params.set('before_id', assertId(paging.beforeId));
  if (paging.sinceId) params.set('since_id', assertId(paging.sinceId));
}

function validUsername(value?: string): string | undefined {
  const cleaned = value?.trim().replace(/^@/, '');
  return cleaned && /^[A-Za-z0-9_-]{1,64}$/.test(cleaned) ? cleaned : undefined;
}

function usernameFromAuthorUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== 'micro.blog') return undefined;
    const [username] = parsed.pathname.split('/').filter(Boolean);
    return validUsername(username);
  } catch {
    return undefined;
  }
}

function normalizeFeed(feed: MicroblogFeed): MicroblogFeed {
  return {
    ...feed,
    items: Array.isArray(feed.items)
      ? feed.items.map(item => {
          if (!item.author || item.author.username) return item;
          const username = validUsername(item.author._microblog?.username) || usernameFromAuthorUrl(item.author.url);
          return username ? { ...item, author: { ...item.author, username } } : item;
        })
      : [],
  };
}

function canonicalItemUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return undefined;
  }
}

function mergeDistinct(primary: MicroblogFeed, fallbackItems: MicroblogItem[]): MicroblogFeed {
  const seenIds = new Set(primary.items.map(item => item.id));
  const seenUrls = new Set(primary.items.flatMap(item => {
    const url = canonicalItemUrl(item.url);
    return url ? [url] : [];
  }));
  const additions = fallbackItems.filter(item => {
    if (!item?.id || seenIds.has(item.id)) return false;
    const url = canonicalItemUrl(item.url);
    if (url && seenUrls.has(url)) return false;
    seenIds.add(item.id);
    if (url) seenUrls.add(url);
    return true;
  });
  const items = [...primary.items, ...additions].sort((a, b) => {
    const aTime = a.date_published ? Date.parse(a.date_published) : NaN;
    const bTime = b.date_published ? Date.parse(b.date_published) : NaN;
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
    return 0;
  });
  return { ...primary, items };
}

function streamsCircleProfiles(): string[] {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return [];
    const raw = JSON.parse(storage.getItem(CIRCLE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const url = typeof (item as { url?: unknown }).url === 'string' ? (item as { url: string }).url.trim() : '';
      if (!url) return [];
      try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split('/').filter(Boolean);
        return parsed.protocol === 'https:' && parts[0] === 'channel' && parts[1] ? [url] : [];
      } catch {
        return [];
      }
    }))];
  } catch {
    return [];
  }
}

function siteHostname(defaultSite?: string): string | undefined {
  const value = defaultSite?.trim();
  if (!value) return undefined;
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function isBlankChannelItem(item: MicroblogItem): boolean {
  if (!/^\d+$/.test(item.id)) return false;
  if (item.content_text?.trim() || item.content_html?.trim() || item.url) return false;
  const authorUrl = item.author?.url;
  if (!authorUrl) return false;
  try {
    const url = new URL(authorUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    return url.protocol === 'https:' && parts[0] === 'channel' && Boolean(parts[1]);
  } catch {
    return false;
  }
}

function mergeRecoveredItem(original: MicroblogItem, recovered: MicroblogItem): MicroblogItem {
  return {
    ...original,
    ...(recovered.url ? { url: recovered.url } : {}),
    ...(recovered.content_html?.trim() ? { content_html: recovered.content_html } : {}),
    ...(recovered.content_text?.trim() ? { content_text: recovered.content_text } : {}),
    author: {
      ...(recovered.author || {}),
      ...(original.author || {}),
      avatar: original.author?.avatar || recovered.author?.avatar,
      url: original.author?.url || recovered.author?.url,
    },
    _microblog: {
      ...(original._microblog || {}),
      exact_conversation_enriched: true,
    },
  };
}

export class MicroblogSocialClient implements SocialProvider {
  readonly id = 'microblog' as const;
  readonly label = 'Micro.blog';
  readonly auth = {
    startPath: '/api/microblog/auth?op=start',
    signOutPath: '/api/microblog/auth?op=logout',
  } as const;
  readonly capabilities = MICROBLOG_CAPABILITIES;

  private readonly token?: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly conversationEnrichmentCache = new Map<string, MicroblogItem | null>();

  constructor(options: MicroblogSocialClientOptions = {}) {
    clearLegacyBrowserToken();
    this.token = options.token?.trim() || undefined;
    this.endpoint = options.endpoint || '/api/microblog/social';
    this.fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
  }

  private async request<T>(op: string, init: RequestInit = {}, params?: URLSearchParams): Promise<T> {
    const query = params || new URLSearchParams();
    query.set('op', op);
    const response = await this.fetchImpl(`${this.endpoint}?${query.toString()}`, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(init.headers || {}),
      },
    });

    const payload = await response.json().catch(() => ({})) as { error?: string } & T;
    if (!response.ok) throw new Error(payload.error || `Micro.blog request failed (${response.status}).`);
    return payload;
  }

  private async remoteCircleMentions(): Promise<MicroblogItem[]> {
    const profiles = streamsCircleProfiles();
    if (!profiles.length) return [];
    const account = await this.account().catch(() => null);
    if (!account) return [];
    const targetHost = siteHostname(account.defaultSite);
    const results = await Promise.all(profiles.map(async profile => {
      const params = new URLSearchParams({
        profile,
        mode: 'replies',
        microblog_user: account.username,
        ...(targetHost ? { target_host: targetHost } : {}),
      });
      try {
        const response = await this.fetchImpl(`/api/fediverse/public?${params.toString()}`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return [];
        const payload = await response.json() as { feed?: MicroblogFeed };
        return Array.isArray(payload.feed?.items) ? payload.feed.items : [];
      } catch {
        return [];
      }
    }));
    return results.flat();
  }

  async timeline(paging?: Paging): Promise<MicroblogFeed> {
    const params = new URLSearchParams();
    appendPaging(params, paging);
    const timeline = normalizeFeed(await this.request<MicroblogFeed>('timeline', {}, params));
    const blankIds = timeline.items.filter(isBlankChannelItem).map(item => item.id);
    if (!blankIds.length) return timeline;

    const recovered = new Map<string, MicroblogItem>();
    for (const id of blankIds) {
      const cached = this.conversationEnrichmentCache.get(id);
      if (cached) recovered.set(id, cached);
    }

    const idsToFetch = blankIds
      .filter(id => !this.conversationEnrichmentCache.has(id))
      .slice(0, MAX_TIMELINE_CONVERSATION_ENRICHMENTS);

    await Promise.all(idsToFetch.map(async id => {
      try {
        const conversation = normalizeFeed(await this.request<MicroblogFeed>(
          'conversation',
          {},
          new URLSearchParams({ id: assertId(id) }),
        ));
        const exact = conversation.items.find(item => item.id === id);
        const hasBody = Boolean(exact?.content_text?.trim() || exact?.content_html?.trim());
        if (exact && hasBody) {
          this.conversationEnrichmentCache.set(id, exact);
          recovered.set(id, exact);
        } else {
          // URL-only conversation results must remain eligible for the
          // downstream public-feed body fallback.
          this.conversationEnrichmentCache.set(id, null);
        }
      } catch {
        // Timeline loading must not fail because optional enrichment failed.
        // Do not cache transient failures so a later refresh can retry.
      }
    }));

    if (!recovered.size) return timeline;
    return {
      ...timeline,
      items: timeline.items.map(item => {
        const exact = recovered.get(item.id);
        return exact ? mergeRecoveredItem(item, exact) : item;
      }),
    };
  }

  async bookmarks(paging?: Paging): Promise<MicroblogFeed> {
    const params = new URLSearchParams();
    appendPaging(params, paging);
    return normalizeFeed(await this.request('bookmarks', {}, params));
  }

  async mentions(paging?: Paging): Promise<MicroblogFeed> {
    const params = new URLSearchParams();
    appendPaging(params, paging);
    const mentions = normalizeFeed(await this.request<MicroblogFeed>('mentions', {}, params));
    if (paging?.beforeId) return mentions;
    return mergeDistinct(mentions, await this.remoteCircleMentions());
  }

  async replies(paging?: Paging): Promise<MicroblogFeed> {
    const params = new URLSearchParams();
    appendPaging(params, paging);
    return normalizeFeed(await this.request('replies', {}, params));
  }

  async conversation(id: string): Promise<MicroblogFeed> {
    return normalizeFeed(await this.request('conversation', {}, new URLSearchParams({ id: assertId(id) })));
  }

  async profile(username: string, paging?: Paging): Promise<MicroblogFeed> {
    const cleaned = username.trim().replace(/^@/, '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(cleaned)) throw new Error('Invalid Micro.blog username.');
    const params = new URLSearchParams({ username: cleaned });
    appendPaging(params, paging);
    return normalizeFeed(await this.request('profile', {}, params));
  }

  async account(): Promise<MicroblogAccount> {
    const payload = await this.request<Partial<MicroblogAccount>>('account');
    const username = validUsername(payload.username);
    if (!username) throw new Error('Micro.blog did not return an account username.');
    return { ...payload, username };
  }

  async destinations(): Promise<MicroblogDestination[]> {
    const payload = await this.request<{ destinations?: MicroblogDestination[] }>('destinations');
    return Array.isArray(payload.destinations) ? payload.destinations : [];
  }

  async bookmark(id: string): Promise<{ ok?: boolean }> {
    return this.request('bookmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: assertId(id) }),
    });
  }

  async unbookmark(id: string): Promise<{ ok?: boolean }> {
    return this.request('unbookmark', { method: 'DELETE' }, new URLSearchParams({ id: assertId(id) }));
  }

  async reply(id: string, content: string): Promise<{ ok?: boolean; [key: string]: unknown }> {
    const trimmed = content.trim();
    if (!trimmed) throw new Error('Reply content is required.');
    return this.request('reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: assertId(id), content: trimmed }),
    });
  }

  async micropost(content: string, destination: string): Promise<{ ok?: boolean; url?: string | null; preview?: string | null }> {
    const trimmed = content.trim();
    const target = destination.trim();
    if (!trimmed) throw new Error('Micropost content is required.');
    if (!target) throw new Error('Choose a Micro.blog destination before posting.');
    return this.request('micropost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: trimmed, destination: target }),
    });
  }

  async publish(content: string, destination: string): Promise<{ ok?: boolean; url?: string | null; preview?: string | null }> {
    return this.micropost(content, destination);
  }
}
