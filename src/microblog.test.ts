import { describe, expect, it } from 'vitest';
import {
  canReuseMicroblogMedia,
  isMicroblogDraftStale,
  microblogAnnotationError,
  microblogContentRevision,
  microblogHtml,
} from './microblog';
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

  it('renders responsive handwritten link overlays and ignores photo placeholders', () => {
    const document = createDocument('Links');
    document.pages = [{
      id: 'a', position: 1, filename: '1.png', mediaType: 'image/png', sha256: 'hash-1', width: 1000, height: 1400,
      annotations: [
        { type: 'link', x: .125, y: .5, width: .25, height: .05, href: 'https://example.com/?a=1&b=2', label: 'Example & more' },
        { type: 'photo', x: .2, y: .2, width: .4, height: .3, assetId: 'future-photo', alt: 'Not published yet' },
      ],
    }];

    const html = microblogHtml(document, ['https://media.example/page.png']);
    expect(html).toContain('style="position:relative;margin:0;display:block"');
    expect(html).toContain('left:12.5%');
    expect(html).toContain('top:50%');
    expect(html).toContain('width:25%');
    expect(html).toContain('height:5%');
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(html).toContain('aria-label="Example &amp; more"');
    expect(html).not.toContain('future-photo');
    expect(html).not.toContain('Not published yet');
  });

  it('requires every published link region to have a safe complete URL', () => {
    const document = createDocument('Incomplete');
    document.pages = [{
      id: 'a', position: 1, filename: '1.png', mediaType: 'image/png', sha256: 'hash-1', width: 1, height: 1,
      annotations: [{ type: 'link', x: .1, y: .2, width: .3, height: .04, href: '   ' }],
    }];
    expect(microblogAnnotationError(document)).toContain('without a URL');

    document.pages[0].annotations = [{ type: 'link', x: .1, y: .2, width: .3, height: .04, href: 'javascript:alert(1)' }];
    expect(microblogAnnotationError(document)).toContain('invalid URL');

    document.pages[0].annotations = [{ type: 'link', x: .1, y: .2, width: .3, height: .04, href: 'https://example.org' }];
    expect(microblogAnnotationError(document)).toBeNull();

    document.pages[0].annotations = [{ type: 'photo', x: .1, y: .2, width: .3, height: .2, assetId: '' }];
    expect(microblogAnnotationError(document)).toBeNull();
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

  it('marks link edits stale but still ignores photo-placeholder-only edits', () => {
    const document = createDocument('Test');
    document.pages = [
      { id: 'a', position: 1, filename: '1.png', mediaType: 'image/png', sha256: 'hash-1', width: 1, height: 1, annotations: [] },
    ];
    const draft: MicroblogDraftState = {
      destination: 'https://example.com/',
      url: 'https://example.com/post.html',
      preview: 'https://micro.blog/preview',
      createdAt: document.createdAt,
      syncedContentRevision: microblogContentRevision(document),
    };

    document.pages[0].annotations.push({ type: 'photo', x: .1, y: .2, width: .3, height: .2, assetId: 'photo-1' });
    expect(isMicroblogDraftStale(document, draft)).toBe(false);

    document.pages[0].annotations.push({ type: 'link', x: .1, y: .2, width: .3, height: .04, href: 'https://example.org' });
    expect(isMicroblogDraftStale(document, draft)).toBe(true);
  });

  it('reuses uploaded media when only link overlays change', () => {
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

    document.pages[0].annotations.push({ type: 'link', x: .1, y: .2, width: .3, height: .04, href: 'https://example.org' });
    expect(canReuseMicroblogMedia(document, draft)).toBe(true);
    draft.pageHashes = ['hash-2', 'hash-1'];
    expect(canReuseMicroblogMedia(document, draft)).toBe(false);
  });
});
