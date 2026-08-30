import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../netlify/functions/microblog-markdown';

afterEach(() => vi.unstubAllGlobals());

describe('Markdown Hand publishing', () => {
  it('creates a draft with raw Markdown and verifies an exact source match', async () => {
    const markdown = '# Heading\n\n**bold**';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://example.micro.blog/draft/1', preview: 'https://micro.blog/posts/1' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { content: [markdown] } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(new Request('https://hand.example/api/microblog/markdown', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'token', destination: 'https://example.micro.blog/', markdown, title: 'Test', categories: ['Notes'], summary: 'Summary' }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ created: true, verified: true, matches: true, returnedShape: 'string', status: 'draft' });
    const createBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(createBody.properties.content).toEqual([markdown]);
    expect(createBody.properties.name).toEqual(['Test']);
    expect(createBody.properties.category).toEqual(['Notes']);
    expect(createBody.properties.summary).toEqual(['Summary']);
    expect(createBody.properties['post-status']).toEqual(['draft']);
  });

  it('publishes only when explicitly requested while preserving raw Markdown', async () => {
    const markdown = 'Carefully prepared *Markdown*.';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://example.micro.blog/2026/post/' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { content: [markdown] } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(new Request('https://hand.example/api/microblog/markdown', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'token', markdown, status: 'published' }),
    }));

    expect(response.status).toBe(200);
    const createBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(createBody.properties.content).toEqual([markdown]);
    expect(createBody.properties['post-status']).toEqual(['published']);
  });

  it('preserves the created post URL when verification has a transport failure', async () => {
    const markdown = '# Still created';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://example.micro.blog/draft/transport', preview: 'https://micro.blog/posts/transport' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(new Request('https://hand.example/api/microblog/markdown', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'token', markdown }),
    }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      created: true,
      verified: false,
      url: 'https://example.micro.blog/draft/transport',
      preview: 'https://micro.blog/posts/transport',
      status: 'draft',
    });
  });
});
