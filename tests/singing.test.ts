import { describe, expect, it } from 'vitest';
import { detectPitch, encodeWav, frequencyToMidi, midiToFrequency, noteName, segmentNotes, transcribeMelody, transposeNotes } from '../src/singing';

const rate = 16000;
function tone(frequency: number, seconds: number, amplitude = 0.4) {
  const samples = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    // A voice-like tone: fundamental plus a couple of harmonics.
    samples[i] = amplitude * (Math.sin(2 * Math.PI * frequency * t) + 0.5 * Math.sin(4 * Math.PI * frequency * t) + 0.25 * Math.sin(6 * Math.PI * frequency * t)) / 1.75;
  }
  return samples;
}
function join(...parts: Float32Array[]) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

describe('Singing Hand pitch helpers', () => {
  it('converts between frequency, MIDI and note names', () => {
    expect(frequencyToMidi(440)).toBeCloseTo(69);
    expect(midiToFrequency(60)).toBeCloseTo(261.63, 1);
    expect(noteName(60)).toBe('C4');
    expect(noteName(70)).toBe('A♯4');
  });

  it('detects the pitch of a sung-like tone and ignores silence', () => {
    expect(detectPitch(tone(220, 0.064), rate)).toBeCloseTo(220, 0);
    expect(detectPitch(tone(523.25, 0.064), rate)).toBeCloseTo(523.25, 0);
    expect(detectPitch(new Float32Array(1024), rate)).toBeNull();
  });

  it('segments a pitch track into semitone notes and drops blips', () => {
    const hop = 0.016;
    const track = [...Array(20).fill(60.2), 72, ...Array(20).fill(61.9), null, null, ...Array(3).fill(55)];
    const notes = segmentNotes(track, hop);
    expect(notes.map(note => note.midi)).toEqual([60, 62]);
    expect(notes[0].start).toBe(0);
  });

  it('transcribes a simple sung phrase with rests', () => {
    const notes = transcribeMelody(join(tone(261.63, 0.4), new Float32Array(rate * 0.2), tone(329.63, 0.4), tone(392, 0.4)));
    expect(notes.map(note => note.midi)).toEqual([60, 64, 67]);
    expect(notes[1].start).toBeGreaterThan(0.55);
  });

  it('hears a repeated note sung twice in a row', () => {
    // "Twin-kle": the same pitch re-sung after a short consonant dip.
    const notes = transcribeMelody(join(tone(261.63, 0.5), tone(261.63, 0.06, 0.02), tone(261.63, 0.5), tone(392, 0.5)));
    expect(notes.map(note => note.midi)).toEqual([60, 60, 67]);
  });

  it('keeps transposed notes on the piano keyboard', () => {
    expect(transposeNotes([{ midi: 100, start: 0, duration: 1 }], 1)[0].midi).toBe(108);
    expect(transposeNotes([{ midi: 48, start: 0, duration: 1 }], -1)[0].midi).toBe(36);
  });

  it('encodes 16-bit mono WAV', () => {
    const wav = new DataView(encodeWav(new Float32Array([0, 1, -1]), 44100));
    expect(String.fromCharCode(wav.getUint8(0), wav.getUint8(1), wav.getUint8(2), wav.getUint8(3))).toBe('RIFF');
    expect(wav.byteLength).toBe(50);
    expect(wav.getUint32(24, true)).toBe(44100);
    expect(wav.getInt16(46, true)).toBe(0x7fff);
    expect(wav.getInt16(48, true)).toBe(-0x8000);
  });
});
