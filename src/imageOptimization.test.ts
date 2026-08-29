import { describe, expect, it } from 'vitest';
import {
  formatOptimizationNotice,
  MICROBLOG_MAX_MEDIA_BYTES,
  preparePhotoForMicroblog,
} from './imageOptimization';

describe('preparePhotoForMicroblog', () => {
  it('materializes photos already within the bridge limit without optimizing them', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const file = new File([bytes], 'small.jpg', { type: 'image/jpeg', lastModified: 123456789 });
    const result = await preparePhotoForMicroblog(file);

    expect(result.optimized).toBe(false);
    expect(result.file).not.toBe(file);
    expect(result.file.name).toBe(file.name);
    expect(result.file.type).toBe(file.type);
    expect(result.file.lastModified).toBe(file.lastModified);
    expect(result.file.size).toBe(file.size);
    expect(new Uint8Array(await result.file.arrayBuffer())).toEqual(bytes);
    expect(result.originalBytes).toBe(file.size);
    expect(result.uploadBytes).toBe(file.size);
  });

  it('rejects an oversized unsupported media type instead of mutating it', async () => {
    const file = new File(
      [new Uint8Array(MICROBLOG_MAX_MEDIA_BYTES + 1)],
      'oversized.bin',
      { type: 'application/octet-stream' },
    );

    await expect(preparePhotoForMicroblog(file)).rejects.toThrow('cannot be optimized automatically');
  });
});

describe('formatOptimizationNotice', () => {
  it('summarizes the original and upload sizes', () => {
    expect(formatOptimizationNotice('garden.jpg', 6_300_000, 2_100_000))
      .toBe('Optimized garden.jpg for Micro.blog: 6.3 MB → 2.1 MB.');
  });
});
