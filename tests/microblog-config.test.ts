import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../netlify/functions/microblog-config';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Micro.blog config categories', () => {
  it('loads categories for the selected destination', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        'media-endpoint': 'https://micro.blog/micropub/media',
        destination: [{ uid: 'https://example.micro.blog/', name: 'Example' }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        categories: ['Southall', 'Local politics'],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(new Request('https://handwritten-publish.test/api/microblog/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'token',
        destination: 'https://example.micro.blog/',
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      mediaEndpoint: 'https://micro.blog/micropub/media',
      destinations: [{ uid: 'https://example.micro.blog/', name: 'Example' }],
      categories: ['Southall', 'Local politics'],
    });

    const categoryUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(categoryUrl.searchParams.get('q')).toBe('category');
    expect(categoryUrl.searchParams.get('mp-destination')).toBe('https://example.micro.blog/');
  });

  it('accepts the richer microblog-categories response shape', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        'media-endpoint': 'https://micro.blog/micropub/media',
        destination: [{ uid: 'https://example.micro.blog/', name: 'Example' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        'microblog-categories': [
          { uid: 11, name: 'Photos', posts_count: 123 },
          { uid: 12, name: 'Travel', posts_count: 45 },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(new Request('https://handwritten-publish.test/api/microblog/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'token', destination: 'https://example.micro.blog/' }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      mediaEndpoint: 'https://micro.blog/micropub/media',
      destinations: [{ uid: 'https://example.micro.blog/', name: 'Example' }],
      categories: ['Photos', 'Travel'],
    });
  });
});
