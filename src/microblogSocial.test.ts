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

  it('recovers an exact blank streams timeline item from its Micro.blog conversation', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = String(input);
      if (url.includes('op=timeline')) return response({
        items: [{
          id: '123',
          date_published: '2026-09-23T10:38:00Z',
          author: {
            name: 'elmussol',
            url: 'https://streams.elsmussols.net/channel/elmussol',
          },
          _microblog: { date_relative: '10:38' },
        }],
      });
      if (url.includes('op=conversation') && url.includes('id=123')) return response({
        items: [
          { id: '122', content_html: '<p>Parent</p>' },
          {
            id: '123',
            url: 'https://streams.elsmussols.net/item/abc',
            content_html: '<p>Recovered exact post</p>',
            author: {
              name: 'elmussol',
              url: 'https://streams.elsmussols.net/channel/elmussol',
            },
          },
        ],
      });
      return response({ items: [] });
    });
    const client = new MicroblogSocialClient({ token: 'abc123', fetchImpl });

    const result = await client.timeline();

    expect(result.items[0]).toMatchObject({
      id: '123',
      url: 'https://streams.elsmussols.net/item/abc',
      content_html: '<p>Recovered exact post</p>',
      _microblog: {
        date_relative: '10:38',
        exact_conversation_enriched: true,
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not substitute a different conversation item for a blank timeline id', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = String(input);
      if (url.includes('op=timeline')) return response({
        items: [{
          id: '123',
          author: {
            name: 'elmussol',
            url: 'https://streams.elsmussols.net/channel/elmussol',
          },
        }],
      });
      return response({
        items: [{ id: '999', content_html: '<p>Wrong post</p>', url: 'https://example.com/wrong' }],
      });
    });
    const client = new MicroblogSocialClient({ fetchImpl });

    const result = await client.timeline();

    expect(result.items[0]).toEqual({
      id: '123',
      author: {
        name: 'elmussol',
        url: 'https://streams.elsmussols.net/channel/elmussol',
      },
    });
  });

  it('keeps timeline loading successful if exact conversation enrichment fails', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = String(input);
      if (url.includes('op=timeline')) return response({
        items: [{
          id: '123',
          author: {
            name: 'elmussol',
            url: 'https://streams.elsmussols.net/channel/elmussol',
          },
        }],
      });
      return response({ error: 'conversation unavailable' }, 502);
    });
    const client = new MicroblogSocialClient({ fetchImpl });

    const result = await client.timeline();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('123');
  });

  it('keeps URL-only conversation recovery eligible for the public-feed body fallback', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = String(input);
      if (url.includes('op=timeline')) return response({
        items: [{
          id: '123',
          author: {
            name: 'elmussol',
            url: 'https://streams.elsmussols.net/channel/elmussol',
          },
        }],
      });
      return response({
        items: [{
          id: '123',
          url: 'https://streams.elsmussols.net/item/abc',
          author: {
            name: 'elmussol',
            url: 'https://streams.elsmussols.net/channel/elmussol',
          },
        }],
      });
    });
    const client = new MicroblogSocialClient({ fetchImpl });

    const result = await client.timeline();

    expect(result.items[0].url).toBeUndefined();
    expect(result.items[0].content_html).toBeUndefined();
    expect(result.items[0]._microblog?.exact_conversation_enriched).toBeUndefined();
  });

  it('caps exact conversation enrichment and reuses cached results', async () => {
    let timelineCalls = 0;
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = String(input);
      if (url.includes('op=timeline')) {
        timelineCalls += 1;
        return response({
          items: Array.from({ length: 6 }, (_, index) => ({
            id: String(100 + index),
            author: {
              name: 'elmussol',
              url: 'https://streams.elsmussols.net/channel/elmussol',
            },
          })),
        });
      }
      const id = new URL(url, 'https://dent.invalid').searchParams.get('id');
      return response({
        items: [{
          id,
          content_html: `<p>Recovered ${id}</p>`,
          author: {
            name: 'elmussol',
            url: 'https://streams.elsmussols.net/channel/elmussol',
          },
        }],
      });
    });
    const client = new MicroblogSocialClient({ fetchImpl });

    const first = await client.timeline();
    expect(first.items.filter(item => item.content_html)).toHaveLength(4);
    expect(fetchImpl.mock.calls.filter(call => String(call[0]).includes('op=conversation'))).toHaveLength(4);

    const second = await client.timeline();
    expect(second.items.filter(item => item.content_html)).toHaveLength(6);
    expect(fetchImpl.mock.calls.filter(call => String(call[0]).includes('op=conversation'))).toHaveLength(6);
    expect(timelineCalls).toBe(2);
  });

  it('loads mentions with paging without mixing in the replies endpoint', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ items: [] }));
    const client = new MicroblogSocialClient({ token: 'abc123', fetchImpl });

    await client.mentions({ count: 20, beforeId: '456' });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    expect(String(call[0])).toContain('op=mentions');
    expect(String(call[0])).toContain('count=20');
    expect(String(call[0])).toContain('before_id=456');
    expect(String(call[0])).not.toContain('op=replies');
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
