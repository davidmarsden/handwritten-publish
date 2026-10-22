// Singing Hand: turn sung notes (free timing) into simple sheet music in ABC
// notation — a 4/4 melody with a guessed tempo and key, quantised to eighths.

import type { SungNote } from './singing';

export type SheetMusic = {
  abc: string;
  bpm: number;
  keyName: string;
  clef: 'treble' | 'bass';
  /** Where each written note starts in `abc`, and which sung note it plays. */
  tokens: { start: number; noteIndex: number }[];
};

const EIGHTHS_PER_BAR = 8;
const BARS_PER_LINE = 4;

/** Guess the length of an eighth note (seconds) from the gaps between note starts. */
export function estimateEighth(notes: SungNote[]): number {
  const gaps = notes.slice(1).map((note, i) => note.start - notes[i].start).filter(gap => gap > 0.05 && gap < 2.5);
  if (gaps.length < 2) return 0.3;
  let best = 0.3, bestScore = Infinity;
  for (let eighth = 60 / 170 / 2; eighth <= 60 / 55 / 2; eighth += 0.0025) {
    const error = gaps.reduce((sum, gap) => { const steps = gap / eighth; return sum + Math.abs(steps - Math.max(1, Math.round(steps))); }, 0) / gaps.length;
    // Gentle preference for everyday tempos around 100 bpm.
    const score = error + 0.08 * Math.abs(Math.log2(60 / (eighth * 2) / 100));
    if (score < bestScore) { bestScore = score; best = eighth; }
  }
  return best;
}

type Event = { midi: number | null; steps: number; noteIndex: number };

/** Note and rest lengths in eighths. Short breaths between notes are absorbed. */
export function quantise(notes: SungNote[], eighth: number): Event[] {
  const events: Event[] = [];
  notes.forEach((note, index) => {
    const next = notes[index + 1];
    // Sung notes usually stop a little short of their written length.
    const sung = Math.max(1, Math.round(note.duration / eighth + 0.3));
    if (!next) { events.push({ midi: note.midi, steps: sung, noteIndex: index }); return; }
    const span = Math.max(1, Math.round((next.start - note.start) / eighth));
    const gap = next.start - (note.start + note.duration);
    // Singers breathe between notes; only a clear pause becomes a written rest.
    const steps = gap < Math.max(eighth * 0.6, (next.start - note.start) * 0.2) ? span : Math.min(sung, span);
    events.push({ midi: note.midi, steps, noteIndex: index });
    if (span > steps) events.push({ midi: null, steps: Math.min(span - steps, EIGHTHS_PER_BAR * 2), noteIndex: -1 });
  });
  return events;
}

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
// Key signature (in sharps > 0 / flats < 0) for each major tonic pitch class.
const FIFTHS_OF_MAJOR = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
const MAJOR_NAMES: Record<number, string> = { 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', [-1]: 'F', [-2]: 'Bb', [-3]: 'Eb', [-4]: 'Ab', [-5]: 'Db' };
const MINOR_NAMES: Record<number, string> = { 0: 'A', 1: 'E', 2: 'B', 3: 'F#', 4: 'C#', 5: 'G#', 6: 'D#', [-1]: 'D', [-2]: 'G', [-3]: 'C', [-4]: 'F', [-5]: 'Bb' };

function correlation(a: number[], b: number[]) {
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Krumhansl–Kessler key finding, weighted by how long each pitch is held. */
export function detectKey(notes: SungNote[]): { fifths: number; minor: boolean; name: string; abcKey: string } {
  const histogram = new Array(12).fill(0);
  for (const note of notes) histogram[((note.midi % 12) + 12) % 12] += note.duration;
  let best = { score: -Infinity, tonic: 0, minor: false };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const minor of [false, true]) {
      const profile = (minor ? MINOR : MAJOR).map((_, i) => (minor ? MINOR : MAJOR)[(i - tonic + 12) % 12]);
      const score = correlation(histogram, profile);
      if (score > best.score) best = { score, tonic, minor };
    }
  }
  const fifths = FIFTHS_OF_MAJOR[best.minor ? (best.tonic + 3) % 12 : best.tonic];
  const letter = (best.minor ? MINOR_NAMES : MAJOR_NAMES)[fifths];
  return { fifths, minor: best.minor, name: `${letter.replace('#', '♯').replace('b', '♭')} ${best.minor ? 'minor' : 'major'}`, abcKey: `${letter}${best.minor ? 'm' : ''}` };
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const SHARP_ORDER = 'FCGDAEB', FLAT_ORDER = 'BEADGCF';

function keyAlteration(letter: string, fifths: number) {
  if (fifths > 0 && SHARP_ORDER.indexOf(letter) < fifths) return 1;
  if (fifths < 0 && FLAT_ORDER.indexOf(letter) < -fifths) return -1;
  return 0;
}

/** Choose a letter name and sharp/flat for a pitch that suits the key. */
export function spell(midi: number, fifths: number): { letter: string; alter: number; octave: number } {
  const pc = ((midi % 12) + 12) % 12;
  const options = LETTERS.map((letter, i) => {
    const diff = (pc - NATURAL[i] + 12) % 12;
    return { letter, alter: diff === 11 ? -1 : diff };
  }).filter(option => option.alter >= -1 && option.alter <= 1);
  const choice = options.find(o => o.alter === keyAlteration(o.letter, fifths))
    ?? options.find(o => o.alter === 0)
    ?? options.find(o => o.alter === (fifths < 0 ? -1 : 1))!;
  return { ...choice, octave: Math.floor((midi - choice.alter) / 12) - 1 };
}

function abcPitch(letter: string, octave: number) {
  if (octave >= 5) return letter.toLowerCase() + "'".repeat(octave - 5);
  return letter + ','.repeat(Math.max(0, 4 - octave));
}

export function displayName(letter: string, alter: number) {
  return letter + (alter === 1 ? '♯' : alter === -1 ? '♭' : '');
}

// Lengths (in eighths) that can be written as a single note or rest.
const WRITABLE = [8, 6, 4, 3, 2, 1];
function pieces(steps: number) {
  const out: number[] = [];
  while (steps > 0) { const piece = WRITABLE.find(n => n <= steps)!; out.push(piece); steps -= piece; }
  return out;
}

export function toSheetMusic(notes: SungNote[], options: { noteNames?: boolean; title?: string } = {}): SheetMusic {
  const eighth = estimateEighth(notes);
  const bpm = Math.round(60 / (eighth * 2));
  const key = detectKey(notes);
  const pitches = notes.map(n => n.midi).sort((a, b) => a - b);
  const clef = pitches.length && pitches[Math.floor(pitches.length / 2)] < 57 ? 'bass' : 'treble';
  const header = `X:1\nT:${options.title ?? 'My song'}\nM:4/4\nL:1/8\nQ:1/4=${bpm}\nK:${key.abcKey}${clef === 'bass' ? ' clef=bass' : ''}\n`;

  let body = '', position = 0, barAccidentals = new Map<string, number>(), lyricLine: string[] = [];
  const tokens: SheetMusic['tokens'] = [];
  const endLine = () => {
    body += '\n';
    if (options.noteNames && lyricLine.length) body += `w: ${lyricLine.join(' ')}\n`;
    lyricLine = [];
  };
  for (const event of quantise(notes, eighth)) {
    let remaining = event.steps, first = true;
    while (remaining > 0) {
      const room = EIGHTHS_PER_BAR - (position % EIGHTHS_PER_BAR);
      const chunk = Math.min(remaining, room);
      pieces(chunk).forEach((length, i, all) => {
        const lengthText = length === 1 ? '' : String(length);
        if (position % 2 === 0 && body && !body.endsWith('\n')) body += ' ';
        if (event.midi === null) {
          body += `z${lengthText}`;
        } else {
          const { letter, alter, octave } = spell(event.midi, key.fifths);
          const pitchKey = letter + octave;
          const current = barAccidentals.get(pitchKey) ?? keyAlteration(letter, key.fifths);
          const accidental = alter === current ? '' : alter === 1 ? '^' : alter === -1 ? '_' : '=';
          barAccidentals.set(pitchKey, alter);
          tokens.push({ start: header.length + body.length, noteIndex: event.noteIndex });
          const tied = remaining - chunk > 0 || i < all.length - 1;
          body += `${accidental}${abcPitch(letter, octave)}${lengthText}${tied ? '-' : ''}`;
          // abcjs gives every written note, tied or not, its own lyric slot.
          lyricLine.push(first ? displayName(letter, alter) : '*');
          first = false;
        }
        position += length;
      });
      remaining -= chunk;
      if (position % EIGHTHS_PER_BAR === 0) {
        barAccidentals = new Map();
        body += ' |';
        if ((position / EIGHTHS_PER_BAR) % BARS_PER_LINE === 0) endLine();
      }
    }
  }
  // Finish the last bar with a rest and a final barline.
  const leftover = (EIGHTHS_PER_BAR - (position % EIGHTHS_PER_BAR)) % EIGHTHS_PER_BAR;
  if (leftover) body += ' ' + pieces(leftover).map(n => `z${n === 1 ? '' : n}`).join(' ') + ' |';
  if (!body.endsWith('\n')) endLine();
  const lastBar = body.lastIndexOf('|');
  body = `${body.slice(0, lastBar)}|]${body.slice(lastBar + 1)}`;
  return { abc: header + body, bpm, keyName: key.name, clef, tokens };
}
