import { describe, expect, it } from 'vitest';
import { constrainRect, rectFromPoints, replaceAnnotation } from './annotations';
import type { Annotation } from './model';

describe('annotation geometry', () => {
  it('normalizes a drag in either direction into a 0..1 rectangle', () => {
    const rect = rectFromPoints({ x: .8, y: .7 }, { x: .2, y: .3 });
    expect(rect?.x).toBeCloseTo(.2);
    expect(rect?.y).toBeCloseTo(.3);
    expect(rect?.width).toBeCloseTo(.6);
    expect(rect?.height).toBeCloseTo(.4);
  });

  it('clamps out-of-bounds pointer positions and ignores accidental taps', () => {
    const rect = rectFromPoints({ x: -.2, y: .2 }, { x: 1.4, y: .8 });
    expect(rect?.x).toBe(0);
    expect(rect?.width).toBe(1);
    expect(rect?.height).toBeCloseTo(.6);
    expect(rectFromPoints({ x: .5, y: .5 }, { x: .505, y: .505 })).toBeNull();
  });

  it('keeps edited geometry inside the page', () => {
    expect(constrainRect({ x: .9, y: -.2, width: .5, height: .001 })).toEqual({
      x: .5,
      y: 0,
      width: .5,
      height: .01,
    });
  });

  it('repositions edge origins so regions never collapse below the minimum size', () => {
    expect(constrainRect({ x: 1, y: 1, width: .001, height: .001 })).toEqual({
      x: .99,
      y: .99,
      width: .01,
      height: .01,
    });
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
