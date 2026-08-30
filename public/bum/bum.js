import {
  addPhotosToMicroblogCollection,
  createMicroblogCollection,
  fetchMicroblogCollections,
  fetchMicroblogConfig,
  inferImageMediaType,
  uploadMicroblogMedia,
} from '/shared/microblog-client.js';
import {
  MICROBLOG_BRIDGE_SAFE_BYTES as SAFE_UPLOAD_BYTES,
  preparePhotoForMicroblog,
} from '/shared/image-optimization.js';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a']);
const AUDIO_MAX_BYTES = 75_000_000;
const MAX_FILES = 30;
const $ = selector => document.querySelector(selector);

const tokenInput = $('#token');
const toggleToken = $('#toggle-token');
const connectButton = $('#connect');
const collectionPanel = $('#collection-panel');
const destinationSelect = $('#destination');
const collectionSelect = $('#collection');
const newCollectionName = $('#new-collection-name');
const createCollectionButton = $('#create-collection');
const collectionSummary = $('#collection-summary');
const filesInput = $('#files');
const dropZone = $('#drop-zone');
const selectionSummary = $('#selection-summary');
const queueEl = $('#queue');
const uploadButton = $('#upload');
const retryButton = $('#retry');
const retryCollectionButton = $('#retry-collection');
const clearButton = $('#clear');
const resultsSection = $('#results');
const resultsSummary = $('#results-summary');
const uploadedList = $('#uploaded-list');
const statusEl = $('#status');
const copyUrlsButton = $('#copy-urls');
const copyMarkdownButton = $('#copy-markdown');
const copyHtmlButton = $('#copy-html');

let items = [];
let busy = false;
let loadingCollections = false;
let connectedToken = '';
let collections = [];
let upstreamMediaEndpoint = '';

function formatBytes(bytes) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
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

function classifyFile(file) {
  const imageType = inferImageMediaType(file);
  if (IMAGE_TYPES.has(imageType)) return { kind: 'image', mediaType: imageType };
  const audioType = inferAudioType(file);
  if (AUDIO_TYPES.has(audioType)) return { kind: 'audio', mediaType: audioType };
  return { kind: 'unsupported', mediaType: file.type || '' };
}

function basename(filename) {
  return filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Uploaded file';
}
function escapeHtml(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function escapeMarkdown(value) { return value.replace(/([\\\[\]])/g, '\\$1'); }
function setStatus(message) { statusEl.textContent = message; }
function uploadedItems() { return items.filter(item => item.state === 'uploaded' && item.url); }
function queuedItems() { return items.filter(item => item.state === 'queued'); }
function failedItems() { return items.filter(item => item.state === 'failed'); }
function retryableFailedItems() { return failedItems().filter(item => item.retryable); }
function selectedCollection() { return collections.find(collection => collection.url === collectionSelect.value) || null; }
function photoItems(targets = items) { return targets.filter(item => item.kind === 'image'); }

function resultMarkdown(item) {
  return item.kind === 'image'
    ? `![${escapeMarkdown(basename(item.file.name))}](${item.url})`
    : `[${escapeMarkdown(item.file.name)}](${item.url})`;
}
function resultHtml(item) {
  return item.kind === 'image'
    ? `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(basename(item.file.name))}">`
    : `<audio controls preload="none" src="${escapeHtml(item.url)}"></audio>`;
}

function statusLabel(item) {
  if (item.state === 'optimizing') return 'Optimizing…';
  if (item.state === 'uploading') return 'Uploading…';
  if (item.state === 'uploaded' && item.collectionState === 'adding') return 'Adding to collection…';
  if (item.state === 'uploaded' && item.collectionState === 'added') return item.optimizedBytes ? 'Uploaded · optimized · collected' : 'Uploaded · collected';
  if (item.state === 'uploaded' && item.collectionState === 'failed') return item.optimizedBytes ? 'Uploaded · optimized · collection failed' : 'Uploaded · collection failed';
  if (item.state === 'uploaded') return item.optimizedBytes ? 'Uploaded · optimized' : 'Uploaded';
  if (item.state === 'failed') return item.error || 'Failed';
  if (item.needsOptimization) return 'Queued · will optimize';
  return 'Queued';
}

function itemMeta(item) {
  const size = item.optimizedBytes
    ? `${formatBytes(item.file.size)} → ${formatBytes(item.optimizedBytes)}`
    : formatBytes(item.file.size);
  const note = item.needsOptimization && !item.optimizedBytes ? ' · auto-optimize before upload' : '';
  return `${size} · ${item.mediaType || 'unknown type'} · ${item.kind}${note}`;
}

function renderCollections() {
  const selected = collectionSelect.value;
  collectionSelect.replaceChildren(new Option('Upload only — no collection', ''));
  for (const collection of collections) collectionSelect.add(new Option(`${collection.name} (${collection.uploadCount})`, collection.url));
  if (collections.some(collection => collection.url === selected)) collectionSelect.value = selected;
  const destination = destinationSelect.selectedOptions[0]?.textContent || '';
  collectionSummary.textContent = loadingCollections
    ? 'Loading collections…'
    : collections.length
      ? `${collections.length} collection${collections.length === 1 ? '' : 's'} on ${destination}. Photo collections apply only to images.`
      : destination ? `No photo collections yet on ${destination}. Audio uploads ignore this setting.` : '';
}

function render() {
  const queued = queuedItems();
  const retryable = retryableFailedItems();
  const uploaded = uploadedItems();
  const collectionFailures = uploaded.filter(item => item.kind === 'image' && item.collectionState === 'failed');

  queueEl.replaceChildren(...items.map(item => {
    const li = document.createElement('li');
    const details = document.createElement('div');
    const name = document.createElement('div'); name.className = 'file-name'; name.textContent = item.file.name;
    const meta = document.createElement('div'); meta.className = 'file-meta'; meta.textContent = itemMeta(item);
    details.append(name, meta);
    const state = document.createElement('div'); state.className = `file-status ${item.state}`; state.textContent = statusLabel(item);
    li.append(details, state);
    return li;
  }));

  selectionSummary.hidden = !items.length;
  if (items.length) {
    const images = items.filter(item => item.kind === 'image').length;
    const audio = items.filter(item => item.kind === 'audio').length;
    selectionSummary.textContent = `${items.length} file${items.length === 1 ? '' : 's'} selected · ${images} image${images === 1 ? '' : 's'} · ${audio} audio`;
  }
  uploadButton.disabled = busy || loadingCollections || !tokenInput.value.trim() || !destinationSelect.value || !queued.length;
  uploadButton.textContent = busy ? 'Working…' : `Upload queued file${queued.length === 1 ? '' : 's'}`;
  retryButton.hidden = !retryable.length;
  retryButton.disabled = busy || loadingCollections || !tokenInput.value.trim() || !destinationSelect.value;
  retryCollectionButton.hidden = !collectionFailures.length;
  retryCollectionButton.disabled = busy || loadingCollections || !selectedCollection();
  clearButton.disabled = busy || !items.length;
  filesInput.disabled = busy;
  tokenInput.disabled = busy;
  toggleToken.disabled = busy;
  connectButton.disabled = busy || !tokenInput.value.trim();
  destinationSelect.disabled = busy || loadingCollections;
  collectionSelect.disabled = busy || loadingCollections;
  newCollectionName.disabled = busy || loadingCollections;
  createCollectionButton.disabled = busy || loadingCollections || !destinationSelect.value || !newCollectionName.value.trim();

  resultsSection.hidden = !uploaded.length;
  resultsSummary.textContent = uploaded.length ? `${uploaded.length} successful upload${uploaded.length === 1 ? '' : 's'}.` : '';
  uploadedList.replaceChildren(...uploaded.map(item => {
    const li = document.createElement('li');
    const details = document.createElement('div');
    const name = document.createElement('div'); name.className = 'file-name'; name.textContent = item.file.name;
    const url = document.createElement('a'); url.className = 'uploaded-url'; url.href = item.url; url.target = '_blank'; url.rel = 'noreferrer'; url.textContent = item.url;
    details.append(name, url);
    if (item.kind === 'audio') {
      const player = document.createElement('audio'); player.controls = true; player.preload = 'none'; player.src = item.url; details.append(player);
    }
    const copy = document.createElement('button'); copy.className = 'button secondary item-copy'; copy.type = 'button'; copy.textContent = 'Copy URL';
    copy.addEventListener('click', () => copyText(item.url, `Copied URL for ${item.file.name}.`));
    li.append(details, copy);
    return li;
  }));
}

async function fetchUpstreamMediaEndpoint(token) {
  const response = await fetch('/api/microblog/config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token.trim() }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not connect to Micro.blog.');
  if (!payload.mediaEndpoint) throw new Error('Micro.blog did not return a media endpoint.');
  return payload.mediaEndpoint;
}

async function loadCollections() {
  const token = tokenInput.value.trim();
  const destination = destinationSelect.value;
  collections = [];
  loadingCollections = Boolean(token && destination);
  renderCollections(); render();
  if (!token || !destination) { loadingCollections = false; renderCollections(); render(); return; }
  try { collections = await fetchMicroblogCollections(token, destination); }
  finally { loadingCollections = false; renderCollections(); render(); }
}

async function connect() {
  const token = tokenInput.value.trim();
  if (!token) return;
  busy = true; setStatus('Connecting to Micro.blog…'); render();
  try {
    const [config, mediaEndpoint] = await Promise.all([fetchMicroblogConfig(token), fetchUpstreamMediaEndpoint(token)]);
    if (!config.destinations.length) throw new Error('Micro.blog returned no blogs for this token.');
    upstreamMediaEndpoint = mediaEndpoint;
    destinationSelect.replaceChildren(...config.destinations.map(destination => new Option(destination.name, destination.uid)));
    connectedToken = token;
    collectionPanel.hidden = false;
    await loadCollections();
    setStatus('Connected. Choose any supported files below.');
  } catch (error) {
    collectionPanel.hidden = true; upstreamMediaEndpoint = '';
    setStatus(error instanceof Error ? error.message : 'Could not connect to Micro.blog.');
  } finally { busy = false; render(); }
}

async function stableBrowserFile(file, mediaType) {
  const bytes = await file.arrayBuffer();
  return new File([bytes], file.name, { type: mediaType || file.type, lastModified: file.lastModified });
}

async function addFiles(fileList) {
  const incoming = Array.from(fileList ?? []);
  if (!incoming.length || busy) return;
  const room = Math.max(0, MAX_FILES - items.length);
  const accepted = incoming.slice(0, room);
  const rejected = incoming.length - accepted.length;
  busy = true; setStatus(`Preparing ${accepted.length} selected file${accepted.length === 1 ? '' : 's'}…`); render();

  const staged = await Promise.all(accepted.map(async file => {
    const { kind, mediaType } = classifyFile(file);
    let state = 'queued', error = '', retryable = true, stableFile = file;
    if (kind === 'unsupported') { state = 'failed'; error = 'PNG, JPEG, WebP, MP3 or M4A only'; retryable = false; }
    else if (!file.size) { state = 'failed'; error = 'Empty file'; retryable = false; }
    else if (kind === 'audio' && file.size > AUDIO_MAX_BYTES) { state = 'failed'; error = `${formatBytes(file.size)} exceeds Micro.blog’s 75 MB audio limit`; retryable = false; }
    else {
      try { stableFile = await stableBrowserFile(file, mediaType); }
      catch { state = 'failed'; error = 'Could not read this file from the selected provider. Select it again or save it to the device first.'; retryable = false; }
    }
    return {
      id: crypto.randomUUID(), file: stableFile, kind, mediaType, state, error, url: '', retryable,
      collectionState: 'none', needsOptimization: kind === 'image' && stableFile.size > SAFE_UPLOAD_BYTES, optimizedBytes: null,
    };
  }));

  items.push(...staged); busy = false;
  const invalid = staged.filter(item => item.state === 'failed').length;
  const oversized = staged.filter(item => item.state === 'queued' && item.needsOptimization).length;
  if (rejected) setStatus(`Added ${staged.length}; batches are limited to ${MAX_FILES} files.`);
  else if (invalid) setStatus(`Added ${staged.length} files; ${invalid} need attention.`);
  else if (oversized) setStatus(`Added ${staged.length} files. ${oversized} photo${oversized === 1 ? '' : 's'} will be optimized automatically.`);
  else setStatus(`${staged.length} file${staged.length === 1 ? '' : 's'} added.`);
  render();
}

async function uploadAudio(item, token, destination) {
  if (!upstreamMediaEndpoint) upstreamMediaEndpoint = await fetchUpstreamMediaEndpoint(token);
  const response = await fetch('/api/microblog/audio', {
    method: 'POST',
    headers: {
      'Content-Type': item.mediaType,
      'X-Microblog-Token': token,
      'X-Microblog-Media-Endpoint': encodeURIComponent(upstreamMediaEndpoint),
      'X-Microblog-Destination': encodeURIComponent(destination),
      'X-File-Name': encodeURIComponent(item.file.name),
    },
    body: item.file,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Could not upload ${item.file.name}.`);
  if (!payload.url) throw new Error(`Micro.blog uploaded ${item.file.name} but returned no media URL.`);
  return payload.url;
}

async function uploadItem(item, token, destination) {
  item.error = ''; item.retryable = true; item.optimizedBytes = null;
  try {
    if (item.kind === 'audio') {
      item.state = 'uploading'; render();
      item.url = await uploadAudio(item, token, destination);
    } else {
      if (item.needsOptimization) { item.state = 'optimizing'; render(); }
      const prepared = await preparePhotoForMicroblog(item.file, item.mediaType);
      item.optimizedBytes = prepared.optimized ? prepared.uploadBytes : null;
      item.state = 'uploading'; render();
      item.url = await uploadMicroblogMedia(token, prepared.file, prepared.file.name, prepared.optimized ? prepared.file.type : item.mediaType);
    }
    item.state = 'uploaded'; item.retryable = false; item.collectionState = 'none';
  } catch (error) {
    item.state = 'failed'; item.error = error instanceof Error ? error.message : 'Upload failed'; item.retryable = true;
  }
  render();
}

async function addToSelectedCollection(targets) {
  const photos = photoItems(targets);
  const collection = selectedCollection();
  const destination = destinationSelect.value;
  if (!collection || !destination || !photos.length) return true;
  for (const item of photos) item.collectionState = 'adding';
  render();
  try {
    await addPhotosToMicroblogCollection(tokenInput.value.trim(), destination, collection.url, photos.map(item => item.url));
    for (const item of photos) item.collectionState = 'added';
    const fresh = collections.find(entry => entry.url === collection.url);
    if (fresh) fresh.uploadCount += photos.length;
    renderCollections(); return true;
  } catch (error) {
    for (const item of photos) item.collectionState = 'failed';
    setStatus(`${photos.length} photo${photos.length === 1 ? '' : 's'} uploaded, but collection assignment failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    return false;
  } finally { render(); }
}

async function runUpload(targets) {
  const token = tokenInput.value.trim();
  const destination = destinationSelect.value;
  if (!token || !destination) { setStatus('Connect to Micro.blog and choose a destination first.'); return; }
  if (!targets.length) return;
  busy = true; setStatus(`Uploading ${targets.length} file${targets.length === 1 ? '' : 's'}…`); render();
  for (const item of targets) await uploadItem(item, token, destination);
  const uploadedNow = targets.filter(item => item.state === 'uploaded');
  let collectionOk = true;
  if (selectedCollection()) collectionOk = await addToSelectedCollection(uploadedNow);
  busy = false;
  const failed = failedItems().length;
  if (collectionOk) setStatus(failed
    ? `${uploadedItems().length} uploaded; ${failed} failed.${retryableFailedItems().length ? ' Retry is available.' : ''}`
    : `${uploadedItems().length} file${uploadedItems().length === 1 ? '' : 's'} uploaded to Micro.blog.`);
  render();
}

async function copyText(text, successMessage) {
  try { await navigator.clipboard.writeText(text); setStatus(successMessage); }
  catch {
    const textarea = document.createElement('textarea'); textarea.value = text; textarea.setAttribute('readonly', ''); textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.append(textarea); textarea.select();
    const copied = document.execCommand('copy'); textarea.remove(); setStatus(copied ? successMessage : 'Could not copy automatically.');
  }
}

toggleToken.addEventListener('click', () => { const showing = tokenInput.type === 'text'; tokenInput.type = showing ? 'password' : 'text'; toggleToken.textContent = showing ? 'Show' : 'Hide'; toggleToken.setAttribute('aria-pressed', String(!showing)); });
tokenInput.addEventListener('input', () => { if (connectedToken && tokenInput.value.trim() !== connectedToken) { collectionPanel.hidden = true; connectedToken = ''; upstreamMediaEndpoint = ''; collections = []; loadingCollections = false; } render(); });
connectButton.addEventListener('click', connect);
destinationSelect.addEventListener('change', async () => { try { await loadCollections(); setStatus('Destination updated. Photo collections apply only to images.'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not load collections.'); } });
collectionSelect.addEventListener('change', render);
newCollectionName.addEventListener('input', render);
createCollectionButton.addEventListener('click', async () => {
  const token = tokenInput.value.trim(), destination = destinationSelect.value, name = newCollectionName.value.trim();
  if (!token || !destination || !name) return;
  busy = true; setStatus(`Creating “${name}”…`); render();
  try {
    const created = await createMicroblogCollection(token, destination, name);
    newCollectionName.value = '';
    await loadCollections();
    const match = collections.find(collection => collection.url === created.url) || collections.find(collection => collection.name === created.name);
    if (match) collectionSelect.value = match.url;
    setStatus(`Created photo collection “${created.name}”.`);
  } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not create collection.'); }
  finally { busy = false; renderCollections(); render(); }
});
filesInput.addEventListener('change', async event => { await addFiles(event.target.files); event.target.value = ''; });
dropZone.addEventListener('dragover', event => { event.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', async event => { event.preventDefault(); dropZone.classList.remove('dragging'); await addFiles(event.dataTransfer.files); });
uploadButton.addEventListener('click', () => runUpload(queuedItems()));
retryButton.addEventListener('click', () => { for (const item of retryableFailedItems()) { item.state = 'queued'; item.error = ''; } runUpload(queuedItems()); });
retryCollectionButton.addEventListener('click', () => addToSelectedCollection(uploadedItems().filter(item => item.collectionState === 'failed')));
clearButton.addEventListener('click', () => { items = []; setStatus('Queue cleared.'); render(); });
copyUrlsButton.addEventListener('click', () => copyText(uploadedItems().map(item => item.url).join('\n'), 'Copied URLs.'));
copyMarkdownButton.addEventListener('click', () => copyText(uploadedItems().map(resultMarkdown).join('\n'), 'Copied Markdown.'));
copyHtmlButton.addEventListener('click', () => copyText(uploadedItems().map(resultHtml).join('\n'), 'Copied HTML.'));

render();
