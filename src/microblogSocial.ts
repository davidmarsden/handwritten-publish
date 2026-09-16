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

function mergeFeeds(primary: MicroblogFeed, fallback: MicroblogFeed): MicroblogFeed {
  const seen = new Set<string>();
  const items = [...primary.items, ...fallback.items]
    .filter(item => item?.id && !seen.has(item.id) && Boolean(seen.add(item.id)))
    .sort((a, b) => {
      const aTime = a.date_published ? Date.parse(a.date_published) : NaN;
      const bTime = b.date_published ? Date.parse(b.date_published) : NaN;
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
      const aId = /^\d+$/.test(a.id) ? BigInt(a.id) : 0n;
      const bId = /^\d+$/.test(b.id) ? BigInt(b.id) : 0n;
      return aId === bId ? 0 : aId > bId ? -1 : 1;
    });
  return { ...primary, items };
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

  async timeline(paging?: Paging): Promise<MicroblogFeed> {
    const params = new URLSearchParams();
    appendPaging(params, paging);
    return normalizeFeed(await this.request('timeline', {}, params));
  }

  async bookmarks(paging?: Paging): Promise<MicroblogFeed> {
    const params = new URLSearchParams();
    appendPaging(params, paging);
    return normalizeFeed(await this.request('bookmarks', {}, params));
  }

  async mentions(paging?: Paging): Promise<MicroblogFeed> {
    const params = new URLSearchParams();
    appendPaging(params, paging);
    const repliesParams = new URLSearchParams(params);
    const [mentions, replies] = await Promise.all([
      this.request<MicroblogFeed>('mentions', {}, params),
      this.request<MicroblogFeed>('replies', {}, repliesParams).catch(() => ({ items: [] } as MicroblogFeed)),
    ]);
    return mergeFeeds(normalizeFeed(mentions), normalizeFeed(replies));
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
