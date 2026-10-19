import { ANALYSIS_SAMPLE_RATE, encodeWav, noteName, transcribeMelody, transposeNotes, type SungNote } from '../src/singing';
import { renderPiano } from '../src/singingPiano';

const MAX_SECONDS = 120;
const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const recordButton = $<HTMLButtonElement>('#record'), timer = $('#timer'), level = $('#level'), fileInput = $<HTMLInputElement>('#file'), recordStatus = $('#record-status');
const result = $('#result'), summary = $('#summary'), roll = $<HTMLCanvasElement>('#roll'), octave = $<HTMLSelectElement>('#octave'), fuller = $<HTMLInputElement>('#fuller');
const playButton = $<HTMLButtonElement>('#play'), voiceButton = $<HTMLButtonElement>('#voice'), download = $<HTMLAnchorElement>('#download'), playStatus = $('#play-status');

let audioContext: AudioContext | null = null, recorder: MediaRecorder | null = null, stream: MediaStream | null = null, meterFrame = 0, stopTimer = 0;
let sungNotes: SungNote[] = [], voiceBuffer: AudioBuffer | null = null, pianoBuffer: AudioBuffer | null = null, downloadUrl = '', renderVersion = 0;
let playing: { source: AudioBufferSourceNode; button: HTMLButtonElement; label: string } | null = null;

function setStatus(target: HTMLElement, message: string, error = false) { target.textContent = message; target.dataset.error = error ? 'true' : 'false'; }
function context() { audioContext ??= new AudioContext(); return audioContext; }
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function stopPlayback() {
  if (!playing) return;
  playing.source.onended = null;
  playing.source.stop();
  playing.button.textContent = playing.label;
  playing = null;
}
function play(buffer: AudioBuffer, button: HTMLButtonElement, label: string) {
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
  playing = { source, button, label };
  button.textContent = '■ Stop';
}

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
    await renderResult();
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus(recordStatus, error instanceof Error ? error.message : 'Could not read that recording.', true);
  } finally {
    recordButton.disabled = false;
  }
}

function drawRoll(notes: SungNote[]) {
  const ratio = window.devicePixelRatio || 1, width = roll.clientWidth, height = roll.clientHeight;
  roll.width = width * ratio; roll.height = height * ratio;
  const g = roll.getContext('2d')!;
  g.scale(ratio, ratio);
  g.clearRect(0, 0, width, height);
  if (!notes.length) return;
  const low = Math.min(...notes.map(n => n.midi)) - 2, high = Math.max(...notes.map(n => n.midi)) + 2;
  const end = Math.max(...notes.map(n => n.start + n.duration)), rowHeight = height / (high - low + 1), pad = 8;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  for (let midi = low; midi <= high; midi++) {
    if ([1, 3, 6, 8, 10].includes(midi % 12)) { g.fillStyle = dark ? 'rgba(255,255,255,.04)' : 'rgba(32,32,30,.05)'; g.fillRect(0, (high - midi) * rowHeight, width, rowHeight); }
  }
  g.fillStyle = dark ? '#f2c94c' : '#2f3d6b';
  for (const note of notes) {
    const x = pad + (note.start / end) * (width - pad * 2), w = Math.max(3, (note.duration / end) * (width - pad * 2) - 1);
    g.beginPath();
    g.roundRect(x, (high - note.midi) * rowHeight + 1, w, Math.max(3, rowHeight - 2), 3);
    g.fill();
  }
}

async function renderResult() {
  const version = ++renderVersion;
  const notes = transposeNotes(sungNotes, Number(octave.value));
  const names = notes.map(n => n.midi), lowest = noteName(Math.min(...names)), highest = noteName(Math.max(...names));
  summary.textContent = `Singing Hand heard ${notes.length} note${notes.length === 1 ? '' : 's'}, from ${lowest} to ${highest}.`;
  drawRoll(notes);
  playButton.disabled = true;
  setStatus(playStatus, 'Tuning the piano…');
  const buffer = await renderPiano(notes, { fuller: fuller.checked });
  if (version !== renderVersion) return;
  pianoBuffer = buffer;
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(new Blob([encodeWav(buffer.getChannelData(0), buffer.sampleRate)], { type: 'audio/wav' }));
  download.href = downloadUrl;
  playButton.disabled = false;
  setStatus(playStatus, '');
}

recordButton.addEventListener('click', () => { if (recorder) recorder.stop(); else void startRecording(); });
fileInput.addEventListener('change', () => { const file = fileInput.files?.[0]; if (file) void file.arrayBuffer().then(processAudio); fileInput.value = ''; });
playButton.addEventListener('click', () => { if (pianoBuffer) play(pianoBuffer, playButton, '▶ Play piano'); });
voiceButton.addEventListener('click', () => { if (voiceBuffer) play(voiceBuffer, voiceButton, 'Hear my voice'); });
for (const control of [octave, fuller]) control.addEventListener('change', () => { stopPlayback(); void renderResult().catch(error => setStatus(playStatus, error instanceof Error ? error.message : 'Could not build the piano version.', true)); });
window.addEventListener('resize', () => { if (!result.hidden) drawRoll(transposeNotes(sungNotes, Number(octave.value))); });
