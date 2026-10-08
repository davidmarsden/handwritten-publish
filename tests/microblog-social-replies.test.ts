import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../netlify/functions/_shared/dent-hand-session', () => ({
  dentHandSessionToken: vi.fn(async () => null),
  updateDentHandSessionToken: vi.fn(async () => {}),
}));
vi.mock('../netlify/functions/_shared/public-usage', () => ({
  publicPublishingDisabledResponse: vi.fn(() => null),
  publicUsageLimitResponse: vi.fn(async () => null),
  recordPublicUsage: vi.fn(async () => {}),
}));

import handler from '../netlify/functions/microblog-social';

const request = (content = 'Hello there') => new Request('https://hand.test/api/microblog/social?op=reply', {
  method: 'POST',
  headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: '456', content }),
});
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});

afterEach(() => vi.unstubAllGlobals());

describe('Micro.blog reply recipient resolution', () => {
  it('uses exact post lookup rather than a conversation participant', async () => {
    const fetchMock = vi.fn<typeof fetch>(async input => {
      const path = String(input);
      if (path.includes('/posts/all/by_id')) return response({ items: [
        { id: '456', author: { _microblog: { username: 'andyc' } } },
      ] });
      if (path.endsWith('/posts/reply')) return response({ ok: true });
      throw new Error('Unexpected URL: ' + path);
    });
    vi.stubGlobal('fetch', fetchMock);
    expect((await handler(request())).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const form = new URLSearchParams(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(form.get('id')).toBe('456');
    expect(form.get('content')).toBe('@andyc Hello there');
  });

  it('falls back to the exact matching conversation item and URL-only author', async () => {
    const fetchMock = vi.fn<typeof fetch>(async input => {
      const path = String(input);
      if (path.includes('/posts/all/by_id')) return response({ error: 'not found' }, 404);
      if (path.includes('/posts/conversation')) return response({ items: [
        { id: '111', author: { username: 'wrongperson' } },
        { id: '456', author: { url: 'https://micro.blog/andyc' } },
      ] });
      if (path.endsWith('/posts/reply')) return response({ ok: true });
      throw new Error('Unexpected URL: ' + path);
    });
    vi.stubGlobal('fetch', fetchMock);
    expect((await handler(request('Hello @andyc!'))).status).toBe(200);
    const form = new URLSearchParams(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(form.get('content')).toBe('Hello @andyc!');
  });

  it('refuses to publish if neither lookup can identify the intended recipient', async () => {
    const fetchMock = vi.fn<typeof fetch>(async input => {
      if (String(input).includes('/posts/all/by_id')) return response({ items: [] });
      if (String(input).includes('/posts/conversation')) return response({ items: [
        { id: '111', author: { username: 'wrongperson' } },
      ] });
      throw new Error('Must not publish an unaddressed reply');
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await handler(request());
    expect(result.status).toBe(502);
    expect((await result.json()).error).toMatch(/No reply was published/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never derives a recipient from an unrelated remote author URL', async () => {
    const fetchMock = vi.fn<typeof fetch>(async input => {
      if (String(input).includes('/posts/all/by_id')) return response({ items: [
        { id: '456', author: { url: 'https://mastodon.social/@andyc' } },
      ] });
      if (String(input).includes('/posts/conversation')) return response({ items: [] });
      throw new Error('Must not publish an unaddressed reply');
    });
    vi.stubGlobal('fetch', fetchMock);
    expect((await handler(request())).status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
