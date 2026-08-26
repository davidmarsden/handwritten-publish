import { describe, expect, it } from 'vitest';
import { createDocument, FORMAT_VERSION, upgradeDocumentFormat } from './model';

describe('createDocument', () => {
  it('creates a versioned portable document with a stable UUID-shaped id', () => {
    const document = createDocument('Morning pages');
    expect(document.format).toBe('handwritten-publish');
    expect(document.version).toBe(FORMAT_VERSION);
    expect(document.title).toBe('Morning pages');
    expect(document.pages).toEqual([]);
    expect(document.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('migrates pre-metadata Micro.blog revision strings without marking unchanged posts stale', () => {
    const document = createDocument('Test');
    const legacyRevision = JSON.stringify({
      renderer: 'microblog-html-v3-durable-link-marker',
      title: 'Test',
      transcript: '',
      pages: [],
    });
    document.publishing = {
      microblog: {
        destination: 'https://example.com/',
        url: 'https://example.com/post',
        preview: 'https://micro.blog/preview',
        createdAt: document.createdAt,
        syncedContentRevision: legacyRevision,
      },
    };

    const upgraded = upgradeDocumentFormat(document);
    expect(JSON.parse(upgraded.publishing!.microblog!.syncedContentRevision!)).toEqual({
      renderer: 'microblog-html-v3-durable-link-marker',
      title: 'Test',
      summary: '',
      categories: [],
      transcript: '',
      pages: [],
    });
  });
});
