import { describe, expect, it } from 'vitest';
import { DRAWING_GRADES, suggestedDrawingGrade } from '../src/drawingGrades';

describe('Elijah drawing grades', () => {
  it('preserves all 25 official grade bands', () => {
    expect(DRAWING_GRADES).toHaveLength(25);
  });

  it('maps known scores to their exact bands', () => {
    expect(suggestedDrawingGrade(0)).toBe('G−');
    expect(suggestedDrawingGrade(3.017)).toBe('C');
    expect(suggestedDrawingGrade(5)).toBe('B');
    expect(suggestedDrawingGrade(5.8)).toBe('A');
    expect(suggestedDrawingGrade(8.4)).toBe('S+');
    expect(suggestedDrawingGrade(9.9)).toBe('P');
    expect(suggestedDrawingGrade(10)).toBe('P');
  });

  it('does not silently fill deliberate gaps', () => {
    expect(suggestedDrawingGrade(1.15)).toBeNull();
    expect(suggestedDrawingGrade(2.05)).toBeNull();
    expect(suggestedDrawingGrade(2.85)).toBeNull();
    expect(suggestedDrawingGrade(3.55)).toBeNull();
  });

  it('rejects scores outside 0–10', () => {
    expect(suggestedDrawingGrade(-0.01)).toBeNull();
    expect(suggestedDrawingGrade(10.5)).toBeNull();
  });
});
