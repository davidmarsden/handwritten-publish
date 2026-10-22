import { midiToFrequency, type SungNote } from './singing';

// Small additive instruments: a handful of harmonics shaped by an envelope,
// rendered offline so playback and the WAV download are identical. They are
// built only from the detected notes, so no vocal audio is ever mixed in.

type Instrument = {
  label: string;
  /** Harmonic amplitudes, fundamental first. */
  partials: number[];
  attack: number;
  release: number;
  /** Struck/plucked instruments fade on their own; others hold while the note lasts. */
  decay?: (midi: number) => number;
  /** Low-pass cutoff as a multiple of the fundamental. */
  brightness: number;
  vibrato?: { rate: number; cents: number; delay: number };
  inharmonicity?: number;
  gain: number;
};

export const INSTRUMENTS = {
  piano: { label: 'Piano', partials: [1, 0.55, 0.3, 0.18, 0.1, 0.06], attack: 0.004, release: 0.18, decay: midi => Math.max(0.6, 3.2 - (midi - 40) * 0.045), brightness: 9, inharmonicity: 0.0004, gain: 0.8 },
  guitar: { label: 'Guitar', partials: [1, 0.7, 0.45, 0.3, 0.22, 0.14, 0.09, 0.05], attack: 0.003, release: 0.12, decay: midi => Math.max(0.5, 2.2 - (midi - 40) * 0.03), brightness: 7, inharmonicity: 0.0001, gain: 0.7 },
  marimba: { label: 'Marimba', partials: [1, 0, 0, 0.35, 0, 0, 0, 0, 0, 0.08], attack: 0.002, release: 0.08, decay: () => 0.7, brightness: 14, gain: 0.95 },
  organ: { label: 'Organ', partials: [1, 0.75, 0.35, 0.5, 0, 0.25, 0, 0.2], attack: 0.015, release: 0.06, brightness: 10, gain: 0.45 },
  flute: { label: 'Flute', partials: [1, 0.22, 0.08, 0.03], attack: 0.07, release: 0.1, brightness: 6, vibrato: { rate: 5, cents: 8, delay: 0.25 }, gain: 0.7 },
  violin: { label: 'Violin', partials: [1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.13, 0.11, 0.09, 0.07], attack: 0.09, release: 0.15, brightness: 6, vibrato: { rate: 5.5, cents: 14, delay: 0.2 }, gain: 0.45 },
} satisfies Record<string, Instrument>;

export type InstrumentName = keyof typeof INSTRUMENTS;
export const DEFAULT_INSTRUMENT: InstrumentName = 'piano';
/** Notes start this long into the rendered audio. */
export const LEAD_IN = 0.05;

export type RenderOptions = { instrument?: InstrumentName; fuller?: boolean; sampleRate?: number };

function play(context: OfflineAudioContext, destination: AudioNode, instrument: Instrument, midi: number, start: number, duration: number, velocity: number) {
  const fundamental = midiToFrequency(midi);
  const end = start + Math.max(duration, instrument.attack * 2);
  const stop = end + instrument.release;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(velocity, start + instrument.attack);
  const decay = instrument.decay?.(midi);
  if (decay) envelope.gain.setTargetAtTime(0, start + instrument.attack, decay / 3);
  else envelope.gain.setValueAtTime(velocity, end);
  envelope.gain.setTargetAtTime(0, end, instrument.release / 4);
  const tone = context.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = Math.min(12000, fundamental * instrument.brightness);
  envelope.connect(tone).connect(destination);
  let vibrato: GainNode | null = null;
  if (instrument.vibrato) {
    const lfo = context.createOscillator();
    lfo.frequency.value = instrument.vibrato.rate;
    vibrato = context.createGain();
    vibrato.gain.setValueAtTime(0, start);
    vibrato.gain.linearRampToValueAtTime(instrument.vibrato.cents, start + instrument.vibrato.delay + 0.2);
    lfo.connect(vibrato);
    lfo.start(start);
    lfo.stop(stop);
  }
  instrument.partials.forEach((amplitude, index) => {
    if (!amplitude) return;
    const n = index + 1;
    const frequency = fundamental * n * Math.sqrt(1 + (instrument.inharmonicity ?? 0) * n * n);
    if (frequency >= context.sampleRate / 2) return;
    const oscillator = context.createOscillator();
    oscillator.frequency.value = frequency;
    if (vibrato) vibrato.connect(oscillator.detune);
    const partialGain = context.createGain();
    partialGain.gain.setValueAtTime(amplitude, start);
    // On struck strings and bars, upper partials die away faster than the fundamental.
    if (decay) partialGain.gain.setTargetAtTime(0, start, decay / (2 + n));
    oscillator.connect(partialGain).connect(envelope);
    oscillator.start(start);
    oscillator.stop(stop);
  });
}

export async function renderMelody(notes: SungNote[], options: RenderOptions = {}): Promise<AudioBuffer> {
  const instrument: Instrument = INSTRUMENTS[options.instrument ?? DEFAULT_INSTRUMENT];
  const sampleRate = options.sampleRate ?? 44100;
  const length = Math.max(0.5, ...notes.map(note => note.start + note.duration)) + 1.5;
  const context = new OfflineAudioContext(1, Math.ceil(length * sampleRate), sampleRate);
  const master = context.createDynamicsCompressor();
  master.threshold.value = -12;
  const volume = context.createGain();
  volume.gain.value = 0.35;
  volume.connect(master).connect(context.destination);
  for (const note of notes) {
    play(context, volume, instrument, note.midi, note.start + LEAD_IN, note.duration, instrument.gain);
    // A quieter copy one octave down fills out the sound.
    if (options.fuller && note.midi - 12 >= 21) play(context, volume, instrument, note.midi - 12, note.start + LEAD_IN, note.duration, instrument.gain * 0.5);
  }
  return context.startRendering();
}
