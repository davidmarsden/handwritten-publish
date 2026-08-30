import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../netlify/functions/microblog-markdown-test';

afterEach(() => vi.unstubAllGlobals());

describe('Micro.blog Markdown round-trip test', () => {
  it('creates a draft with raw Markdown and reports an exact source match', async () => {
    const markdown = '# Heading\n\n**bold**';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://example.micro.blog/draft/1', preview: 'https://micro.blog/posts/1' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { content: [markdown] } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(new Request('https://hand.example/api/microblog/markdown-test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'token', destination: 'https://example.micro.blog/', markdown }),
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ matches: true, original: markdown, returned: markdown, returnedShape: 'string' });
    const createBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(createBody.properties.content).toEqual([markdown]);
    expect(createBody.properties['post-status']).toEqual(['draft']);
  });
});
