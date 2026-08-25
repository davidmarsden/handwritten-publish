import { describe, expect, it } from 'vitest';
import { initialDocument, updateDocument } from './document';

describe('updateDocument', () => {
  it('preserves source identity while content changes', () => {
    const original = initialDocument('Morning pages');
    const updated = updateDocument(original, { title: 'Morning pages edited', pages: [] });
    expect(updated.id).toBe(original.id);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.title).toBe('Morning pages edited');
  });
});
