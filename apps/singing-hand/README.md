# Singing Hand

*Sing it. Hear it on piano.*

Singing Hand lives at `/singing/`. Elijah (or anyone) sings a song into the microphone — or chooses an existing recording — and hears it played back as a piano version with no vocals.

## How it works

1. **Record** with `MediaRecorder` (up to two minutes), or decode a chosen audio file.
2. **Resample** the voice to 16 kHz mono with an `OfflineAudioContext`.
3. **Track pitch** every 16 ms with the YIN algorithm (`src/singing.ts`), ignoring silence.
4. **Segment notes**: median-smooth the pitch track, snap to the nearest semitone, merge held notes and drop blips shorter than 80 ms.
5. **Play piano**: render the notes through a small additive piano synthesiser (`src/singingPiano.ts`) with an optional soft left-hand octave and octave shift. The piano is synthesised from the detected notes, so no vocal audio is ever mixed in.

The result can be played, compared with the original voice, or downloaded as a WAV.

## Boundary

Singing Hand is entirely client-side. Recordings are never uploaded, stored or sent to a server, and there are no accounts. It transcribes a single sung melody line; it does not separate vocals from a backing track or generate harmony.
