# Singing Hand

*Sing it. Hear it on piano.*

Singing Hand lives at `/singing/`. Elijah (or anyone) sings a song into the microphone — or chooses an existing recording — and hears it played back as a piano version with no vocals.

## How it works

1. **Record** with `MediaRecorder` (up to two minutes), or decode a chosen audio file.
2. **Resample** the voice to 16 kHz mono with an `OfflineAudioContext`.
3. **Track pitch** every 16 ms with the YIN algorithm (`src/singing.ts`), ignoring silence.
4. **Segment notes**: median-smooth the pitch track, snap to the nearest semitone, merge held notes and drop blips shorter than 80 ms.
5. **Split repeated notes**: when the same pitch is sung again ("twin-kle twin-kle"), a dip in loudness marks the new note.
6. **Play it back** through a small additive synthesiser (`src/singingInstruments.ts`): piano (default), guitar, marimba, organ, flute or violin. Options: octave shift, and *Fuller sound*, which adds a quieter copy of every note one octave lower. The instrument is built only from the detected notes, so no vocal audio is ever mixed in.
7. **Follow along**: during playback a playhead moves across the piano roll, the current note lights up on an on-screen keyboard and in the sheet music, and its name is shown.
8. **Sheet music** (`src/singingNotation.ts`): the tempo is estimated from the gaps between notes, rhythms are quantised to eighth notes in 4/4, the key is found with the Krumhansl–Kessler profiles, and notes are spelled to suit it. It is written as ABC notation and drawn with [abcjs](https://www.abcjs.net/) (loaded only when needed), with optional note names under each note and a print layout.

The result can be played, compared with the original voice, downloaded as a WAV, or printed as sheet music.

## Boundary

Singing Hand is entirely client-side. Recordings are never uploaded, stored or sent to a server, and there are no accounts. It transcribes a single sung melody line; it does not separate vocals from a backing track or generate harmony. Sheet music is a best guess at rhythm, tempo and key from free singing, intended as a starting point for playing the tune on a keyboard.
