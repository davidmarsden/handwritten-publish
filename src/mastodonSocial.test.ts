import { describe, expect, it, vi } from 'vitest';
import { MastodonSocialClient } from './mastodonSocial';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('MastodonSocialClient', () => {
  it('advertises Mastodon interaction and publishing capabilities', () => {
    const client = new MastodonSocialClient('/api/test', vi.fn<typeof fetch>());
    expect(client.id).toBe('mastodon');
    expect(client.label).toBe('Mastodon / Fediverse');
    expect(client.capabilities).toMatchObject({
      bookmarks: false,
      mentions: false,
      replies: false,
      conversations: false,
      bookmarking: true,
      replying: true,
      publishing: true,
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

  it('posts interaction actions as JSON without exposing a token', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ ok: true }));
    const client = new MastodonSocialClient('/api/test', fetchImpl);

    await client.favourite('opaque-123');
    await client.bookmark('opaque-123');
    await client.boost('opaque-123');

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const [input, init] of fetchImpl.mock.calls) {
      expect(String(input)).toMatch(/op=(favourite|bookmark|boost)/);
      expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
      expect(JSON.parse(String(init?.body))).toEqual({ id: 'opaque-123' });
      expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined();
    }
  });

  it('posts replies and new dents through the server bridge', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ ok: true, url: 'https://example.social/@david/1' }));
    const client = new MastodonSocialClient('/api/test', fetchImpl);

    await client.reply('status-1', 'hello back');
    await client.publish('hello fediverse');

    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('op=reply');
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({ id: 'status-1', content: 'hello back' });
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain('op=publish');
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toEqual({ content: 'hello fediverse' });
  });

  it('surfaces sanitized bridge errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ error: 'Connect a Mastodon account first.' }, 401));
    const client = new MastodonSocialClient('/api/test', fetchImpl);
    await expect(client.timeline()).rejects.toThrow('Connect a Mastodon account first.');
  });
});
