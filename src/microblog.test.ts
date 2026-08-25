import { describe, expect, it } from 'vitest';
import { canReuseMicroblogMedia, isMicroblogDraftStale, microblogHtml } from './microblog';
import { createDocument, type MicroblogDraftState } from './model';

describe('microblogHtml', () => {
  it('keeps ordered handwritten pages and safely escapes transcript text', () => {
    const document = createDocument('Test');
    document.transcript = '<hello> & goodbye';
    const html = microblogHtml(document, ['https://example.com/1.png', 'https://example.com/2.png']);

    expect(html.indexOf('1.png')).toBeLessThan(html.indexOf('2.png'));
    expect(html).toContain('alt="Handwritten page 1 of 2"');
    expect(html).toContain('&lt;hello&gt; &amp; goodbye');
    expect(html).not.toContain('<hello>');
  });
});

describe('Micro.blog draft sync state', () => {
  it('marks a legacy or older draft stale', () => {
    const document = createDocument('Test');
    const draft: MicroblogDraftState = {
      destination: 'https://example.com/',
      url: 'https://example.com/post.html',
      preview: 'https://micro.blog/preview',
      createdAt: document.createdAt,
    };

    expect(isMicroblogDraftStale(document, draft)).toBe(true);
    draft.syncedDocumentUpdatedAt = document.updatedAt;
    expect(isMicroblogDraftStale(document, draft)).toBe(false);
  });

  it('reuses uploaded media only when ordered page hashes still match', () => {
    const document = createDocument('Test');
    document.pages = [
      { id: 'a', position: 1, filename: '1.png', mediaType: 'image/png', sha256: 'hash-1', width: 1, height: 1, annotations: [] },
      { id: 'b', position: 2, filename: '2.png', mediaType: 'image/png', sha256: 'hash-2', width: 1, height: 1, annotations: [] },
    ];
    const draft: MicroblogDraftState = {
      destination: 'https://example.com/',
      url: 'https://example.com/post.html',
      preview: 'https://micro.blog/preview',
      createdAt: document.createdAt,
      pageHashes: ['hash-1', 'hash-2'],
      mediaUrls: ['https://example.com/1.png', 'https://example.com/2.png'],
    };

    expect(canReuseMicroblogMedia(document, draft)).toBe(true);
    draft.pageHashes = ['hash-2', 'hash-1'];
    expect(canReuseMicroblogMedia(document, draft)).toBe(false);
  });
});
