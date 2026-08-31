import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../netlify/functions/southall-research-draft';

const originalNetlify = globalThis.Netlify;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalNetlify) globalThis.Netlify = originalNetlify;
  else delete (globalThis as { Netlify?: unknown }).Netlify;
});

function stubNetlifyEnv(values: Record<string, string>) {
  vi.stubGlobal('Netlify', {
    env: {
      get: (name: string) => values[name],
    },
  });
}

describe('Southall-Research draft destination', () => {
  it('creates a new draft with the Markdown bytes unchanged', async () => {
    stubNetlifyEnv({
      SOUTHALL_RESEARCH_GITHUB_TOKEN: 'github-token',
      SOUTHALL_RESEARCH_WRITE_KEY: 'private-write-key',
    });
    const markdown = '# Draft\n\nCarefully prepared **Markdown**.\n';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        content: { path: 'drafts/test-draft.md', html_url: 'https://github.com/davidmarsden/Southall-Research/blob/main/drafts/test-draft.md', sha: 'content-sha' },
        commit: { html_url: 'https://github.com/davidmarsden/Southall-Research/commit/abc', sha: 'abc' },
      }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(new Request('https://hand.example/api/southall-research/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writeKey: 'private-write-key', filename: 'test-draft.md', markdown }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ saved: true, updated: false, path: 'drafts/test-draft.md' });
    const writeBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(Buffer.from(writeBody.content, 'base64').toString('utf8')).toBe(markdown);
    expect(writeBody).not.toHaveProperty('sha');
    expect(writeBody.branch).toBe('main');
  });

  it('updates an existing draft by supplying its current GitHub sha', async () => {
    stubNetlifyEnv({
      SOUTHALL_RESEARCH_GITHUB_TOKEN: 'github-token',
      SOUTHALL_RESEARCH_WRITE_KEY: 'private-write-key',
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'existing-sha' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: { path: 'drafts/existing.md' }, commit: { sha: 'new-commit' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(new Request('https://hand.example/api/southall-research/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writeKey: 'private-write-key', filename: 'existing.md', markdown: 'Updated draft' }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ saved: true, updated: true });
    const writeBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(writeBody.sha).toBe('existing-sha');
  });

  it('rejects an invalid write key before calling GitHub', async () => {
    stubNetlifyEnv({
      SOUTHALL_RESEARCH_GITHUB_TOKEN: 'github-token',
      SOUTHALL_RESEARCH_WRITE_KEY: 'private-write-key',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(new Request('https://hand.example/api/southall-research/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writeKey: 'wrong-key', filename: 'draft.md', markdown: 'text' }),
    }));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects paths outside the drafts directory', async () => {
    stubNetlifyEnv({
      SOUTHALL_RESEARCH_GITHUB_TOKEN: 'github-token',
      SOUTHALL_RESEARCH_WRITE_KEY: 'private-write-key',
    });
    const response = await handler(new Request('https://hand.example/api/southall-research/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writeKey: 'private-write-key', filename: '../README.md', markdown: 'text' }),
    }));
    expect(response.status).toBe(400);
  });
});
