import { describe, expect, it, vi } from 'vitest';
import { fetchMastodonProfile, isMastodonProfileUrl } from './mastodonPublic';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Mastodon public profile adapter', () => {
  it('recognises ordinary Mastodon profile URL shapes', () => {
    expect(isMastodonProfileUrl('https://mastodon.sdf.org/@tregeagle')).toBe(true);
    expect(isMastodonProfileUrl('https://example.social/users/alice')).toBe(true);
    expect(isMastodonProfileUrl('https://micro.blog/davidmarsden')).toBe(false);
    expect(isMastodonProfileUrl('http://mastodon.sdf.org/@tregeagle')).toBe(false);
  });

  it('loads an account and normalises public statuses into read-only Dent Hand items', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
      if (url.pathname === '/api/v1/accounts/lookup') {
        expect(url.searchParams.get('acct')).toBe('tregeagle');
        return response({
          id: '42',
          username: 'tregeagle',
          acct: 'tregeagle',
          display_name: 'Ruben',
          avatar: 'https://mastodon.sdf.org/avatar.png',
          url: 'https://mastodon.sdf.org/@tregeagle',
        });
      }
      expect(url.pathname).toBe('/api/v1/accounts/42/statuses');
      expect(url.searchParams.get('limit')).toBe('40');
      expect(url.searchParams.get('exclude_reblogs')).toBe('true');
      return response([{
        id: '123456',
        url: 'https://mastodon.sdf.org/@tregeagle/123456',
        content: '<p>yes!</p>',
        created_at: '2026-09-13T01:23:00.000Z',
        account: {
          username: 'tregeagle',
          acct: 'tregeagle',
          display_name: 'Ruben',
          avatar: 'https://mastodon.sdf.org/avatar.png',
          url: 'https://mastodon.sdf.org/@tregeagle',
        },
      }]);
    });

    const result = await fetchMastodonProfile('https://mastodon.sdf.org/@tregeagle', {}, fetchImpl);
    expect(result.account).toEqual({
      name: 'Ruben',
      username: 'tregeagle@mastodon.sdf.org',
      avatar: 'https://mastodon.sdf.org/avatar.png',
      url: 'https://mastodon.sdf.org/@tregeagle',
    });
    expect(result.feed.items).toHaveLength(1);
    expect(result.feed.items[0]).toMatchObject({
      id: 'mastodon:mastodon.sdf.org:123456',
      content_html: '<p>yes!</p>',
      author: { name: 'Ruben', username: 'tregeagle@mastodon.sdf.org' },
      _microblog: { source: 'mastodon', remote_id: '123456' },
    });
  });

  it('keeps media-only Mastodon statuses visible to RichContent', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
      if (url.pathname === '/api/v1/accounts/lookup') return response({ id: '42', username: 'alice', acct: 'alice' });
      return response([{
        id: '777',
        content: '',
        account: { username: 'alice', acct: 'alice' },
        media_attachments: [{
          type: 'image',
          url: 'https://example.social/media/original.jpg',
          preview_url: 'https://example.social/media/preview.jpg',
          description: 'A test photograph',
        }],
      }]);
    });

    const result = await fetchMastodonProfile('https://example.social/@alice', {}, fetchImpl);
    expect(result.feed.items[0].content_html).toContain('<img');
    expect(result.feed.items[0].content_html).toContain('https://example.social/media/preview.jpg');
    expect(result.feed.items[0].content_html).toContain('alt="A test photograph"');
  });

  it('uses the underlying remote id for older public statuses', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
      if (url.pathname === '/api/v1/accounts/lookup') return response({ id: '42', username: 'alice', acct: 'alice' });
      expect(url.searchParams.get('max_id')).toBe('999');
      return response([]);
    });

    await fetchMastodonProfile('https://example.social/@alice', { maxId: 'mastodon:example.social:999' }, fetchImpl);
  });
});
