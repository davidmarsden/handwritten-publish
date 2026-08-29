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

const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
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

function formatBytes(bytes) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
function basename(filename) { return filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Uploaded image'; }
function escapeHtml(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function escapeMarkdownAlt(value) { return value.replace(/([\\\[\]])/g, '\\$1'); }
function resultMarkdown(item) { return `![${escapeMarkdownAlt(basename(item.file.name))}](${item.url})`; }
function resultHtml(item) { return `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(basename(item.file.name))}">`; }
function setStatus(message) { statusEl.textContent = message; }
function selectedResults() { return items.filter(item => item.state === 'uploaded' && item.url); }
function queuedItems() { return items.filter(item => item.state === 'queued'); }
function failedItems() { return items.filter(item => item.state === 'failed'); }
function retryableFailedItems() { return failedItems().filter(item => item.retryable); }
function selectedCollection() { return collections.find(collection => collection.url === collectionSelect.value) || null; }

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
  return `${size} · ${item.mediaType || 'unknown type'}${note}`;
}

function renderCollections() {
  const selected = collectionSelect.value;
  collectionSelect.replaceChildren(new Option('Upload only — no collection', ''));
  for (const collection of collections) {
    collectionSelect.add(new Option(`${collection.name} (${collection.uploadCount})`, collection.url));
  }
  if (collections.some(collection => collection.url === selected)) collectionSelect.value = selected;
  const destination = destinationSelect.selectedOptions[0]?.textContent || '';
  collectionSummary.textContent = loadingCollections
    ? 'Loading collections…'
    : collections.length
      ? `${collections.length} collection${collections.length === 1 ? '' : 's'} on ${destination}.`
      : destination ? `No photo collections yet on ${destination}. Create one here if you like.` : '';
}

function render() {
  const queued = queuedItems();
  const retryable = retryableFailedItems();
  const uploaded = selectedResults();
  const collectionFailures = uploaded.filter(item => item.collectionState === 'failed');

  queueEl.replaceChildren(...items.map(item => {
    const li = document.createElement('li');
    const details = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = item.file.name;
    const meta = document.createElement('div');
    meta.className = 'file-meta';
    meta.textContent = itemMeta(item);
    details.append(name, meta);
    const state = document.createElement('div');
    state.className = `file-status ${item.state}`;
    state.textContent = statusLabel(item);
    li.append(details, state);
    return li;
  }));

  selectionSummary.hidden = !items.length;
  selectionSummary.textContent = items.length ? `${items.length} image${items.length === 1 ? '' : 's'} selected.` : '';
  uploadButton.disabled = busy || loadingCollections || !tokenInput.value.trim() || !queued.length;
  uploadButton.textContent = busy ? 'Working…' : `Upload queued image${queued.length === 1 ? '' : 's'}`;
  retryButton.hidden = !retryable.length;
  retryButton.disabled = busy || loadingCollections || !tokenInput.value.trim();
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
    const copy = document.createElement('button');
    copy.className = 'button secondary item-copy';
    copy.type = 'button';
    copy.textContent = 'Copy URL';
    copy.addEventListener('click', () => copyText(item.url, `Copied URL for ${item.file.name}.`));
    li.append(details, copy);
    return li;
  }));
}

async function loadCollections() {
  const token = tokenInput.value.trim();
  const destination = destinationSelect.value;
  collections = [];
  loadingCollections = Boolean(token && destination);
  renderCollections();
  render();
  if (!token || !destination) {
    loadingCollections = false;
    renderCollections();
    render();
    return;
  }
  try {
    collections = await fetchMicroblogCollections(token, destination);
  } finally {
    loadingCollections = false;
    renderCollections();
    render();
  }
}

async function connect() {
  const token = tokenInput.value.trim();
  if (!token) return;
  busy = true; setStatus('Connecting to Micro.blog…'); render();
  try {
    const config = await fetchMicroblogConfig(token);
    if (!config.destinations.length) throw new Error('Micro.blog returned no blogs for this token.');
    destinationSelect.replaceChildren(...config.destinations.map(destination => new Option(destination.name, destination.uid)));
    connectedToken = token;
    collectionPanel.hidden = false;
    await loadCollections();
    setStatus('Connected. Collection assignment is optional.');
  } catch (error) {
    collectionPanel.hidden = true;
    setStatus(error instanceof Error ? error.message : 'Could not connect to Micro.blog.');
  } finally { busy = false; render(); }
}

async function stableBrowserFile(file, mediaType) {
  const bytes = await file.arrayBuffer();
  return new File([bytes], file.name, {
    type: mediaType || file.type,
    lastModified: file.lastModified,
  });
}

async function addFiles(fileList) {
  const incoming = Array.from(fileList ?? []);
  if (!incoming.length || busy) return;
  const room = Math.max(0, MAX_FILES - items.length);
  const accepted = incoming.slice(0, room);
  const rejected = incoming.length - accepted.length;

  busy = true;
  setStatus(`Preparing ${accepted.length} selected image${accepted.length === 1 ? '' : 's'}…`);
  render();

  const staged = await Promise.all(accepted.map(async file => {
    const mediaType = inferImageMediaType(file);
    let state = 'queued', error = '', retryable = true;
    let stableFile = file;

    if (!SUPPORTED_TYPES.has(mediaType)) {
      state = 'failed'; error = 'PNG, JPEG or WebP only'; retryable = false;
    } else if (!file.size) {
      state = 'failed'; error = 'Empty file'; retryable = false;
    } else {
      try {
        stableFile = await stableBrowserFile(file, mediaType);
      } catch {
        state = 'failed';
        error = 'Could not read this photo from the selected provider. Select it again or save it to the device first.';
        retryable = false;
      }
    }

    return {
      id: crypto.randomUUID(),
      file: stableFile,
      mediaType,
      state,
      error,
      url: '',
      retryable,
      collectionState: 'none',
      needsOptimization: stableFile.size > SAFE_UPLOAD_BYTES,
      optimizedBytes: null,
    };
  }));

  items.push(...staged);
  busy = false;

  const invalid = staged.filter(item => item.state === 'failed').length;
  const oversized = staged.filter(item => item.state === 'queued' && item.needsOptimization).length;
  if (rejected) setStatus(`Added ${staged.length}; batches are limited to ${MAX_FILES} files.`);
  else if (invalid) setStatus(`Added ${staged.length} files; ${invalid} need attention.${oversized ? ` ${oversized} oversized photo${oversized === 1 ? '' : 's'} will be optimized automatically.` : ''}`);
  else if (oversized) setStatus(`Added ${staged.length} images. ${oversized} oversized photo${oversized === 1 ? '' : 's'} will be optimized automatically before upload.`);
  else setStatus(`${staged.length} image${staged.length === 1 ? '' : 's'} added.`);
  render();
}

async function uploadItem(item, token) {
  item.error = '';
  item.retryable = true;
  item.optimizedBytes = null;
  try {
    if (item.needsOptimization) {
      item.state = 'optimizing';
      render();
    }
    const prepared = await preparePhotoForMicroblog(item.file, item.mediaType);
    item.optimizedBytes = prepared.optimized ? prepared.uploadBytes : null;
    item.state = 'uploading';
    render();
    item.url = await uploadMicroblogMedia(
      token,
      prepared.file,
      prepared.file.name,
      prepared.optimized ? prepared.file.type : item.mediaType,
    );
    item.state = 'uploaded';
    item.retryable = false;
    item.collectionState = 'none';
  } catch (error) {
    item.state = 'failed';
    item.error = error instanceof Error ? error.message : 'Upload failed';
    item.retryable = true;
  }
  render();
}

async function addToSelectedCollection(targets) {
  const collection = selectedCollection();
  const destination = destinationSelect.value;
  if (!collection || !destination || !targets.length) return true;
  for (const item of targets) item.collectionState = 'adding';
  render();
  try {
    await addPhotosToMicroblogCollection(tokenInput.value.trim(), destination, collection.url, targets.map(item => item.url));
    for (const item of targets) item.collectionState = 'added';
    const fresh = collections.find(entry => entry.url === collection.url);
    if (fresh) fresh.uploadCount += targets.length;
    renderCollections();
    setStatus(`${targets.length} photo${targets.length === 1 ? '' : 's'} added to “${collection.name}”.`);
    return true;
  } catch (error) {
    for (const item of targets) item.collectionState = 'failed';
    setStatus(`${targets.length} photo${targets.length === 1 ? '' : 's'} uploaded, but collection assignment failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    return false;
  } finally { render(); }
}

async function runUpload(targets) {
  const token = tokenInput.value.trim();
  if (!token) { setStatus('Paste your Micro.blog app token first.'); tokenInput.focus(); return; }
  if (!targets.length) return;
  busy = true; setStatus(`Uploading ${targets.length} image${targets.length === 1 ? '' : 's'}…`); render();
  for (const item of targets) await uploadItem(item, token);
  const uploadedNow = targets.filter(item => item.state === 'uploaded');
  let collectionOk = true;
  if (selectedCollection() && uploadedNow.length) collectionOk = await addToSelectedCollection(uploadedNow);
  busy = false;
  const failed = failedItems().length;
  if (collectionOk) {
    if (failed) setStatus(`${selectedResults().length} uploaded; ${failed} failed.${retryableFailedItems().length ? ' Retry is available.' : ''}`);
    else if (!selectedCollection()) setStatus(`${selectedResults().length} image${selectedResults().length === 1 ? '' : 's'} uploaded to Micro.blog.`);
  }
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
tokenInput.addEventListener('input', () => { if (connectedToken && tokenInput.value.trim() !== connectedToken) { collectionPanel.hidden = true; connectedToken = ''; collections = []; loadingCollections = false; } render(); });
connectButton.addEventListener('click', connect);
destinationSelect.addEventListener('change', async () => { try { await loadCollections(); setStatus('Collections updated for the selected blog.'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not load collections.'); } render(); });
collectionSelect.addEventListener('change', render);
newCollectionName.addEventListener('input', render);
createCollectionButton.addEventListener('click', async () => {
  const name = newCollectionName.value.trim(); if (!name) return;
  busy = true; setStatus(`Creating “${name}”…`); render();
  try {
    await createMicroblogCollection(tokenInput.value.trim(), destinationSelect.value, name);
    newCollectionName.value = '';
    await loadCollections();
    const created = collections.find(collection => collection.name === name);
    if (created) collectionSelect.value = created.url;
    setStatus(`Created “${name}” and selected it.`);
  } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not create collection.'); }
  finally { busy = false; render(); }
});
filesInput.addEventListener('change', async event => {
  const selected = event.target.files;
  await addFiles(selected);
  event.target.value = '';
});
for (const eventName of ['dragenter', 'dragover']) dropZone.addEventListener(eventName, event => { event.preventDefault(); if (!busy) dropZone.classList.add('dragging'); });
for (const eventName of ['dragleave', 'drop']) dropZone.addEventListener(eventName, event => { event.preventDefault(); dropZone.classList.remove('dragging'); });
dropZone.addEventListener('drop', async event => { if (!busy) await addFiles(event.dataTransfer?.files); });
uploadButton.addEventListener('click', () => runUpload(queuedItems()));
retryButton.addEventListener('click', () => { const retryable = retryableFailedItems(); for (const item of retryable) { item.state = 'queued'; item.error = ''; } render(); return runUpload(retryable); });
retryCollectionButton.addEventListener('click', async () => { const targets = selectedResults().filter(item => item.collectionState === 'failed'); if (!targets.length) return; busy = true; render(); await addToSelectedCollection(targets); busy = false; render(); });
clearButton.addEventListener('click', () => { items = []; setStatus('Cleared.'); render(); });
copyUrlsButton.addEventListener('click', () => { const results = selectedResults(); return copyText(results.map(item => item.url).join('\n'), `Copied ${results.length} URL${results.length === 1 ? '' : 's'}.`); });
copyMarkdownButton.addEventListener('click', () => { const results = selectedResults(); return copyText(results.map(resultMarkdown).join('\n'), `Copied Markdown for ${results.length} image${results.length === 1 ? '' : 's'}.`); });
copyHtmlButton.addEventListener('click', () => { const results = selectedResults(); return copyText(results.map(resultHtml).join('\n'), `Copied HTML for ${results.length} image${results.length === 1 ? '' : 's'}.`); });
render();