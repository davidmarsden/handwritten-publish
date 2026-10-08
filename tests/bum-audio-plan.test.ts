import { describe, expect, it } from 'vitest';
import { planAudioSegments, audioPartFilename } from '../public/bum/audio-plan.js';

describe('BUM Hand audio splitting plan', () => {
  it.each([899, 900])('keeps %i seconds in one piece', duration => {
    expect(planAudioSegments(duration)).toEqual([{ index: 1, startSeconds: 0, durationSeconds: duration }]);
  });
  it('splits 15:01 without losing the remainder', () => {
    expect(planAudioSegments(901)).toEqual([
      { index: 1, startSeconds: 0, durationSeconds: 300 },
      { index: 2, startSeconds: 300, durationSeconds: 300 },
      { index: 3, startSeconds: 600, durationSeconds: 300 },
      { index: 4, startSeconds: 900, durationSeconds: 1 },
    ]);
  });
  it('supports every configured length', () => {
    for (const minutes of [1, 2, 3, 4, 5, 10, 15]) {
      const parts = planAudioSegments(1380, { segmentMinutes: minutes });
      expect(parts.reduce((total, part) => total + part.durationSeconds, 0)).toBe(1380);
      expect(parts.at(-1).startSeconds + parts.at(-1).durationSeconds).toBe(1380);
    }
  });
  it('allows splitting to be disabled', () => {
    expect(planAudioSegments(1800, { split: false })).toHaveLength(1);
  });
  it('rejects invalid durations and segment settings', () => {
    expect(() => planAudioSegments(NaN)).toThrow();
    expect(() => planAudioSegments(-2)).toThrow();
    expect(() => planAudioSegments(1000, { segmentMinutes: 7 })).toThrow();
  });
  it('numbers segments deterministically', () => {
    expect(audioPartFilename('Interview.m4a', 1, 12)).toBe('Interview-part-01.mp3');
    expect(audioPartFilename('Interview.m4a', 12, 12)).toBe('Interview-part-12.mp3');
  });
});
