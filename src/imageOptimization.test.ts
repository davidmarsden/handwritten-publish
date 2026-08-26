import { describe, expect, it } from 'vitest';
import {
  formatOptimizationNotice,
  MICROBLOG_MAX_MEDIA_BYTES,
  preparePhotoForMicroblog,
} from './imageOptimization';

describe('preparePhotoForMicroblog', () => {
  it('leaves photos already within the bridge limit untouched', async () => {
    const file = new File([new Uint8Array(1024)], 'small.jpg', { type: 'image/jpeg' });
    const result = await preparePhotoForMicroblog(file);

    expect(result.optimized).toBe(false);
    expect(result.file).toBe(file);
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
