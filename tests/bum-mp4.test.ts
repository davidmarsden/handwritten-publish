import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../public/bum/bum.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/bum/index.html', import.meta.url), 'utf8');

describe('BUM Hand MP4 support', () => {
  it('classifies MP4 video by MIME type or filename and streams it', () => {
    expect(source).toContain("const VIDEO_TYPES = new Set(['video/mp4'])");
    expect(source).toContain("if (type === 'video/mp4') return 'video/mp4'");
    expect(source).toContain("if (file.name.toLowerCase().endsWith('.mp4')) return 'video/mp4'");
    expect(source).toContain("return { kind: 'video', mediaType: videoType }");
    expect(source).toContain("item.kind === 'audio' || item.kind === 'video' || item.kind === 'document'");
  });

  it('offers MP4 in the picker and renders video output', () => {
    expect(html).toContain('video/mp4');
    expect(html).toContain('.mp4');
    expect(source).toContain("document.createElement('video')");
    expect(source).toContain('<video controls preload=');
  });
});
