import { describe, expect, it } from 'vitest';
import { createDocument, type MicroblogDraftState } from './model';
import { isMicroblogDraftStale, microblogContentRevision, microblogHtml } from './microblog';

describe('published handwritten link presentation', () => {
  it('renders a durable visible, labelled clickable region without changing link geometry', () => {
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
    expect(html).toContain('class="handwritten-link"');
    expect(html).toContain('box-sizing:border-box');
    expect(html).toContain('border:2px solid rgba(29,95,167,.72)');
    expect(html).toContain('class="handwritten-link-marker"');
    expect(html).toContain('>↗</span>');
    expect(html).not.toContain('background:rgba(29,95,167,.12)');
    expect(html).not.toContain('box-shadow:');
    expect(html).not.toContain('outline:');
    expect(html).toContain('cursor:pointer');
    expect(html).toContain('aria-label="Read more"');
    expect(html).toContain('title="Read more"');
  });

  it('marks drafts rendered by the previous HTML revision stale', () => {
    const document = createDocument('Renderer revision');
    const currentRevision = microblogContentRevision(document);
    const previousRevision = currentRevision.replace('microblog-html-v3-durable-link-marker', 'microblog-html-v2-visible-links');
    const draft: MicroblogDraftState = {
      destination: 'https://example.com/',
      url: 'https://example.com/post.html',
      preview: 'https://micro.blog/preview',
      createdAt: document.createdAt,
      syncedContentRevision: previousRevision,
    };

    expect(currentRevision).toContain('microblog-html-v3-durable-link-marker');
    expect(isMicroblogDraftStale(document, draft)).toBe(true);
  });

  it('forces legacy tracked drafts through the renderer migration once', () => {
    const document = createDocument('Legacy renderer');
    const draft: MicroblogDraftState = {
      destination: 'https://example.com/',
      url: 'https://example.com/post.html',
      preview: 'https://micro.blog/preview',
      createdAt: document.createdAt,
      syncedDocumentUpdatedAt: document.updatedAt,
    };

    expect(isMicroblogDraftStale(document, draft)).toBe(true);
    draft.syncedContentRevision = microblogContentRevision(document);
    expect(isMicroblogDraftStale(document, draft)).toBe(false);
  });
});
