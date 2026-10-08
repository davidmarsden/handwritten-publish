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

import { planAudioSegments, audioPartFilename } from './audio-plan.js';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a']);
const OGG_TYPES = new Set(['audio/ogg', 'application/ogg']);
const VIDEO_TYPES = new Set(['video/mp4']);
const PDF_TYPE = 'application/pdf';
const STREAMED_MEDIA_MAX_BYTES = 100_000_000;
const MAX_FILES = 30;
const AUDIO_LIMIT = 25_000_000;
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
const audioConvert = $('#audio-convert');
const audioSplit = $('#audio-split');
const audioMinutes = $('#audio-minutes');
const audioPreview = $('#audio-preview');
const downloadAudioZipButton = $('#download-audio-zip');
const cancelAudioButton = $('#cancel-audio');
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
const generatedAudio = new Map();

function formatBytes(bytes) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function isProcessableAudio(file) { return /\.(mp3|m4a|mp4|wav)$/i.test(file.name) || /^(audio\/(mpeg|mp3|mp4|x-m4a|wav|x-wav))$/i.test(file.type); }
function isAudioOnlyMp4(file) { return /\.mp4$/i.test(file.name) || file.type === 'video/mp4'; }
function inferAudioType(file) {
  const type = (file.type || '').toLowerCase();
  if (type === 'audio/mpeg' || type === 'audio/mp3') return 'audio/mpeg';
  if (type === 'audio/mp4' || type === 'audio/x-m4a') return 'audio/mp4';
  if (OGG_TYPES.has(type)) return 'audio/ogg';
  const name = file.name.toLowerCase();
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.m4a')) return 'audio/mp4';
  if (name.endsWith('.ogg') || name.endsWith('.oga')) return 'audio/ogg';
  return '';
}

function inferVideoType(file) {
  const type = (file.type || '').toLowerCase();
  if (type === 'video/mp4') return 'video/mp4';
  if ((!type || type === 'application/octet-stream') && file.name.toLowerCase().endsWith('.mp4')) return 'video/mp4';
  return '';
}

function inferDocumentType(file) {
  const type = (file.type || '').toLowerCase();
  if (type === PDF_TYPE || file.name.toLowerCase().endsWith('.pdf')) return PDF_TYPE;
  return '';
}

function classifyFile(file) {
  const imageType = inferImageMediaType(file);
  if (IMAGE_TYPES.has(imageType)) return { kind: 'image', mediaType: imageType };
  const audioType = inferAudioType(file);
  if (audioType === 'audio/ogg') return { kind: 'ogg', mediaType: audioType };
  if (AUDIO_TYPES.has(audioType)) return { kind: 'audio', mediaType: audioType };
  const videoType = inferVideoType(file);
  if (VIDEO_TYPES.has(videoType)) return { kind: 'video', mediaType: videoType };
  const documentType = inferDocumentType(file);
  if (documentType) return { kind: 'document', mediaType: documentType };
  return { kind: 'unsupported', mediaType: file.type || '' };
}

function basename(filename) {
  return filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Uploaded file';
}
function documentLabel(item) { return `${basename(item.file.name)} (PDF)`; }
function escapeHtml(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function escapeMarkdown(value) { return value.replace(/([\\\[\]])/g, '\\$1'); }
function setStatus(message) { statusEl.textContent = message; }
function uploadedItems() { return items.filter(item => item.state === 'uploaded' && item.url); }
function queuedItems() { return items.filter(item => item.state === 'queued'); }
function failedItems() { return items.filter(item => item.state === 'failed'); }
function retryableFailedItems() { return failedItems().filter(item => item.retryable); }
function selectedCollection() { return collections.find(collection => collection.url === collectionSelect.value) || null; }
function photoItems(targets = items) { return targets.filter(item => item.kind === 'image'); }
function connectionReady() {
  const token = tokenInput.value.trim();
  return Boolean(connectedToken && token === connectedToken && destinationSelect.value);
}

function imageAlt(item) { return item.altText || basename(item.file.name); }
function resultMarkdown(item) {
  if (item.kind === 'image') return `![${escapeMarkdown(imageAlt(item))}](${item.url})`;
  if (item.kind === 'document') return `[${escapeMarkdown(documentLabel(item))}](${item.url})`;
  return `[${escapeMarkdown(item.file.name)}](${item.url})`;
}
function resultHtml(item) {
  if (item.kind === 'image') return `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(imageAlt(item))}">`;
  if (item.kind === 'document') return `<a href="${escapeHtml(item.url)}">${escapeHtml(documentLabel(item))}</a>`;
  if (item.kind === 'video') return `<video controls preload="metadata" src="${escapeHtml(item.url)}"></video>`;
  return `<audio controls preload="none" src="${escapeHtml(item.url)}"></audio>`;
}

function statusLabel(item) {
  if (item.state === 'processing') return 'Converting audio…';
  if (item.state === 'optimizing') return 'Optimizing…';
  if (item.state === 'uploading') return 'Uploading…';
  if (item.state === 'uploaded' && item.collectionState === 'adding') return 'Adding to collection…';
  if (item.state === 'uploaded' && item.collectionState === 'added') return item.optimizedBytes ? 'Uploaded · optimized · collected' : 'Uploaded · collected';
  if (item.state === 'uploaded' && item.collectionState === 'failed') return item.optimizedBytes ? 'Uploaded · optimized · collection failed' : 'Uploaded · collection failed';
  if (item.state === 'uploaded' && item.existing) return 'Already uploaded · reused';
  if (item.state === 'uploaded' && item.recovered) return 'Uploaded · recovered';
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
      : destination ? `No photo collections yet on ${destination}. Video, audio and PDF uploads ignore this setting.` : '';
}

function render() {
  const queued = queuedItems();
  const retryable = retryableFailedItems();
  const uploaded = uploadedItems();
  const ready = connectionReady();
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
    const videos = items.filter(item => item.kind === 'video').length;
    const audio = items.filter(item => item.kind === 'audio').length;
    const documents = items.filter(item => item.kind === 'document').length;
    selectionSummary.textContent = `${items.length} file${items.length === 1 ? '' : 's'} selected · ${images} image${images === 1 ? '' : 's'} · ${videos} video${videos === 1 ? '' : 's'} · ${audio} audio · ${documents} PDF${documents === 1 ? '' : 's'}`;
  }
  audioPreview.textContent = items.some(item => item.kind === 'audio') ? 'Audio conversion and splitting will run before upload. Source files are preserved.' : '';
  cancelAudioButton.hidden = !busy;
  downloadAudioZipButton.hidden = generatedAudio.size === 0;
  downloadAudioZipButton.disabled = busy;
  audioConvert.disabled = busy;
  audioSplit.disabled = busy;
  audioMinutes.disabled = busy || !audioSplit.checked;
  uploadButton.disabled = busy || loadingCollections || !ready || !queued.length;
  uploadButton.textContent = busy ? 'Working…' : `Upload queued file${queued.length === 1 ? '' : 's'}`;
  retryButton.hidden = !retryable.length;
  retryButton.disabled = busy || loadingCollections || !ready;
  retryCollectionButton.hidden = !collectionFailures.length;
  retryCollectionButton.disabled = busy || loadingCollections || !ready || !selectedCollection();
  clearButton.disabled = busy || !items.length;
  filesInput.disabled = busy;
  tokenInput.disabled = busy;
  toggleToken.disabled = busy;
  connectButton.disabled = busy || !tokenInput.value.trim();
  destinationSelect.disabled = busy || loadingCollections || !connectedToken;
  collectionSelect.disabled = busy || loadingCollections || !ready;
  newCollectionName.disabled = busy || loadingCollections || !ready;
  createCollectionButton.disabled = busy || loadingCollections || !ready || !newCollectionName.value.trim();

  resultsSection.hidden = !uploaded.length;
  resultsSummary.textContent = uploaded.length ? `${uploaded.length} successful upload${uploaded.length === 1 ? '' : 's'}.` : '';
  uploadedList.replaceChildren(...uploaded.map(item => {
    const li = document.createElement('li');
    const details = document.createElement('div');
    const name = document.createElement('div'); name.className = 'file-name'; name.textContent = item.file.name;
    const url = document.createElement('a'); url.className = 'uploaded-url'; url.href = item.url; url.target = '_blank'; url.rel = 'noreferrer'; url.textContent = item.url;
    details.append(name, url);
    if (item.kind === 'image') {
      const alt = document.createElement('textarea');
      alt.className = 'alt-text';
      alt.rows = 2;
      alt.placeholder = item.altState === 'loading' ? 'Micro.blog is generating accessibility text…' : 'Accessibility description';
      alt.value = item.altText || '';
      alt.setAttribute('aria-label', `Accessibility description for ${item.file.name}`);
      alt.addEventListener('input', event => {
        item.altText = event.target.value;
        item.altState = 'edited';
      });
      details.append(alt);
    }
    if (item.kind === 'audio') {
      const player = document.createElement('audio'); player.controls = true; player.preload = 'none'; player.src = item.url; details.append(player);
    } else if (item.kind === 'video') {
      const player = document.createElement('video'); player.controls = true; player.preload = 'metadata'; player.src = item.url; details.append(player);
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
    collectionPanel.hidden = true;
    connectedToken = '';
    upstreamMediaEndpoint = '';
    destinationSelect.replaceChildren();
    collections = [];
    renderCollections();
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
    if (kind === 'ogg') { state = 'failed'; error = 'Micro.blog does not currently accept OGG uploads. Convert this file to MP3 or M4A first.'; retryable = false; }
    else if (kind === 'unsupported') { state = 'failed'; error = 'PNG, JPEG, WebP, MP3, M4A, MP4 or PDF only'; retryable = false; }
    else if (!file.size) { state = 'failed'; error = 'Empty file'; retryable = false; }
    else if ((kind === 'audio' || kind === 'video' || kind === 'document') && file.size > STREAMED_MEDIA_MAX_BYTES) {
      state = 'failed'; error = `${formatBytes(file.size)} exceeds BUM Hand’s 100 MB native-form media limit`; retryable = false;
    } else {
      try { stableFile = await stableBrowserFile(file, mediaType); }
      catch { state = 'failed'; error = 'Could not read this file from the selected provider. Select it again or save it to the device first.'; retryable = false; }
    }
    return {
      id: crypto.randomUUID(), file: stableFile, kind, mediaType, state, error, url: '', retryable,
      collectionState: 'none', needsOptimization: kind === 'image' && stableFile.size > SAFE_UPLOAD_BYTES, optimizedBytes: null, recovered: false, existing: false,
      altText: '', altState: kind === 'image' ? 'waiting' : 'none',
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

async function recentStreamedMedia(item, token, destination) {
  if (!upstreamMediaEndpoint) upstreamMediaEndpoint = await fetchUpstreamMediaEndpoint(token);
  const response = await fetch('/api/microblog/stream-media', {
    method: 'POST',
    headers: {
      'X-BUM-Action': 'recent',
      'X-Microblog-Token': token,
      'X-Microblog-Media-Endpoint': encodeURIComponent(upstreamMediaEndpoint),
      'X-Microblog-Destination': encodeURIComponent(destination),
      'X-File-Name': encodeURIComponent(item.file.name),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not check recent Micro.blog uploads.');
  return Array.isArray(payload.urls) ? payload.urls : [];
}

async function uploadStreamedMedia(item, token, destination) {
  if (!upstreamMediaEndpoint) upstreamMediaEndpoint = await fetchUpstreamMediaEndpoint(token);
  let before = null;
  try {
    before = await recentStreamedMedia(item, token, destination);
    // BUM Hand deliberately treats an existing same-name upload as the same media.
    // For this workflow, filename is the identity key: reuse its canonical URL rather
    // than creating Micro.blog's hash-named collision copy.
    if (before.length) return { url: before[0], recovered: false, existing: true };
  } catch { /* Upload can still proceed; recovery will be conservative. */ }
  try {
    const response = await fetch('/api/microblog/stream-media', {
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
    if (!response.ok) {
      const rejection = new Error(payload.error || `Could not upload ${item.file.name}.`);
      rejection.name = 'DefinitiveUploadFailure';
      throw rejection;
    }
    if (!payload.url) {
      const acceptedWithoutUrl = new Error(`Micro.blog uploaded ${item.file.name} but returned no media URL.`);
      acceptedWithoutUrl.name = 'AmbiguousUploadFailure';
      throw acceptedWithoutUrl;
    }
    return { url: payload.url, recovered: false, existing: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload response was lost';
    const ambiguous = error instanceof TypeError
      || (error instanceof Error && error.name === 'AmbiguousUploadFailure')
      || /failed to fetch|network/i.test(message);
    // A browser/proxy fetch can fail after Micro.blog has already accepted the bytes.
    // Reconcile only genuinely ambiguous outcomes; never turn a definitive 4xx/5xx into success.
    if (ambiguous && before) {
      try {
        const after = await recentStreamedMedia(item, token, destination);
        const previous = new Set(before);
        const recovered = after.find(url => !previous.has(url));
        if (recovered) return { url: recovered, recovered: true, existing: false };
      } catch { /* Preserve the original ambiguous failure below. */ }
    }
    if (ambiguous) {
      const uncertain = new Error('Upload status unknown — Micro.blog may have received this file. Reconnect or verify Uploads before trying again.');
      uncertain.name = 'UploadStatusUnknown';
      throw uncertain;
    }
    throw error;
  }
}

async function fetchGeneratedAltText(item, token, destination) {
  if (item.kind !== 'image' || !item.url) return;
  if (!upstreamMediaEndpoint) upstreamMediaEndpoint = await fetchUpstreamMediaEndpoint(token);
  item.altState = 'loading'; render();
  for (let remaining = 10; remaining >= 0; remaining -= 1) {
    try {
      const response = await fetch('/api/microblog/stream-media', {
        method: 'POST',
        headers: {
          'X-BUM-Action': 'alt',
          'X-Microblog-Token': token,
          'X-Microblog-Media-Endpoint': encodeURIComponent(upstreamMediaEndpoint),
          'X-Microblog-Destination': encodeURIComponent(destination),
          'X-Media-URL': encodeURIComponent(item.url),
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.alt) {
        if (item.altState !== 'edited') {
          item.altText = payload.alt;
          item.altState = 'generated';
          render();
        }
        return;
      }
    } catch { /* Keep polling; alt generation is asynchronous. */ }
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, 4000));
  }
  if (item.altState !== 'edited') {
    item.altState = 'unavailable';
    render();
  }
}

async function uploadItem(item, token, destination) {
  item.error = ''; item.retryable = true; item.optimizedBytes = null;
  try {
    if (item.kind === 'audio' || item.kind === 'video' || item.kind === 'document') {
      item.state = 'uploading'; render();
      const streamed = await uploadStreamedMedia(item, token, destination);
      item.url = streamed.url;
      item.recovered = streamed.recovered;
      item.existing = streamed.existing;
    } else {
      if (item.needsOptimization) { item.state = 'optimizing'; render(); }
      const prepared = await preparePhotoForMicroblog(item.file, item.mediaType);
      item.optimizedBytes = prepared.optimized ? prepared.uploadBytes : null;
      item.state = 'uploading'; render();
      item.url = await uploadMicroblogMedia(
        token,
        prepared.file,
        prepared.file.name,
        prepared.optimized ? prepared.file.type : item.mediaType,
        destination,
      );
    }
    item.state = 'uploaded'; item.retryable = false; item.collectionState = 'none';
    if (item.kind === 'image') void fetchGeneratedAltText(item, token, destination);
  } catch (error) {
    item.state = 'failed';
    item.error = error instanceof Error ? error.message : 'Upload failed';
    item.retryable = !(error instanceof Error && error.name === 'UploadStatusUnknown');
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

let ffmpegInstance;
let audioCancelRequested = false;
let activeAudioEncoder = null;
function assertAudioNotCancelled() { if (audioCancelRequested) throw new Error('Audio processing cancelled.'); }
async function getAudioEncoder() {
  if (ffmpegInstance) return ffmpegInstance;
  // All worker, JavaScript and WASM assets are copied from pinned npm packages
  // into /bum/vendor/ at build time. No CDN worker, Blob URL or cross-origin import.
  setStatus('Loading locally packaged FFmpeg modules…');
  const [{ FFmpeg }] = await Promise.all([
    import('/bum/vendor/ffmpeg/index.js'),
  ]);
  setStatus('Starting local audio encoder…');
  const ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ message }) => {
    if (/error|failed|invalid|unknown encoder/i.test(message)) setStatus('FFmpeg: ' + message.slice(0, 220));
  });
  const base = '/bum/vendor/core';
  const workerURL = new URL('/bum/vendor/ffmpeg/worker.js', window.location.origin).href;
  let startupTimeout;
  try {
    await Promise.race([
      ffmpeg.load({
        classWorkerURL: workerURL,
        coreURL: base + '/ffmpeg-core.js',
        wasmURL: base + '/ffmpeg-core.wasm',
      }),
      new Promise((_, reject) => {
        startupTimeout = setTimeout(() => reject(new Error('Local FFmpeg encoder did not start within 45 seconds.')), 45000);
      }),
    ]);
  } catch (error) {
    ffmpeg.terminate();
    throw error;
  } finally {
    clearTimeout(startupTimeout);
  }
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}
async function processAudioFile(file, { convert, split, segmentMinutes }) {
  if (!isProcessableAudio(file)) throw new Error('Unsupported audio format.');
  if (isAudioOnlyMp4(file)) throw new Error('MP4 video requires explicit audio extraction; select an audio-only M4A instead.');
  setStatus('Reading audio duration…');
  const duration = await new Promise((resolve, reject) => {
    const element = document.createElement('audio'); const url = URL.createObjectURL(file);
    const finish = (value, error) => { element.removeAttribute('src'); element.load(); URL.revokeObjectURL(url); error ? reject(error) : resolve(value); };
    element.onloadedmetadata = () => Number.isFinite(element.duration) && element.duration > 0 ? finish(element.duration) : finish(null, new Error('Could not determine audio duration.'));
    element.onerror = () => finish(null, new Error('Cannot decode this audio file.'));
    element.preload = 'metadata'; element.src = url;
  });
  const segments = planAudioSegments(duration, { split, segmentMinutes });
  if (!convert && segments.length === 1) return [file];
  if (!convert && segments.length > 1) throw new Error('Enable MP3 conversion to split this audio.');
  if (file.size > AUDIO_LIMIT) throw new Error('Audio exceeds the 25 MB browser processing limit.');
  if (/\.mp3$/i.test(file.name) && segments.length === 1) return [file];
  assertAudioNotCancelled();
  const ffmpeg = await getAudioEncoder();
  setStatus('Audio encoder ready. Preparing source file…');
  activeAudioEncoder = ffmpeg;
  const input = 'input-' + crypto.randomUUID() + '.' + (file.name.split('.').pop() || 'm4a').toLowerCase();
  const outputs = [];
  try {
    setStatus('Copying source audio into encoder…');
    await ffmpeg.writeFile(input, new Uint8Array(await file.arrayBuffer()));
    for (const segment of segments) {
      assertAudioNotCancelled();
      setStatus(`Encoding part ${segment.index} of ${segments.length} for ${file.name}…`);
      const output = 'output-' + crypto.randomUUID() + '.mp3';
      const args = ['-ss', String(segment.startSeconds), '-i', input, '-t', String(segment.durationSeconds), '-vn', '-codec:a', 'libmp3lame', '-b:a', '192k', '-y', output];
      let lastProgress = -1;
      const onProgress = ({ progress }) => {
        const pct = Math.max(0, Math.min(99, Math.round(progress * 100)));
        if (pct >= lastProgress + 5) { lastProgress = pct; setStatus(`Encoding part ${segment.index} of ${segments.length}: ${pct}%…`); }
      };
      ffmpeg.on('progress', onProgress);
      let code;
      try { code = await ffmpeg.exec(args, 180000); }
      finally { ffmpeg.off('progress', onProgress); }
      if (code !== 0) throw new Error('MP3 conversion failed.');
      assertAudioNotCancelled();
      const bytes = await ffmpeg.readFile(output);
      if (!bytes.length) throw new Error('Encoder returned an empty audio file.');
      const name = segments.length === 1 ? file.name.replace(/\.[^.]+$/, '') + '.mp3' : audioPartFilename(file.name, segment.index, segments.length);
      outputs.push(new File([bytes], name, { type: 'audio/mpeg' }));
      await ffmpeg.deleteFile(output);
    }
    return outputs;
  } finally { activeAudioEncoder = null; await ffmpeg.deleteFile(input).catch(() => undefined); }
}

async function runUpload(targets) {
  const token = tokenInput.value.trim();
  const destination = destinationSelect.value;
  if (!connectionReady()) { setStatus('Connect to Micro.blog with the current token and choose a destination first.'); return; }
  if (!targets.length) return;
  audioCancelRequested = false;
  busy = true; setStatus(`Uploading ${targets.length} file${targets.length === 1 ? '' : 's'}…`); render();
  for (const item of targets) {
    if (audioCancelRequested) break;
    if (item.kind === 'audio' && (audioConvert.checked || audioSplit.checked)) {
      try {
        item.state = 'processing'; render();
        const parts = await processAudioFile(item.file, { convert: audioConvert.checked, split: audioSplit.checked, segmentMinutes: Number(audioMinutes.value) });
        if (parts.some(part => part !== item.file)) for (const part of parts) generatedAudio.set(part.name, part);
        if (parts.length === 1) {
          item.file = parts[0]; item.mediaType = parts[0].type || 'audio/mpeg'; item.state = 'queued';
          await uploadItem(item, token, destination);
        } else {
          item.state = 'processing'; item.url = ''; item.retryable = false;
          const at = items.indexOf(item);
          const segmentItems = parts.map(file => ({ ...item, id: crypto.randomUUID(), file, mediaType: 'audio/mpeg', state: 'queued', url: '', error: '', retryable: true, parentName: item.file.name }));
          items.splice(at, 1, ...segmentItems);
          for (const part of segmentItems) {
            if (audioCancelRequested) break;
            await uploadItem(part, token, destination);
          }
        }
      } catch (error) {
        item.state = 'failed'; item.error = error instanceof Error ? error.message : 'Audio conversion failed'; item.retryable = true; render();
      }
    } else await uploadItem(item, token, destination);
  }
  const uploadedNow = targets.filter(item => item.state === 'uploaded' && item.url);
  let collectionOk = true;
  if (selectedCollection()) collectionOk = await addToSelectedCollection(uploadedNow);
  busy = false;
  const failed = failedItems().length;
  if (audioCancelRequested) setStatus('Stopped. Files not yet uploaded remain in the queue.');
  else if (collectionOk) setStatus(failed
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
tokenInput.addEventListener('input', () => {
  if (connectedToken && tokenInput.value.trim() !== connectedToken) {
    collectionPanel.hidden = true;
    connectedToken = '';
    upstreamMediaEndpoint = '';
    collections = [];
    loadingCollections = false;
    destinationSelect.replaceChildren();
    renderCollections();
  }
  render();
});
connectButton.addEventListener('click', connect);
destinationSelect.addEventListener('change', async () => { try { await loadCollections(); setStatus('Destination updated. Photo collections apply only to images.'); } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not load collections.'); } });
collectionSelect.addEventListener('change', render);
newCollectionName.addEventListener('input', render);
createCollectionButton.addEventListener('click', async () => {
  const token = tokenInput.value.trim(), destination = destinationSelect.value, name = newCollectionName.value.trim();
  if (!connectionReady() || !name) return;
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
audioSplit.addEventListener('change', render);
cancelAudioButton.addEventListener('click', () => { audioCancelRequested = true; setStatus('Stopping after the current operation…'); });
downloadAudioZipButton.addEventListener('click', async () => {
  try {
    const { default: JSZip } = await import('https://esm.sh/jszip@3.10.1');
    const zip = new JSZip();
    for (const [name, file] of generatedAudio) zip.file(name, file);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'bum-hand-audio.zip'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not create audio ZIP.'); }
});
clearButton.addEventListener('click', () => { generatedAudio.clear(); items = []; setStatus('Queue cleared.'); render(); });
copyUrlsButton.addEventListener('click', () => copyText(uploadedItems().map(item => item.url).join('\n'), 'Copied URLs.'));
copyMarkdownButton.addEventListener('click', () => copyText(uploadedItems().map(resultMarkdown).join('\n'), 'Copied Markdown.'));
copyHtmlButton.addEventListener('click', () => copyText(uploadedItems().map(resultHtml).join('\n'), 'Copied HTML.'));

render();