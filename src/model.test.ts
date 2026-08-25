import { describe, expect, it } from 'vitest';
import { createDocument, FORMAT_VERSION } from './model';

describe('createDocument', () => {
  it('creates a versioned portable document with a stable UUID-shaped id', () => {
    const document = createDocument('Morning pages');
    expect(document.format).toBe('handwritten-publish');
    expect(document.version).toBe(FORMAT_VERSION);
    expect(document.title).toBe('Morning pages');
    expect(document.pages).toEqual([]);
    expect(document.id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
