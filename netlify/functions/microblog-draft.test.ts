import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './microblog-draft';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Micro.blog published URL recovery', () => {
  it('recovers when q=source returns Micro.blog invalid_request 400 for the old draft URL', async () => {
    const canonicalUrl = 'https://example.com/2026/08/26/danger-keep-out.html';
    const pageOne = 'https://example.com/uploads/page-1.png';
    const pageTwo = 'https://example.com/uploads/page-2.png';

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: 'invalid_request',
        error_description: 'The post with the requested URL was not found.',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{
          type: 'h-entry',
          properties: {
            'post-status': ['published'],
            url: [canonicalUrl],
            content: [`<img src="${pageOne}"><img src="${pageTwo}">`],
          },
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('https://handwritten-publish.test/api/microblog/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'token',
        destination: 'https://example.micro.blog/',
        updateUrl: 'https://micro.blog/old-draft-url',
        knownMediaUrls: [pageOne, pageTwo],
        verifyOnly: true,
      }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'published',
      url: canonicalUrl,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(firstUrl.searchParams.get('url')).toBe('https://micro.blog/old-draft-url');

    const recoveryUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(recoveryUrl.searchParams.get('q')).toBe('source');
    expect(recoveryUrl.searchParams.get('mp-destination')).toBe('https://example.micro.blog/');
  });

  it('does not treat unrelated Micro.blog 400 responses as a missing published post', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'invalid_request',
      error_description: 'Some other invalid request.',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('https://handwritten-publish.test/api/microblog/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'token',
        updateUrl: 'https://micro.blog/old-draft-url',
        knownMediaUrls: ['https://example.com/uploads/page-1.png'],
        verifyOnly: true,
      }),
    });

    const response = await handler(request);
    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
