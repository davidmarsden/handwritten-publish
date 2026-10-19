import { describe, expect, it } from 'vitest';
import type { SungNote } from '../src/singing';
import { INSTRUMENTS, DEFAULT_INSTRUMENT } from '../src/singingInstruments';
import { detectKey, estimateEighth, quantise, spell, toSheetMusic } from '../src/singingNotation';

// "Twinkle Twinkle" sung at ~100 bpm: quarters, with a half note ending each phrase.
const TWINKLE = [60, 60, 67, 67, 69, 69, 67, 0, 65, 65, 64, 64, 62, 62, 60];
function sing(midis: number[], beat = 0.6, legato = 0.85): SungNote[] {
  const notes: SungNote[] = [];
  let time = 0.3;
  midis.forEach((midi, i) => {
    if (midi === 0) return;
    const beats = midis[i + 1] === 0 || i === midis.length - 1 ? 2 : 1;
    // A little human wobble in the timing.
    const wobble = (i % 3 - 1) * 0.02;
    notes.push({ midi, start: time + wobble, duration: beats * beat * legato });
    time += beats * beat;
  });
  return notes;
}

describe('Singing Hand sheet music', () => {
  it('finds the tempo of a sung tune', () => {
    expect(60 / (estimateEighth(sing(TWINKLE)) * 2)).toBeGreaterThan(92);
    expect(60 / (estimateEighth(sing(TWINKLE)) * 2)).toBeLessThan(108);
  });

  it('quantises to quarters and halves, absorbing breaths between notes', () => {
    const events = quantise(sing(TWINKLE), 0.3);
    expect(events.map(e => e.steps)).toEqual([2, 2, 2, 2, 2, 2, 4, 2, 2, 2, 2, 2, 2, 4]);
    expect(events.every(e => e.midi !== null)).toBe(true);
  });

  it('writes rests for real pauses', () => {
    const events = quantise([{ midi: 60, start: 0, duration: 0.6 }, { midi: 62, start: 1.8, duration: 0.6 }], 0.3);
    expect(events).toEqual([{ midi: 60, steps: 2, noteIndex: 0 }, { midi: null, steps: 4, noteIndex: -1 }, { midi: 62, steps: 2, noteIndex: 1 }]);
  });

  it('detects the key and spells notes to suit it', () => {
    expect(detectKey(sing(TWINKLE)).name).toBe('C major');
    expect(detectKey(sing(TWINKLE.map(m => (m ? m + 7 : 0)))).abcKey).toBe('G');
    expect(detectKey(sing(TWINKLE.map(m => (m ? m + 5 : 0)))).abcKey).toBe('F');
    expect(spell(66, 1)).toEqual({ letter: 'F', alter: 1, octave: 4 });
    expect(spell(70, -1)).toEqual({ letter: 'B', alter: -1, octave: 4 });
    expect(spell(65, 1)).toEqual({ letter: 'F', alter: 0, octave: 4 });
    expect(spell(61, 0)).toEqual({ letter: 'C', alter: 1, octave: 4 });
  });

  it('writes ABC with bars, note names and a map back to the sung notes', () => {
    const music = toSheetMusic(sing(TWINKLE), { noteNames: true });
    expect(music.abc).toContain('M:4/4');
    expect(music.abc).toContain('K:C\n');
    expect(music.abc).toContain('C2 C2 G2 G2 | A2 A2 G4 | F2 F2 E2 E2 | D2 D2 C4 |]');
    expect(music.abc).toContain('w: C C G G A A G F F E E D D C');
    expect(music.tokens.map(t => t.noteIndex)).toEqual([...Array(14).keys()]);
    for (const token of music.tokens) expect(music.abc[token.start]).toMatch(/[A-Ga-g^_=]/);
  });

  it('ties notes across bar lines and repeats accidentals in the next bar', () => {
    // C E G F♯ (held over the bar line) F E C C, at a quarter = 0.6 s.
    const notes = [[60, 0, 1], [64, 0.6, 1], [67, 1.2, 1], [66, 1.8, 2], [65, 3, 1], [64, 3.6, 1], [60, 4.2, 1], [60, 4.8, 2]]
      .map(([midi, start, beats]) => ({ midi, start, duration: beats * 0.6 - 0.05 }));
    const music = toSheetMusic(notes);
    expect(music.abc).toContain('K:C\n');
    expect(music.abc).toContain('C2 E2 G2 ^F2- | ^F2 =F2 E2 C2 | C4 z4 |]');
    expect(music.tokens.map(t => t.noteIndex)).toEqual([0, 1, 2, 3, 3, 4, 5, 6, 7]);
  });

  it('uses bass clef for low singing', () => {
    expect(toSheetMusic(sing(TWINKLE.map(m => (m ? m - 15 : 0)))).clef).toBe('bass');
  });

  it('keeps piano as the default instrument', () => {
    expect(DEFAULT_INSTRUMENT).toBe('piano');
    expect(Object.keys(INSTRUMENTS)[0]).toBe('piano');
  });
});
