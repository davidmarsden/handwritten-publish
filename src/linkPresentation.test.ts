import { describe, expect, it } from 'vitest';
import { createDocument, type MicroblogDraftState } from './model';
import { isMicroblogDraftStale, microblogContentRevision, microblogHtml } from './microblog';

describe('published handwritten link presentation', () => {
  it('renders a visible, labelled clickable region without changing link geometry', () => {
    const document = createDocument('Visible link');
    document.pages = [{
      id: 'page-1',
      position: 1,
      filename: 'page.png',
      mediaType: 'image/png',
      sha256: 'page-hash',
      width: 1000,
      height: 1400,
      annotations: [{
        type: 'link',
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.04,
        href: 'https://example.com/',
        label: 'Read more',
      }],
    }];

    const html = microblogHtml(document, ['https://media.example/page.png']);

    expect(html).toContain('left:10%');
    expect(html).toContain('top:20%');
    expect(html).toContain('width:30%');
    expect(html).toContain('height:4%');
    expect(html).toContain('background:rgba(29,95,167,.12)');
    expect(html).toContain('box-shadow:inset 0 -2px 0 rgba(29,95,167,.8)');
    expect(html).toContain('outline:1px solid rgba(29,95,167,.28)');
    expect(html).toContain('cursor:pointer');
    expect(html).toContain('aria-label="Read more"');
    expect(html).toContain('title="Read more"');
  });

  it('marks drafts rendered by the previous HTML revision stale', () => {
    const document = createDocument('Renderer revision');
    const currentRevision = microblogContentRevision(document);
    const previousRevision = currentRevision.replace('microblog-html-v2-visible-links', 'microblog-html-v1');
    const draft: MicroblogDraftState = {
      destination: 'https://example.com/',
      url: 'https://example.com/post.html',
      preview: 'https://micro.blog/preview',
      createdAt: document.createdAt,
      syncedContentRevision: previousRevision,
    };

    expect(currentRevision).toContain('microblog-html-v2-visible-links');
    expect(isMicroblogDraftStale(document, draft)).toBe(true);
  });
});
