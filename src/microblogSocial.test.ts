import { describe, expect, it, vi } from 'vitest';
import { MicroblogSocialClient } from './microblogSocial';
import type { SocialProvider } from './socialProvider';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('MicroblogSocialClient', () => {
  it('implements the Dent Hand social provider contract', () => {
    const provider: SocialProvider = new MicroblogSocialClient({ fetchImpl: vi.fn<typeof fetch>() });

    expect(provider.id).toBe('microblog');
    expect(provider.label).toBe('Micro.blog');
    expect(provider.auth).toEqual({
      startPath: '/api/microblog/auth?op=start',
      signOutPath: '/api/microblog/auth?op=logout',
    });
    expect(provider.capabilities).toEqual({
      bookmarks: true,
      mentions: true,
      replies: true,
      conversations: true,
      profiles: true,
      destinations: true,
      bookmarking: true,
      replying: true,
      publishing: true,
    });
  });

  it('loads the timeline with paging and bearer auth', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ items: [] }));
    const client = new MicroblogSocialClient({ token: 'abc123', fetchImpl });

    await client.timeline({ count: 20, beforeId: '123' });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call;
    expect(String(url)).toContain('op=timeline');
    expect(String(url)).toContain('count=20');
    expect(String(url)).toContain('before_id=123');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer abc123' });
  });

  it('loads mentions with paging', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ items: [] }));
    const client = new MicroblogSocialClient({ token: 'abc123', fetchImpl });

    await client.mentions({ count: 20, beforeId: '456' });

    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    expect(String(call[0])).toContain('op=mentions');
    expect(String(call[0])).toContain('count=20');
    expect(String(call[0])).toContain('before_id=456');
  });

  it('promotes nested Micro.blog usernames into the author model', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({
      items: [{ id: '1', author: { name: 'Claire', _microblog: { username: 'claire' } } }],
    }));
    const client = new MicroblogSocialClient({ token: 'abc123', fetchImpl });

    const result = await client.timeline();
    expect(result.items[0]?.author?.username).toBe('claire');
  });

  it('uses Micro.blog author URLs as a username fallback', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({
      items: [{ id: '1', author: { name: 'Claire', url: 'https://micro.blog/claire' } }],
    }));
    const client = new MicroblogSocialClient({ token: 'abc123', fetchImpl });

    const result = await client.timeline();
    expect(result.items[0]?.author?.username).toBe('claire');
  });

  it('does not invent Micro.blog usernames from remote fediverse URLs', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({
      items: [{ id: '1', author: { name: 'Remote', url: 'https://mastodon.social/@remote' } }],
    }));
    const client = new MicroblogSocialClient({ token: 'abc123', fetchImpl });

    const result = await client.timeline();
    expect(result.items[0]?.author?.username).toBeUndefined();
    expect(result.items[0]?.author?.url).toBe('https://mastodon.social/@remote');
  });

  it('loads the authenticated account identity', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({
      name: 'David Marsden',
      username: 'davidmarsden',
      avatar: 'https://micro.blog/davidmarsden/avatar.jpg',
      defaultSite: 'davidmarsden.info',
      token: 'refreshed-token',
    }));
    const client = new MicroblogSocialClient({ token: 'abc123', fetchImpl });

    await expect(client.account()).resolves.toMatchObject({
      username: 'davidmarsden',
      defaultSite: 'davidmarsden.info',
      token: 'refreshed-token',
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('op=account');
  });

  it('loads explicit publishing destinations', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ destinations: [{ uid: 'https://example.com/', name: 'Example' }] }));
    const client = new MicroblogSocialClient({ token: 'abc123', fetchImpl });

    await expect(client.destinations()).resolves.toEqual([{ uid: 'https://example.com/', name: 'Example' }]);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('op=destinations');
  });

  it('routes replies through the explicit reply operation', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ ok: true }));
    const client = new MicroblogSocialClient({ token: 'abc123', fetchImpl });

    await client.reply('456', 'Hello there');

    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call;
    expect(String(url)).toContain('op=reply');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ id: '456', content: 'Hello there' });
  });

  it('requires an explicit destination for microposts', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = new MicroblogSocialClient({ token: 'abc123', fetchImpl });

    await expect(client.micropost('Hello world', '')).rejects.toThrow('Choose a Micro.blog destination');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends microposts with the chosen destination', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ ok: true, url: 'https://example.com/hello' }));
    const client = new MicroblogSocialClient({ token: 'abc123', fetchImpl });

    await client.micropost('Hello world', 'https://example.com/');

    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call;
    expect(String(url)).toContain('op=micropost');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ content: 'Hello world', destination: 'https://example.com/' });
  });

  it('exposes neutral publish through the same Micro.blog micropost operation', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ ok: true, url: 'https://example.com/hello' }));
    const provider: SocialProvider = new MicroblogSocialClient({ token: 'abc123', fetchImpl });

    await provider.publish?.('Hello world', 'https://example.com/');

    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call;
    expect(String(url)).toContain('op=micropost');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ content: 'Hello world', destination: 'https://example.com/' });
  });

  it('refuses malformed post ids before making a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = new MicroblogSocialClient({ token: 'abc123', fetchImpl });

    await expect(client.conversation('../oops')).rejects.toThrow('must be numeric');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('surfaces sanitized bridge errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ error: 'Micro.blog request failed.' }, 502));
    const client = new MicroblogSocialClient({ token: 'abc123', fetchImpl });

    await expect(client.bookmarks()).rejects.toThrow('Micro.blog request failed.');
  });
});
