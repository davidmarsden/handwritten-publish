export type MicroblogAuthor = {
  name?: string;
  username?: string;
  avatar?: string;
  url?: string;
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

export type Paging = {
  count?: number;
  beforeId?: string;
  sinceId?: string;
};

export type MicroblogSocialClientOptions = {
  token: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
};

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

function usernameFromAuthorUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== 'micro.blog') return undefined;
    const [username] = parsed.pathname.split('/').filter(Boolean);
    return username && /^[A-Za-z0-9_-]{1,64}$/.test(username) ? username : undefined;
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
          const username = usernameFromAuthorUrl(item.author.url);
          return username ? { ...item, author: { ...item.author, username } } : item;
        })
      : [],
  };
}

export class MicroblogSocialClient {
  private readonly token: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MicroblogSocialClientOptions) {
    if (!options.token.trim()) throw new Error('A Micro.blog token is required.');
    this.token = options.token.trim();
    this.endpoint = options.endpoint || '/api/microblog/social';
    this.fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
  }

  private async request<T>(op: string, init: RequestInit = {}, params?: URLSearchParams): Promise<T> {
    const query = params || new URLSearchParams();
    query.set('op', op);
    const response = await this.fetchImpl(`${this.endpoint}?${query.toString()}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
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
}
