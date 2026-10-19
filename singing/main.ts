import { ANALYSIS_SAMPLE_RATE, encodeWav, transcribeMelody, transposeNotes, type SungNote } from '../src/singing';
import { DEFAULT_INSTRUMENT, INSTRUMENTS, LEAD_IN, renderMelody, type InstrumentName } from '../src/singingInstruments';
import { detectKey, displayName, spell, toSheetMusic } from '../src/singingNotation';

const MAX_SECONDS = 120;
const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const recordButton = $<HTMLButtonElement>('#record'), timer = $('#timer'), level = $('#level'), fileInput = $<HTMLInputElement>('#file'), recordStatus = $('#record-status');
const result = $('#result'), summary = $('#summary'), roll = $<HTMLCanvasElement>('#roll'), keys = $<HTMLCanvasElement>('#keys'), nowNote = $('#now-note');
const instrumentSelect = $<HTMLSelectElement>('#instrument'), octave = $<HTMLSelectElement>('#octave'), fuller = $<HTMLInputElement>('#fuller');
const playButton = $<HTMLButtonElement>('#play'), voiceButton = $<HTMLButtonElement>('#voice'), download = $<HTMLAnchorElement>('#download'), playStatus = $('#play-status');
const sheetCard = $('#sheet-card'), sheetSummary = $('#sheet-summary'), sheet = $('#sheet'), noteNames = $<HTMLInputElement>('#note-names'), printButton = $<HTMLButtonElement>('#print');

let audioContext: AudioContext | null = null, recorder: MediaRecorder | null = null, stream: MediaStream | null = null, meterFrame = 0, stopTimer = 0;
let sungNotes: SungNote[] = [], shownNotes: SungNote[] = [], keyFifths = 0, voiceBuffer: AudioBuffer | null = null, instrumentBuffer: AudioBuffer | null = null, downloadUrl = '', renderVersion = 0;
let sheetElements: SVGElement[][] = [], activeNote = -1, followFrame = 0;
let playing: { source: AudioBufferSourceNode; button: HTMLButtonElement; label: string; startedAt: number; offset: number } | null = null;

for (const [name, instrument] of Object.entries(INSTRUMENTS)) instrumentSelect.append(new Option(instrument.label, name, name === DEFAULT_INSTRUMENT, name === DEFAULT_INSTRUMENT));
const instrumentName = () => instrumentSelect.value as InstrumentName;
const playLabel = () => `▶ Play ${INSTRUMENTS[instrumentName()].label.toLowerCase()}`;
playButton.textContent = playLabel();

function setStatus(target: HTMLElement, message: string, error = false) { target.textContent = message; target.dataset.error = error ? 'true' : 'false'; }
function context() { audioContext ??= new AudioContext(); return audioContext; }
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const accent = () => (dark() ? '#f2c94c' : '#2f3d6b');
const BLACK_KEYS = [1, 3, 6, 8, 10];

// ── Playback and follow-along ────────────────────────────────────────────

function stopPlayback() {
  if (!playing) return;
  playing.source.onended = null;
  playing.source.stop();
  playing.button.textContent = playing.button === playButton ? playLabel() : playing.label;
  playing = null;
  cancelAnimationFrame(followFrame);
  follow(null);
}
function play(buffer: AudioBuffer, button: HTMLButtonElement, label: string, offset: number) {
  const wasThis = playing?.button === button;
  stopPlayback();
  if (wasThis) return;
  const ctx = context();
  void ctx.resume();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = () => { if (playing?.source === source) stopPlayback(); };
  source.start();
  playing = { source, button, label, startedAt: ctx.currentTime, offset };
  button.textContent = '■ Stop';
  const tick = () => {
    if (!playing) return;
    follow(context().currentTime - playing.startedAt - playing.offset);
    followFrame = requestAnimationFrame(tick);
  };
  tick();
}

/** Move the playhead and light up the note being played (null = stopped). */
function follow(time: number | null) {
  let index = -1;
  if (time !== null) index = shownNotes.findIndex(note => time >= note.start && time < note.start + note.duration);
  drawRoll(time, index);
  if (index === activeNote) return;
  sheetElements[activeNote]?.forEach(element => element.classList.remove('playing'));
  activeNote = index;
  const note = shownNotes[index];
  sheetElements[index]?.forEach(element => element.classList.add('playing'));
  drawKeys(note?.midi ?? null);
  if (note) { const spelled = spell(note.midi, keyFifths); nowNote.textContent = `${displayName(spelled.letter, spelled.alter)}${spelled.octave}`; }
  else nowNote.textContent = '–';
}

function prepareCanvas(canvas: HTMLCanvasElement) {
  const ratio = window.devicePixelRatio || 1, width = canvas.clientWidth, height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
  const g = canvas.getContext('2d')!;
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, width, height);
  return { g, width, height };
}

function drawRoll(time: number | null = null, active = -1) {
  const { g, width, height } = prepareCanvas(roll);
  const notes = shownNotes;
  if (!notes.length) return;
  const low = Math.min(...notes.map(n => n.midi)) - 2, high = Math.max(...notes.map(n => n.midi)) + 2;
  const end = Math.max(...notes.map(n => n.start + n.duration)), rowHeight = height / (high - low + 1), pad = 8;
  const x = (t: number) => pad + (t / end) * (width - pad * 2);
  for (let midi = low; midi <= high; midi++) {
    if (BLACK_KEYS.includes(midi % 12)) { g.fillStyle = dark() ? 'rgba(255,255,255,.04)' : 'rgba(32,32,30,.05)'; g.fillRect(0, (high - midi) * rowHeight, width, rowHeight); }
  }
  notes.forEach((note, i) => {
    g.fillStyle = i === active ? '#d64545' : accent();
    g.beginPath();
    g.roundRect(x(note.start), (high - note.midi) * rowHeight + 1, Math.max(3, (note.duration / end) * (width - pad * 2) - 1), Math.max(3, rowHeight - 2), 3);
    g.fill();
  });
  if (time !== null && time >= 0) {
    g.fillStyle = '#d64545';
    g.fillRect(Math.min(width - 2, x(time)), 0, 2, height);
  }
}

/** A small keyboard covering the song: dots mark keys the song uses, red is the key to press now. */
function drawKeys(active: number | null) {
  const { g, width, height } = prepareCanvas(keys);
  if (!shownNotes.length) return;
  const used = new Set(shownNotes.map(n => n.midi));
  const first = Math.floor(Math.min(...used) / 12) * 12, last = Math.max(Math.ceil((Math.max(...used) + 1) / 12) * 12 - 1, first + 23);
  const whites: number[] = [];
  for (let midi = first; midi <= last; midi++) if (!BLACK_KEYS.includes(midi % 12)) whites.push(midi);
  const keyWidth = width / whites.length, blackWidth = keyWidth * 0.6, blackHeight = height * 0.6;
  const dot = (cx: number, cy: number, colour: string) => { g.fillStyle = colour; g.beginPath(); g.arc(cx, cy, Math.min(5, keyWidth / 5), 0, Math.PI * 2); g.fill(); };
  whites.forEach((midi, i) => {
    g.fillStyle = midi === active ? '#d64545' : '#fff';
    g.strokeStyle = 'rgba(32,32,30,.35)';
    g.fillRect(i * keyWidth, 0, keyWidth, height);
    g.strokeRect(i * keyWidth + 0.5, 0.5, keyWidth - 1, height - 1);
    if (midi % 12 === 0) { g.fillStyle = midi === active ? '#fff' : '#777168'; g.font = `${Math.min(12, keyWidth * 0.45)}px system-ui`; g.textAlign = 'center'; g.fillText(`C${midi / 12 - 1}`, (i + 0.5) * keyWidth, height - 8); }
    if (used.has(midi) && midi !== active) dot((i + 0.5) * keyWidth, height - 26, accent());
  });
  whites.forEach((midi, i) => {
    const black = midi + 1;
    if (!BLACK_KEYS.includes(black % 12) || black > last) return;
    const left = (i + 1) * keyWidth - blackWidth / 2;
    g.fillStyle = black === active ? '#d64545' : '#20201e';
    g.fillRect(left, 0, blackWidth, blackHeight);
    if (used.has(black) && black !== active) dot(left + blackWidth / 2, blackHeight - 12, '#f2c94c');
  });
}

// ── Recording ─────────────────────────────────────────────────────────────

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setStatus(recordStatus, 'This browser cannot record audio. Try choosing a recording instead.', true); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
  } catch {
    setStatus(recordStatus, 'Singing Hand needs permission to use the microphone.', true);
    return;
  }
  stopPlayback();
  const ctx = context();
  void ctx.resume();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize), started = performance.now();
  const tick = () => {
    analyser.getFloatTimeDomainData(samples);
    const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
    level.style.width = `${Math.min(100, peak * 140)}%`;
    timer.textContent = clock((performance.now() - started) / 1000);
    meterFrame = requestAnimationFrame(tick);
  };
  tick();
  const chunks: Blob[] = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = () => {
    cancelAnimationFrame(meterFrame);
    clearTimeout(stopTimer);
    level.style.width = '0';
    stream?.getTracks().forEach(track => track.stop());
    analyser.disconnect();
    recordButton.textContent = '● Record again';
    recordButton.classList.remove('recording');
    void new Blob(chunks, { type: recorder?.mimeType }).arrayBuffer().then(processAudio);
    recorder = null;
  };
  recorder.start();
  stopTimer = window.setTimeout(() => recorder?.stop(), MAX_SECONDS * 1000);
  recordButton.textContent = '■ Stop';
  recordButton.classList.add('recording');
  setStatus(recordStatus, 'Listening… sing whenever you are ready.');
}

async function toMonoAnalysisRate(buffer: AudioBuffer) {
  const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * ANALYSIS_SAMPLE_RATE), ANALYSIS_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);
  // Lift quiet recordings so the silence gate doesn't swallow soft singing.
  const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
  if (peak > 0 && peak < 0.5) for (let i = 0; i < samples.length; i++) samples[i] *= 0.5 / peak;
  return samples;
}

async function processAudio(data: ArrayBuffer) {
  stopPlayback();
  recordButton.disabled = true;
  try {
    setStatus(recordStatus, 'Listening back for the tune…');
    voiceBuffer = await context().decodeAudioData(data);
    if (voiceBuffer.duration > MAX_SECONDS + 1) throw new Error('That recording is longer than two minutes. Try a shorter one.');
    const samples = await toMonoAnalysisRate(voiceBuffer);
    await new Promise(resolve => setTimeout(resolve));
    sungNotes = transcribeMelody(samples);
    if (!sungNotes.length) throw new Error('Singing Hand could not hear a tune in that. Try singing a little louder or closer to the microphone.');
    setStatus(recordStatus, '');
    result.hidden = false;
    sheetCard.hidden = false;
    await renderResult();
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus(recordStatus, error instanceof Error ? error.message : 'Could not read that recording.', true);
  } finally {
    recordButton.disabled = false;
  }
}

// ── Results ───────────────────────────────────────────────────────────────

async function renderSheet() {
  const music = toSheetMusic(shownNotes, { noteNames: noteNames.checked });
  sheetSummary.textContent = `${music.keyName}, about ${music.bpm} beats a minute, ${music.clef} clef.`;
  const module = await import('abcjs');
  const abcjs = ('default' in module ? module.default : module) as typeof import('abcjs');
  const [tune] = abcjs.renderAbc(sheet, music.abc, { add_classes: true, responsive: 'resize', paddingleft: 0, paddingright: 0 });
  // Map each written note (including tied continuations) back to the sung note it plays.
  const noteAt = new Map(music.tokens.map(token => [token.start, token.noteIndex]));
  sheetElements = shownNotes.map(() => []);
  activeNote = -1;
  for (const line of tune?.lines ?? []) for (const staff of line.staff ?? []) for (const voice of staff.voices ?? []) for (const item of voice) {
    const index = item.el_type === 'note' && !item.rest ? noteAt.get(item.startChar) : undefined;
    const elements = (item as { abselem?: { elemset?: SVGElement[] } }).abselem?.elemset;
    if (index !== undefined && elements) sheetElements[index].push(...elements);
  }
}

async function renderResult() {
  const version = ++renderVersion;
  stopPlayback();
  shownNotes = transposeNotes(sungNotes, Number(octave.value));
  keyFifths = detectKey(shownNotes).fifths;
  const names = shownNotes.map(n => spell(n.midi, keyFifths)), byPitch = shownNotes.map((n, i) => [n.midi, i]).sort((a, b) => a[0] - b[0]);
  const label = (i: number) => `${displayName(names[i].letter, names[i].alter)}${names[i].octave}`;
  summary.textContent = `Singing Hand heard ${shownNotes.length} note${shownNotes.length === 1 ? '' : 's'}, from ${label(byPitch[0][1])} to ${label(byPitch[byPitch.length - 1][1])}.`;
  drawRoll();
  drawKeys(null);
  void renderSheet().catch(() => { sheet.textContent = 'Could not draw the sheet music.'; });
  playButton.disabled = true;
  setStatus(playStatus, `Getting the ${INSTRUMENTS[instrumentName()].label.toLowerCase()} ready…`);
  const buffer = await renderMelody(shownNotes, { instrument: instrumentName(), fuller: fuller.checked });
  if (version !== renderVersion) return;
  instrumentBuffer = buffer;
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(new Blob([encodeWav(buffer.getChannelData(0), buffer.sampleRate)], { type: 'audio/wav' }));
  download.href = downloadUrl;
  download.download = `singing-hand-${instrumentName()}.wav`;
  playButton.textContent = playLabel();
  playButton.disabled = false;
  setStatus(playStatus, '');
}

recordButton.addEventListener('click', () => { if (recorder) recorder.stop(); else void startRecording(); });
fileInput.addEventListener('change', () => { const file = fileInput.files?.[0]; if (file) void file.arrayBuffer().then(processAudio); fileInput.value = ''; });
playButton.addEventListener('click', () => { if (instrumentBuffer) play(instrumentBuffer, playButton, playLabel(), LEAD_IN); });
voiceButton.addEventListener('click', () => { if (voiceBuffer) play(voiceBuffer, voiceButton, 'Hear my voice', 0); });
for (const control of [instrumentSelect, octave, fuller]) control.addEventListener('change', () => { void renderResult().catch(error => setStatus(playStatus, error instanceof Error ? error.message : 'Could not build the playback.', true)); });
noteNames.addEventListener('change', () => { void renderSheet(); });
printButton.addEventListener('click', () => window.print());
window.addEventListener('resize', () => { if (!result.hidden) { drawRoll(); drawKeys(shownNotes[activeNote]?.midi ?? null); } });
