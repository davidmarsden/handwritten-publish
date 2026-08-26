import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocument, type MicroblogDraftState } from './model';
import { inspectMicroblogPost, updateMicroblogDraft } from './microblog';

afterEach(() => {
  vi.unstubAllGlobals();
});

function trackedPost(): MicroblogDraftState {
  return {
    destination: 'https://example.com/',
    url: 'https://micro.blog/old-draft-url',
    preview: 'https://micro.blog/old-preview',
    createdAt: '2026-08-26T00:00:00.000Z',
    postStatus: 'draft',
    mediaUrls: [
      'https://example.com/uploads/page-1.png',
      'https://example.com/uploads/page-2.png',
    ],
    pageHashes: ['hash-1', 'hash-2'],
  };
}

describe('published Micro.blog URL recovery', () => {
  it('sends tracked media fingerprints and persists a recovered URL during read-only inspection', async () => {
    const canonicalUrl = 'https://example.com/2026/08/26/published.html';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'published',
      url: canonicalUrl,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const tracked = trackedPost();
    await expect(inspectMicroblogPost('token', tracked)).resolves.toBe('published');

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.verifyOnly).toBe(true);
    expect(request.updateUrl).toBe('https://micro.blog/old-draft-url');
    expect(request.knownMediaUrls).toEqual([
      'https://example.com/uploads/page-1.png',
      'https://example.com/uploads/page-2.png',
    ]);
    expect(tracked.url).toBe(canonicalUrl);
    expect(tracked.preview).toBe(canonicalUrl);
    expect(tracked.postStatus).toBe('published');
  });

  it('persists the recovered canonical URL returned by a published update', async () => {
    const canonicalUrl = 'https://example.com/2026/08/26/published.html';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      updated: true,
      status: 'published',
      url: canonicalUrl,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const document = createDocument('Published post');
    document.pages = [
      { id: 'page-1', position: 1, filename: '1.png', mediaType: 'image/png', sha256: 'hash-1', width: 1, height: 1, annotations: [] },
      { id: 'page-2', position: 2, filename: '2.png', mediaType: 'image/png', sha256: 'hash-2', width: 1, height: 1, annotations: [] },
    ];

    const result = await updateMicroblogDraft(
      'token',
      document,
      trackedPost(),
      ['https://example.com/uploads/page-1.png', 'https://example.com/uploads/page-2.png'],
      [],
      'published',
    );

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.expectedPostStatus).toBe('published');
    expect(request.knownMediaUrls).toEqual(trackedPost().mediaUrls);
    expect(result.url).toBe(canonicalUrl);
    expect(result.preview).toBe(canonicalUrl);
    expect(result.postStatus).toBe('published');
  });
});
