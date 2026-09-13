import { describe, expect, it, vi } from 'vitest';
import { MastodonSocialClient } from './mastodonSocial';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('MastodonSocialClient', () => {
  it('advertises the read-only Mastodon phase accurately', () => {
    const client = new MastodonSocialClient('/api/test', vi.fn<typeof fetch>());
    expect(client.id).toBe('mastodon');
    expect(client.label).toBe('Mastodon / Fediverse');
    expect(client.capabilities).toMatchObject({
      bookmarks: false,
      mentions: false,
      replies: false,
      conversations: false,
      bookmarking: false,
      replying: false,
      publishing: false,
    });
  });

  it('loads the authenticated account with same-origin credentials', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ username: 'david@example.social' }));
    const client = new MastodonSocialClient('/api/test', fetchImpl);

    await expect(client.account()).resolves.toMatchObject({ username: 'david@example.social' });
    const call = fetchImpl.mock.calls[0];
    expect(String(call?.[0])).toContain('op=account');
    expect(call?.[1]).toMatchObject({ credentials: 'same-origin' });
  });

  it('passes Mastodon paging cursors through the provider bridge', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ items: [] }));
    const client = new MastodonSocialClient('/api/test', fetchImpl);

    await client.timeline({ count: 40, beforeId: 'mastodon:example.social:123', sinceId: 'mastodon:example.social:456' });

    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).toContain('op=timeline');
    expect(url).toContain('count=40');
    expect(url).toContain('before_id=mastodon%3Aexample.social%3A123');
    expect(url).toContain('since_id=mastodon%3Aexample.social%3A456');
  });

  it('surfaces sanitized bridge errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ error: 'Connect a Mastodon account first.' }, 401));
    const client = new MastodonSocialClient('/api/test', fetchImpl);
    await expect(client.timeline()).rejects.toThrow('Connect a Mastodon account first.');
  });
});
