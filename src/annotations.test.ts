import { describe, expect, it } from 'vitest';
import { rectFromPoints, replaceAnnotation } from './annotations';
import type { Annotation } from './model';

describe('annotation geometry', () => {
  it('normalizes a drag in either direction into a 0..1 rectangle', () => {
    expect(rectFromPoints({ x: .8, y: .7 }, { x: .2, y: .3 })).toEqual({
      x: .2,
      y: .3,
      width: .6000000000000001,
      height: .39999999999999997,
    });
  });

  it('clamps out-of-bounds pointer positions and ignores accidental taps', () => {
    expect(rectFromPoints({ x: -.2, y: .2 }, { x: 1.4, y: .8 })).toEqual({ x: 0, y: .2, width: 1, height: .6000000000000001 });
    expect(rectFromPoints({ x: .5, y: .5 }, { x: .505, y: .505 })).toBeNull();
  });

  it('replaces only the selected annotation', () => {
    const annotations: Annotation[] = [
      { type: 'link', x: .1, y: .1, width: .2, height: .05, href: 'https://one.example' },
      { type: 'photo', x: .2, y: .3, width: .4, height: .2, assetId: 'photo-1' },
    ];
    const next: Annotation = { ...annotations[0], type: 'link', href: 'https://two.example' };
    const result = replaceAnnotation(annotations, 0, next);

    expect(result[0]).toEqual(next);
    expect(result[1]).toBe(annotations[1]);
  });
});
