import { describe, expect, it } from 'vitest';
import { isMicroblogDraftStale, microblogContentRevision } from './microblog';
import { createDocument, type MicroblogDraftState } from './model';

function syncedDraft(document: ReturnType<typeof createDocument>): MicroblogDraftState {
  return {
    destination: 'https://example.micro.blog/',
    url: 'https://micro.blog/draft/123',
    preview: 'https://micro.blog/preview/123',
    createdAt: document.createdAt,
    syncedContentRevision: microblogContentRevision(document),
  };
}

describe('Micro.blog post metadata sync state', () => {
  it('marks summary edits stale', () => {
    const document = createDocument('Metadata');
    document.summary = 'Before';
    const draft = syncedDraft(document);

    document.summary = 'After';
    expect(isMicroblogDraftStale(document, draft)).toBe(true);
  });

  it('marks category edits stale but ignores category ordering', () => {
    const document = createDocument('Metadata');
    document.categories = ['Southall', 'Local politics'];
    const draft = syncedDraft(document);

    document.categories = ['Local politics', 'Southall'];
    expect(isMicroblogDraftStale(document, draft)).toBe(false);

    document.categories.push('Environment');
    expect(isMicroblogDraftStale(document, draft)).toBe(true);
  });
});
