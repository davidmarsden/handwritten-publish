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

  it('loads an account and normalises public statuses into Dent Hand items', async () => {
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
      id: '123456',
      content_html: '<p>yes!</p>',
      author: { name: 'Ruben', username: 'tregeagle@mastodon.sdf.org' },
    });
  });

  it('uses max_id for older public statuses', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
      if (url.pathname === '/api/v1/accounts/lookup') return response({ id: '42', username: 'alice', acct: 'alice' });
      expect(url.searchParams.get('max_id')).toBe('999');
      return response([]);
    });

    await fetchMastodonProfile('https://example.social/@alice', { maxId: '999' }, fetchImpl);
  });
});
