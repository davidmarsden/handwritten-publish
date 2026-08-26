import { describe, expect, it } from 'vitest';
import { pdfRenderScale } from './pdfRenderScale';

describe('pdfRenderScale', () => {
  it('targets about 2200px on the longest edge when the cap is not reached', () => {
    const scale = pdfRenderScale(1000, 1200);
    expect(scale).toBeCloseTo(2200 / 1200, 6);
  });

  it('caps A4-sized and smaller source pages at 2.5x', () => {
    expect(pdfRenderScale(595, 842)).toBe(2.5);
    expect(pdfRenderScale(200, 300)).toBe(2.5);
  });

  it('can scale unusually large PDF coordinates down to the target size', () => {
    expect(pdfRenderScale(1800, 3000)).toBeCloseTo(2200 / 3000, 6);
  });

  it('falls back safely for invalid dimensions', () => {
    expect(pdfRenderScale(0, 0)).toBe(1);
  });
});
