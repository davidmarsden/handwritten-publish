import type { MicroblogAccount, MicroblogFeed, Paging } from './microblogSocial';
import type { SocialProvider, SocialProviderCapabilities } from './socialProvider';

const MASTODON_CAPABILITIES: SocialProviderCapabilities = {
  bookmarks: false,
  mentions: false,
  replies: false,
  conversations: false,
  profiles: false,
  destinations: false,
  bookmarking: false,
  replying: false,
  publishing: false,
};

function appendPaging(params: URLSearchParams, paging?: Paging): void {
  if (!paging) return;
  if (paging.count && paging.count > 0) params.set('count', String(Math.trunc(paging.count)));
  if (paging.beforeId) params.set('before_id', paging.beforeId);
  if (paging.sinceId) params.set('since_id', paging.sinceId);
}

export class MastodonSocialClient implements SocialProvider {
  readonly id = 'mastodon' as const;
  readonly label = 'Mastodon / Fediverse';
  readonly auth = {
    startPath: '/api/mastodon/auth?op=start',
    signOutPath: '/api/mastodon/auth?op=logout',
  } as const;
  readonly capabilities = MASTODON_CAPABILITIES;

  constructor(
    private readonly endpoint = '/api/mastodon/social',
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  private async request<T>(op: string, params = new URLSearchParams()): Promise<T> {
    params.set('op', op);
    const response = await this.fetchImpl(`${this.endpoint}?${params.toString()}`, { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({})) as { error?: string } & T;
    if (!response.ok) throw new Error(payload.error || `Mastodon request failed (${response.status}).`);
    return payload;
  }

  account(): Promise<MicroblogAccount> {
    return this.request('account');
  }

  timeline(paging?: Paging): Promise<MicroblogFeed> {
    const params = new URLSearchParams();
    appendPaging(params, paging);
    return this.request('timeline', params);
  }
}
