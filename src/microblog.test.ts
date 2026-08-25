import { describe, expect, it } from 'vitest';
import {
  canReuseMicroblogMedia,
  isMicroblogDraftStale,
  microblogAnnotationError,
  microblogContentRevision,
  microblogHtml,
  microblogPhotoAssetIds,
  reusableMicroblogPhotoUrl,
} from './microblog';
import { createDocument, type MicroblogDraftState } from './model';

describe('microblogHtml', () => {
  it('keeps ordered handwritten pages and safely escapes transcript text', () => {
    const document = createDocument('Test');
    document.transcript = '<hello> & goodbye';
    document.pages = [
      { kind: 'handwritten', id: 'a', position: 1, filename: '1.png', mediaType: 'image/png', sha256: 'hash-1', width: 1000, height: 1400, annotations: [] },
      { kind: 'handwritten', id: 'b', position: 2, filename: '2.png', mediaType: 'image/png', sha256: 'hash-2', width: 1000, height: 1400, annotations: [] },
    ];
    const html = microblogHtml(document, ['https://example.com/1.png', 'https://example.com/2.png']);

    expect(html.indexOf('1.png')).toBeLessThan(html.indexOf('2.png'));
    expect(html).toContain('alt="Handwritten page 1 of 2"');
    expect(html).toContain('&lt;hello&gt; &amp; goodbye');
    expect(html).not.toContain('<hello>');
  });

  it('renders responsive link and photo overlays with escaped metadata', () => {
    const document = createDocument('Overlays');
    document.assets = [{ id: 'photo-1', filename: 'garden.jpg', mediaType: 'image/jpeg', sha256: 'photo-hash', width: 1200, height: 900 }];
    document.pages = [{
      id: 'a', position: 1, filename: '1.png', mediaType: 'image/png', sha256: 'hash-1', width: 1000, height: 1400,
      annotations: [
        { type: 'link', x: .125, y: .5, width: .25, height: .05, href: 'https://example.com/?a=1&b=2', label: 'Example & more' },
        { type: 'photo', x: .2, y: .2, width: .4, height: .3, assetId: 'photo-1', alt: 'Garden & statue' },
      ],
    }];

    const html = microblogHtml(
      document,
      ['https://media.example/page.png'],
      { 'photo-1': 'https://media.example/garden.jpg?a=1&b=2' },
    );
    expect(html).toContain('style="position:relative;margin:0;display:block"');
    expect(html).toContain('left:12.5%');
    expect(html).toContain('top:50%');
    expect(html).toContain('width:25%');
    expect(html).toContain('height:5%');
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(html).toContain('aria-label="Example &amp; more"');
    expect(html).toContain('src="https://media.example/garden.jpg?a=1&amp;b=2"');
    expect(html).toContain('alt="Garden &amp; statue"');
    expect(html).toContain('object-fit:cover');
  });

  it('renders standalone photo pages in document order with alt text', () => {
    const document = createDocument('Mixed pages');
    document.pages = [
      { kind: 'handwritten', id: 'a', position: 1, filename: '1.png', mediaType: 'image/png', sha256: 'hash-1', width: 1000, height: 1400, annotations: [] },
      { kind: 'photo', id: 'b', position: 2, filename: 'garden.jpg', mediaType: 'image/jpeg', sha256: 'hash-photo', width: 1200, height: 900, annotations: [], alt: 'Garden & statue' },
      { kind: 'handwritten', id: 'c', position: 3, filename: '2.png', mediaType: 'image/png', sha256: 'hash-2', width: 1000, height: 1400, annotations: [] },
    ];

    const html = microblogHtml(document, [
      'https://media.example/1.png',
      'https://media.example/garden.jpg',
      'https://media.example/2.png',
    ]);

    expect(html.indexOf('/1.png')).toBeLessThan(html.indexOf('/garden.jpg'));
    expect(html.indexOf('/garden.jpg')).toBeLessThan(html.indexOf('/2.png'));
    expect(html).toContain('class="photo-page"');
    expect(html).toContain('alt="Garden &amp; statue"');
  });

  it('serializes the same canonical URL that validation accepts', () => {
    const document = createDocument('Canonical');
    document.pages = [{
      id: 'a', position: 1, filename: '1.png', mediaType: 'image/png', sha256: 'hash-1', width: 1, height: 1,
      annotations: [{ type: 'link', x: .1, y: .2, width: .3, height: .04, href: 'https:example.com' }],
    }];

    expect(microblogAnnotationError(document)).toBeNull();
    const html = microblogHtml(document, ['https://media.example/page.png']);
    expect(html).toContain('href="https://example.com/"');
    expect(html).not.toContain('href="https:example.com"');
  });

  it('requires publishable links and bound photo assets before syncing', () => {
    const document = createDocument('Incomplete');
    document.pages = [{
      id: 'a', position: 1, filename: '1.png', mediaType: 'image/png', sha256: 'hash-1', width: 1, height: 1,
      annotations: [{ type: 'link', x: .1, y: .2, width: .3, height: .04, href: '   ' }],
    }];
    expect(microblogAnnotationError(document)).toContain('without a URL');

    document.pages[0].annotations = [{ type: 'link', x: .1, y: .2, width: .3, height: .04, href: 'javascript:alert(1)' }];
    expect(microblogAnnotationError(document)).toContain('invalid URL');

    document.pages[0].annotations = [{ type: 'photo', x: .1, y: .2, width: .3, height: .2, assetId: '' }];
    expect(microblogAnnotationError(document)).toContain('without a photo');

    document.pages[0].annotations = [{ type: 'photo', x: .1, y: .2, width: .3, height: .2, assetId: 'missing' }];
    expect(microblogAnnotationError(document)).toContain('missing from this document');

    document.assets = [{ id: 'photo-1', filename: 'photo.jpg', mediaType: 'image/jpeg', sha256: 'photo-hash', width: 1, height: 1 }];
    document.pages[0].annotations = [{ type: 'photo', x: .1, y: .2, width: .3, height: .2, assetId: 'photo-1' }];
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

  it('marks link and photo composition edits stale', () => {
    const document = createDocument('Test');
    document.assets = [{ id: 'photo-1', filename: 'photo.jpg', mediaType: 'image/jpeg', sha256: 'photo-hash', width: 1, height: 1 }];
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
    expect(isMicroblogDraftStale(document, draft)).toBe(true);

    draft.syncedContentRevision = microblogContentRevision(document);
    const photo = document.pages[0].annotations[0];
    if (photo.type === 'photo') photo.alt = 'Updated alt';
    expect(isMicroblogDraftStale(document, draft)).toBe(true);
  });

  it('marks standalone photo order and alt edits stale while reusing unchanged media', () => {
    const document = createDocument('Mixed');
    document.pages = [
      { kind: 'handwritten', id: 'a', position: 1, filename: '1.png', mediaType: 'image/png', sha256: 'hash-1', width: 1, height: 1, annotations: [] },
      { kind: 'photo', id: 'b', position: 2, filename: 'photo.jpg', mediaType: 'image/jpeg', sha256: 'photo-hash', width: 1, height: 1, annotations: [], alt: 'Before' },
    ];
    const draft: MicroblogDraftState = {
      destination: 'https://example.com/',
      url: 'https://example.com/post.html',
      preview: 'https://micro.blog/preview',
      createdAt: document.createdAt,
      pageHashes: ['hash-1', 'photo-hash'],
      mediaUrls: ['https://media.example/1.png', 'https://media.example/photo.jpg'],
      syncedContentRevision: microblogContentRevision(document),
    };

    const photoPage = document.pages[1];
    if (photoPage.kind === 'photo') photoPage.alt = 'After';
    expect(isMicroblogDraftStale(document, draft)).toBe(true);
    expect(canReuseMicroblogMedia(document, draft)).toBe(true);

    document.pages.reverse();
    expect(isMicroblogDraftStale(document, draft)).toBe(true);
    expect(canReuseMicroblogMedia(document, draft)).toBe(false);
  });

  it('reuses page media when only overlays change', () => {
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

  it('uploads each referenced overlay photo once and reuses matching published photo media', () => {
    const document = createDocument('Photos');
    const asset = { id: 'photo-1', filename: 'photo.jpg', mediaType: 'image/jpeg' as const, sha256: 'photo-hash', width: 1, height: 1 };
    document.assets = [asset];
    document.pages = [
      { id: 'a', position: 1, filename: '1.png', mediaType: 'image/png', sha256: 'hash-1', width: 1, height: 1, annotations: [
        { type: 'photo', x: .1, y: .2, width: .3, height: .2, assetId: 'photo-1' },
        { type: 'photo', x: .5, y: .6, width: .3, height: .2, assetId: 'photo-1' },
      ] },
    ];
    const draft: MicroblogDraftState = {
      destination: 'https://example.com/',
      url: 'https://example.com/post.html',
      preview: 'https://micro.blog/preview',
      createdAt: document.createdAt,
      photoMedia: [{ assetId: 'photo-1', sha256: 'photo-hash', url: 'https://media.example/photo.jpg' }],
    };

    expect(microblogPhotoAssetIds(document)).toEqual(['photo-1']);
    expect(reusableMicroblogPhotoUrl(draft, asset)).toBe('https://media.example/photo.jpg');
    expect(reusableMicroblogPhotoUrl({ ...draft, photoMedia: [{ ...draft.photoMedia![0], sha256: 'old-hash' }] }, asset)).toBeNull();
  });
});
