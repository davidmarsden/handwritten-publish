// Singing Hand: turn a sung melody into piano notes. Everything here is pure
// so it can run (and be tested) without a browser audio stack.

export type SungNote = { midi: number; start: number; duration: number };

export const ANALYSIS_SAMPLE_RATE = 16000;
const MIN_FREQUENCY = 70;
const MAX_FREQUENCY = 1100;
const YIN_THRESHOLD = 0.15;
const SILENCE_RMS = 0.01;

export function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export function noteName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** YIN pitch estimate for one frame, or null when the frame is silent or unvoiced. */
export function detectPitch(frame: Float32Array, sampleRate: number): number | null {
  let energy = 0;
  for (const sample of frame) energy += sample * sample;
  if (Math.sqrt(energy / frame.length) < SILENCE_RMS) return null;
  const tauMin = Math.max(2, Math.floor(sampleRate / MAX_FREQUENCY));
  const tauMax = Math.min(Math.floor(sampleRate / MIN_FREQUENCY), Math.floor(frame.length / 2));
  const window = frame.length - tauMax;
  if (window <= 0 || tauMin >= tauMax) return null;
  const diff = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < window; i++) {
      const delta = frame[i] - frame[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }
  // Cumulative mean normalised difference.
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += diff[tau];
    cmnd[tau] = running ? (diff[tau] * tau) / running : 1;
  }
  let tau = tauMin;
  for (; tau < tauMax; tau++) {
    if (cmnd[tau] < YIN_THRESHOLD) {
      while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      break;
    }
  }
  if (tau >= tauMax) return null;
  // Parabolic interpolation around the dip for sub-sample accuracy.
  const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1];
  const denominator = a - 2 * b + c;
  const refined = denominator ? tau + (a - c) / (2 * denominator) : tau;
  return sampleRate / refined;
}

/** Pitch (as fractional MIDI) every `hop` samples; null where nobody is singing. */
export function trackPitch(samples: Float32Array, sampleRate: number, frameSize = 1024, hop = 256): (number | null)[] {
  const track: (number | null)[] = [];
  for (let start = 0; start + frameSize <= samples.length; start += hop) {
    const frequency = detectPitch(samples.subarray(start, start + frameSize), sampleRate);
    track.push(frequency === null ? null : frequencyToMidi(frequency));
  }
  return track;
}

/** Loudness (RMS) at the centre of each analysis frame, on a short window so consonants and breaths show as dips. */
export function trackLevels(samples: Float32Array, frameSize = 1024, hop = 256, window = 256): number[] {
  const levels: number[] = [];
  for (let start = 0; start + frameSize <= samples.length; start += hop) {
    const from = start + (frameSize - window) / 2;
    let energy = 0;
    for (let i = from; i < from + window; i++) energy += samples[i] * samples[i];
    levels.push(Math.sqrt(energy / window));
  }
  return levels;
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)];
}

/** A dip in loudness that recovers straight after: the singer starting the same note again. */
function isReattack(levels: number[], frame: number, peak: number) {
  const level = levels[frame];
  if (level > peak * 0.5 || level > levels[frame - 1] || level > levels[frame + 1]) return false;
  return Math.max(...levels.slice(frame + 1, frame + 4)) > level * 1.6;
}

/**
 * Turn a frame-by-frame pitch track into discrete piano notes: smooth out
 * wobble, snap to the nearest semitone, merge runs, split repeated notes at
 * loudness dips, and drop blips.
 */
export function segmentNotes(track: (number | null)[], hopSeconds: number, minNoteSeconds = 0.08, levels?: number[]): SungNote[] {
  const smoothed = track.map((value, index) => {
    if (value === null) return null;
    const neighbours = track.slice(Math.max(0, index - 2), index + 3).filter((v): v is number => v !== null);
    return Math.round(median(neighbours));
  });
  const notes: (SungNote & { reattacked: boolean })[] = [];
  let current: { midi: number; startFrame: number; endFrame: number; peak: number; reattacked: boolean } | null = null;
  // Loudness bookkeeping across gaps, so a quiet gap counts as a re-attack.
  let reattackNext = false, lastPeak = 0, gapLevel = Infinity;
  const flush = () => {
    if (!current) return;
    const duration = (current.endFrame - current.startFrame + 1) * hopSeconds;
    if (duration >= minNoteSeconds) notes.push({ midi: current.midi, start: current.startFrame * hopSeconds, duration, reattacked: current.reattacked });
    current = null;
  };
  smoothed.forEach((midi, frame) => {
    const level = levels?.[frame] ?? 0;
    if (midi === null) {
      if (current) lastPeak = current.peak;
      flush();
      gapLevel = Math.min(gapLevel, level);
      return;
    }
    if (current && current.midi === midi && frame === current.endFrame + 1) {
      if (levels && isReattack(levels, frame, current.peak)) { flush(); reattackNext = true; return; }
      current.endFrame = frame;
      current.peak = Math.max(current.peak, level);
      return;
    }
    flush();
    current = { midi, startFrame: frame, endFrame: frame, peak: level, reattacked: reattackNext || (!!levels && gapLevel < lastPeak * 0.5) };
    reattackNext = false;
    gapLevel = Infinity;
  });
  flush();
  // Rejoin a held note that was split by a brief dropout (but not a deliberate re-attack).
  const joined: SungNote[] = [];
  for (const { reattacked, ...note } of notes) {
    const previous = joined[joined.length - 1];
    if (previous && !reattacked && previous.midi === note.midi && note.start - (previous.start + previous.duration) < 0.06) {
      previous.duration = note.start + note.duration - previous.start;
    } else joined.push({ ...note });
  }
  return joined;
}

export function transcribeMelody(samples: Float32Array, sampleRate = ANALYSIS_SAMPLE_RATE): SungNote[] {
  const hop = 256;
  return segmentNotes(trackPitch(samples, sampleRate, 1024, hop), hop / sampleRate, 0.08, trackLevels(samples, 1024, hop));
}

/** Shift notes by whole octaves, keeping them on a real 88-key piano. */
export function transposeNotes(notes: SungNote[], octaves: number): SungNote[] {
  return notes.map(note => ({ ...note, midi: Math.min(108, Math.max(21, note.midi + 12 * octaves)) }));
}

/** 16-bit mono PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => { const s = Math.max(-1, Math.min(1, sample)); view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); });
  return buffer;
}
