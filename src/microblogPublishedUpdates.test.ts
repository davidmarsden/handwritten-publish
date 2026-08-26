import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectMicroblogPost, updateMicroblogDraft } from './microblog';
import { createDocument, type MicroblogDraftState } from './model';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('published Micro.blog updates', () => {
  it('inspects the tracked post status without mutating it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'published' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const draft: MicroblogDraftState = {
      destination: 'https://example.com/',
      url: 'https://example.com/post.html',
      preview: 'https://micro.blog/preview',
      createdAt: new Date().toISOString(),
    };

    await expect(inspectMicroblogPost('token', draft)).resolves.toBe('published');
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({
      verifyOnly: true,
      updateUrl: draft.url,
      destination: draft.destination,
    });
    expect(request).not.toHaveProperty('title');
    expect(request).not.toHaveProperty('html');
  });

  it('opts into a published update explicitly and preserves published state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ updated: true, status: 'published' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const document = createDocument('Published update');
    document.pages = [{
      id: 'page-1',
      position: 1,
      filename: 'page.png',
      mediaType: 'image/png',
      sha256: 'page-hash',
      width: 1000,
      height: 1400,
      annotations: [],
    }];
    const draft: MicroblogDraftState = {
      destination: 'https://example.com/',
      url: 'https://example.com/post.html',
      preview: 'https://micro.blog/preview',
      createdAt: document.createdAt,
      postStatus: 'published',
    };

    const result = await updateMicroblogDraft(
      'token',
      document,
      draft,
      ['https://media.example/page.png'],
      [],
      'published',
    );

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.expectedPostStatus).toBe('published');
    expect(request.updateUrl).toBe(draft.url);
    expect(request).not.toHaveProperty('post-status');
    expect(result.postStatus).toBe('published');
    expect(result.url).toBe(draft.url);
  });

  it('keeps draft as the update default for backward safety', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ updated: true, status: 'draft' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const document = createDocument('Draft update');
    document.pages = [{
      id: 'page-1',
      position: 1,
      filename: 'page.png',
      mediaType: 'image/png',
      sha256: 'page-hash',
      width: 1000,
      height: 1400,
      annotations: [],
    }];
    const draft: MicroblogDraftState = {
      destination: 'https://example.com/',
      url: 'https://example.com/post.html',
      preview: 'https://micro.blog/preview',
      createdAt: document.createdAt,
    };

    const result = await updateMicroblogDraft('token', document, draft, ['https://media.example/page.png']);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.expectedPostStatus).toBe('draft');
    expect(result.postStatus).toBe('draft');
  });
});
