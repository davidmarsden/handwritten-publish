import { midiToFrequency, type SungNote } from './singing';

// A small additive piano: a few slightly stretched harmonics with a hammer-fast
// attack and a pitch-dependent decay, rendered offline so playback and the WAV
// download are identical. No vocal audio is ever mixed in.
const PARTIALS = [1, 0.55, 0.3, 0.18, 0.1, 0.06];
const INHARMONICITY = 0.0004;
const RELEASE = 0.18;

export type PianoOptions = { fuller?: boolean; sampleRate?: number };

function strike(context: OfflineAudioContext, destination: AudioNode, midi: number, start: number, duration: number, velocity: number) {
  const fundamental = midiToFrequency(midi);
  // Low strings ring longer than high ones, as on a real piano.
  const decay = Math.max(0.6, 3.2 - (midi - 40) * 0.045);
  const end = start + duration;
  const stop = end + RELEASE;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(velocity, start + 0.004);
  envelope.gain.setTargetAtTime(0, start + 0.004, decay / 3);
  envelope.gain.setTargetAtTime(0, end, RELEASE / 4);
  const tone = context.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = Math.min(12000, fundamental * 9);
  envelope.connect(tone).connect(destination);
  PARTIALS.forEach((amplitude, index) => {
    const n = index + 1;
    const frequency = fundamental * n * Math.sqrt(1 + INHARMONICITY * n * n);
    if (frequency >= context.sampleRate / 2) return;
    const oscillator = context.createOscillator();
    oscillator.frequency.value = frequency;
    const partialGain = context.createGain();
    // Upper partials die away faster than the fundamental.
    partialGain.gain.setValueAtTime(amplitude, start);
    partialGain.gain.setTargetAtTime(0, start, decay / (2 + n));
    oscillator.connect(partialGain).connect(envelope);
    oscillator.start(start);
    oscillator.stop(stop);
  });
}

export async function renderPiano(notes: SungNote[], options: PianoOptions = {}): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate ?? 44100;
  const length = Math.max(0.5, ...notes.map(note => note.start + note.duration)) + 1.5;
  const context = new OfflineAudioContext(1, Math.ceil(length * sampleRate), sampleRate);
  const master = context.createDynamicsCompressor();
  master.threshold.value = -12;
  const volume = context.createGain();
  volume.gain.value = 0.35;
  volume.connect(master).connect(context.destination);
  for (const note of notes) {
    strike(context, volume, note.midi, note.start + 0.05, note.duration, 0.8);
    // A soft left-hand octave below for a less bare sound.
    if (options.fuller && note.midi - 12 >= 21) strike(context, volume, note.midi - 12, note.start + 0.05, note.duration, 0.4);
  }
  return context.startRendering();
}
