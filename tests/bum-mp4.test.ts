import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../public/bum/bum.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/bum/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/bum/bum.css', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../public/hand-sw.js', import.meta.url), 'utf8');

describe('BUM Hand media support', () => {
  it('classifies explicit video MP4 and generic/blank MIME .mp4 files as video', () => {
    expect(source).toContain("const VIDEO_TYPES = new Set(['video/mp4'])");
    expect(source).toContain("if (type === 'video/mp4') return 'video/mp4'");
    expect(source).toContain("(!type || type === 'application/octet-stream') && file.name.toLowerCase().endsWith('.mp4')");
    expect(source).toContain("return { kind: 'video', mediaType: videoType }");
    expect(source).toContain("item.kind === 'audio' || item.kind === 'video' || item.kind === 'document'");
  });

  it('preserves explicit audio/mp4 before applying video filename fallback', () => {
    const audioIndex = source.indexOf('const audioType = inferAudioType(file)');
    const videoIndex = source.indexOf('const videoType = inferVideoType(file)');
    expect(audioIndex).toBeGreaterThan(-1);
    expect(videoIndex).toBeGreaterThan(audioIndex);
    expect(source).toContain("if (type === 'audio/mp4' || type === 'audio/x-m4a') return 'audio/mp4'");
  });

  it('detects OGG but blocks it before Micro.blog upload', () => {
    expect(source).toContain("const OGG_TYPES = new Set(['audio/ogg', 'application/ogg'])");
    expect(source).toContain("name.endsWith('.ogg') || name.endsWith('.oga')");
    expect(source).toContain("return { kind: 'ogg', mediaType: audioType }");
    expect(source).toContain('Micro.blog does not currently accept OGG uploads. Convert this file to MP3 or M4A first.');
    expect(html).toContain('.ogg');
    expect(html).toContain('.oga');
    expect(html).toContain('convert OGG to MP3 or M4A first');
  });

  it('offers MP4 in the picker and renders responsive video output', () => {
    expect(html).toContain('video/mp4');
    expect(html).toContain('.mp4');
    expect(source).toContain("document.createElement('video')");
    expect(source).toContain('<video controls preload=');
    expect(css).toContain('.uploaded-list audio, .uploaded-list video');
    expect(css).toContain('.uploaded-list video { height: auto; }');
  });

  it('bumps the shell cache so existing installs receive the new client', () => {
    expect(serviceWorker).toContain("const VERSION = 'v8'");
    expect(serviceWorker).toContain("'/bum/audio-plan.js'");
  });
});
