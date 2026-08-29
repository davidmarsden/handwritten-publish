export const MICROBLOG_AUDIO_MAX_BYTES = 75_000_000;
const MAX_AUDIO_FILES = 20;

const $ = selector => document.querySelector(selector);
const tokenInput = $('#token');
const destinationSelect = $('#destination');
const audioInput = $('#audio-files');
const audioQueue = $('#audio-queue');
const audioSummary = $('#audio-selection-summary');
const audioUpload = $('#audio-upload');
const audioClear = $('#audio-clear');
const audioResults = $('#audio-results');
const audioResultsSummary = $('#audio-results-summary');
const audioUploadedList = $('#audio-uploaded-list');
const copyAudioUrls = $('#copy-audio-urls');
const copyAudioMarkdown = $('#copy-audio-markdown');
const copyAudioHtml = $('#copy-audio-html');
const audioStatus = $('#audio-status');

let audioItems = [];
let audioBusy = false;

function formatBytes(bytes) {
  return bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function inferAudioType(file) {
  const type = (file.type || '').toLowerCase();
  if (type === 'audio/mpeg' || type === 'audio/mp3') return 'audio/mpeg';
  if (type === 'audio/mp4' || type === 'audio/x-m4a') return 'audio/mp4';
  const name = file.name.toLowerCase();
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.m4a')) return 'audio/mp4';
  return '';
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function escapeMarkdown(value) {
  return value.replace(/([\\\[\]])/g, '\\$1');
}

function uploadedItems() {
  return audioItems.filter(item => item.state === 'uploaded' && item.url);
}

function setAudioStatus(message) {
  audioStatus.textContent = message;
}

function renderAudio() {
  audioQueue.replaceChildren(...audioItems.map(item => {
    const li = document.createElement('li');
    const details = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = item.file.name;
    const meta = document.createElement('div');
    meta.className = 'file-meta';
    meta.textContent = `${formatBytes(item.file.size)} · ${item.mediaType || 'unknown type'}`;
    details.append(name, meta);
    const state = document.createElement('div');
    state.className = `file-status ${item.state}`;
    state.textContent = item.state === 'uploading'
      ? `Uploading · ${item.progress ?? 0}%`
      : item.state === 'uploaded' ? 'Uploaded'
        : item.state === 'failed' ? item.error || 'Failed'
          : 'Queued';
    li.append(details, state);
    return li;
  }));

  audioSummary.hidden = !audioItems.length;
  audioSummary.textContent = audioItems.length ? `${audioItems.length} audio file${audioItems.length === 1 ? '' : 's'} selected.` : '';
  audioUpload.disabled = audioBusy || !audioItems.some(item => item.state === 'queued') || !tokenInput.value.trim() || !destinationSelect?.value;
  audioUpload.textContent = audioBusy ? 'Uploading audio…' : 'Upload queued audio';
  audioClear.disabled = audioBusy || !audioItems.length;
  audioInput.disabled = audioBusy;

  const uploaded = uploadedItems();
  audioResults.hidden = !uploaded.length;
  audioResultsSummary.textContent = uploaded.length ? `${uploaded.length} successful audio upload${uploaded.length === 1 ? '' : 's'}.` : '';
  audioUploadedList.replaceChildren(...uploaded.map(item => {
    const li = document.createElement('li');
    const details = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = item.file.name;
    const url = document.createElement('a');
    url.className = 'uploaded-url';
    url.href = item.url;
    url.target = '_blank';
    url.rel = 'noreferrer';
    url.textContent = item.url;
    details.append(name, url);
    const player = document.createElement('audio');
    player.controls = true;
    player.preload = 'none';
    player.src = item.url;
    li.append(details, player);
    return li;
  }));
}

async function getMediaEndpoint(token) {
  const response = await fetch('/api/microblog/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not connect to Micro.blog.');
  if (!payload.mediaEndpoint) throw new Error('Micro.blog did not return a media endpoint.');
  return payload.mediaEndpoint;
}

function directUpload(endpoint, token, destination, item) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.addEventListener('progress', event => {
      if (!event.lengthComputable) return;
      item.progress = Math.min(99, Math.round((event.loaded / event.total) * 100));
      renderAudio();
    });
    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Micro.blog rejected ${item.file.name} (HTTP ${xhr.status}).`));
        return;
      }
      const location = xhr.getResponseHeader('Location');
      if (!location) {
        reject(new Error('Micro.blog accepted the audio upload but the browser could not read its returned media URL.'));
        return;
      }
      item.progress = 100;
      resolve(location);
    });
    xhr.addEventListener('error', () => reject(new Error('Direct audio upload could not reach Micro.blog. This may be a browser cross-origin restriction.')));

    const body = new FormData();
    body.append('file', item.file, item.file.name);
    body.append('mp-destination', destination);
    xhr.send(body);
  });
}

function addAudioFiles(fileList) {
  const incoming = Array.from(fileList || []);
  const room = Math.max(0, MAX_AUDIO_FILES - audioItems.length);
  const accepted = incoming.slice(0, room);
  for (const file of accepted) {
    const mediaType = inferAudioType(file);
    let state = 'queued';
    let error = '';
    if (!mediaType) {
      state = 'failed';
      error = 'MP3 or M4A only';
    } else if (!file.size) {
      state = 'failed';
      error = 'Empty file';
    } else if (file.size > MICROBLOG_AUDIO_MAX_BYTES) {
      state = 'failed';
      error = `${formatBytes(file.size)} exceeds Micro.blog’s 75 MB upload limit`;
    }
    audioItems.push({ file, mediaType, state, error, url: '', progress: null });
  }
  setAudioStatus(incoming.length > accepted.length
    ? `Added ${accepted.length}; audio batches are limited to ${MAX_AUDIO_FILES} files.`
    : `${accepted.length} audio file${accepted.length === 1 ? '' : 's'} added.`);
  renderAudio();
}

async function runAudioUpload() {
  const token = tokenInput.value.trim();
  const destination = destinationSelect?.value || '';
  const queued = audioItems.filter(item => item.state === 'queued');
  if (!token || !destination || !queued.length) {
    setAudioStatus('Connect to Micro.blog and choose a blog before uploading audio.');
    return;
  }
  audioBusy = true;
  renderAudio();
  try {
    setAudioStatus('Discovering Micro.blog’s media endpoint…');
    const endpoint = await getMediaEndpoint(token);
    for (const item of queued) {
      item.state = 'uploading';
      item.progress = 0;
      setAudioStatus(`Uploading ${item.file.name}…`);
      renderAudio();
      try {
        item.url = await directUpload(endpoint, token, destination, item);
        item.state = 'uploaded';
      } catch (error) {
        item.state = 'failed';
        item.error = error instanceof Error ? error.message : 'Upload failed';
      }
      renderAudio();
    }
    const failed = audioItems.filter(item => item.state === 'failed').length;
    setAudioStatus(`${uploadedItems().length} audio file${uploadedItems().length === 1 ? '' : 's'} uploaded${failed ? `; ${failed} failed` : ''}.`);
  } catch (error) {
    setAudioStatus(error instanceof Error ? error.message : 'Could not start audio upload.');
  } finally {
    audioBusy = false;
    renderAudio();
  }
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    setAudioStatus(message);
  } catch {
    setAudioStatus('Could not copy automatically.');
  }
}

audioInput.addEventListener('change', event => {
  addAudioFiles(event.target.files);
  event.target.value = '';
});
audioUpload.addEventListener('click', runAudioUpload);
audioClear.addEventListener('click', () => { audioItems = []; setAudioStatus('Audio queue cleared.'); renderAudio(); });
copyAudioUrls.addEventListener('click', () => copyText(uploadedItems().map(item => item.url).join('\n'), 'Copied audio URLs.'));
copyAudioMarkdown.addEventListener('click', () => copyText(uploadedItems().map(item => `[${escapeMarkdown(item.file.name)}](${item.url})`).join('\n'), 'Copied audio Markdown.'));
copyAudioHtml.addEventListener('click', () => copyText(uploadedItems().map(item => `<audio controls preload="none" src="${escapeHtml(item.url)}"></audio>`).join('\n'), 'Copied audio HTML.'));
tokenInput.addEventListener('input', renderAudio);
destinationSelect?.addEventListener('change', renderAudio);

renderAudio();
