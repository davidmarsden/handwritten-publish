import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../public/bum/index.html', import.meta.url), 'utf8');

describe('BUM Hand audio picker', () => {
  it('lets the browser expose audio files even when Android reports an unexpected audio MIME type', () => {
    expect(html).toContain('audio/*');
    expect(html).toContain('.m4a');
    expect(html).toContain('.mp3');
  });
});
