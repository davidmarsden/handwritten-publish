import {
  MICROBLOG_MAX_MEDIA_BYTES as MAX_BYTES,
  inferImageMediaType,
  uploadMicroblogMedia,
} from '/shared/microblog-client.js';

const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_FILES = 30;

const tokenInput = document.querySelector('#token');
const toggleToken = document.querySelector('#toggle-token');
const filesInput = document.querySelector('#files');
const dropZone = document.querySelector('#drop-zone');
const selectionSummary = document.querySelector('#selection-summary');
const queueEl = document.querySelector('#queue');
const uploadButton = document.querySelector('#upload');
const retryButton = document.querySelector('#retry');
const clearButton = document.querySelector('#clear');
const resultsSection = document.querySelector('#results');
const resultsSummary = document.querySelector('#results-summary');
const uploadedList = document.querySelector('#uploaded-list');
const statusEl = document.querySelector('#status');
const copyUrlsButton = document.querySelector('#copy-urls');
const copyMarkdownButton = document.querySelector('#copy-markdown');
const copyHtmlButton = document.querySelector('#copy-html');

let items = [];
let busy = false;

function formatBytes(bytes) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function basename(filename) {
  return filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Uploaded image';
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeMarkdownAlt(value) {
  return value.replace(/([\\\[\]])/g, '\\$1');
}

function resultMarkdown(item) {
  return `![${escapeMarkdownAlt(basename(item.file.name))}](${item.url})`;
}

function resultHtml(item) {
  return `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(basename(item.file.name))}">`;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function selectedResults() {
  return items.filter(item => item.state === 'uploaded' && item.url);
}

function queuedItems() {
  return items.filter(item => item.state === 'queued');
}

function failedItems() {
  return items.filter(item => item.state === 'failed');
}

function retryableFailedItems() {
  return failedItems().filter(item => item.retryable);
}

function statusLabel(item) {
  if (item.state === 'uploading') return 'Uploading…';
  if (item.state === 'uploaded') return 'Uploaded';
  if (item.state === 'failed') return item.error || 'Failed';
  return 'Queued';
}

function render() {
  const queued = queuedItems();
  const retryable = retryableFailedItems();
  const uploaded = selectedResults();

  queueEl.replaceChildren(...items.map(item => {
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
    state.textContent = statusLabel(item);
    li.append(details, state);
    return li;
  }));

  if (items.length) {
    selectionSummary.hidden = false;
    selectionSummary.textContent = `${items.length} image${items.length === 1 ? '' : 's'} selected.`;
  } else {
    selectionSummary.hidden = true;
    selectionSummary.textContent = '';
  }

  uploadButton.disabled = busy || !tokenInput.value.trim() || queued.length === 0;
  uploadButton.textContent = busy ? 'Uploading…' : `Upload queued image${queued.length === 1 ? '' : 's'}`;
  retryButton.hidden = retryable.length === 0;
  retryButton.disabled = busy || !tokenInput.value.trim();
  clearButton.disabled = busy || items.length === 0;
  filesInput.disabled = busy;
  tokenInput.disabled = busy;
  toggleToken.disabled = busy;

  resultsSection.hidden = uploaded.length === 0;
  resultsSummary.textContent = uploaded.length
    ? `${uploaded.length} successful upload${uploaded.length === 1 ? '' : 's'}.`
    : '';

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
    copy.addEventListener('click', async () => {
      await copyText(item.url, `Copied URL for ${item.file.name}.`);
    });
    li.append(details, copy);
    return li;
  }));
}

function addFiles(fileList) {
  const incoming = Array.from(fileList ?? []);
  if (!incoming.length) return;

  const room = Math.max(0, MAX_FILES - items.length);
  const accepted = incoming.slice(0, room);
  const rejectedCount = incoming.length - accepted.length;
  let invalid = 0;

  for (const file of accepted) {
    const mediaType = inferImageMediaType(file);
    let state = 'queued';
    let error = '';
    let retryable = true;
    if (!SUPPORTED_TYPES.has(mediaType)) {
      state = 'failed';
      error = 'PNG, JPEG or WebP only';
      retryable = false;
    } else if (!file.size) {
      state = 'failed';
      error = 'Empty file';
      retryable = false;
    } else if (file.size > MAX_BYTES) {
      state = 'failed';
      error = `Over 5 MB (${formatBytes(file.size)})`;
      retryable = false;
    }
    if (state === 'failed') invalid += 1;
    items.push({ id: crypto.randomUUID(), file, mediaType, state, error, url: '', retryable });
  }

  if (rejectedCount > 0) {
    setStatus(`Added ${accepted.length}; BUM Hand currently limits a batch to ${MAX_FILES} files.`);
  } else {
    setStatus(invalid ? `Added ${accepted.length} files; ${invalid} need attention.` : `${accepted.length} image${accepted.length === 1 ? '' : 's'} added.`);
  }
  render();
}

async function uploadItem(item, token) {
  item.state = 'uploading';
  item.error = '';
  item.retryable = true;
  render();

  try {
    item.url = await uploadMicroblogMedia(token, item.file, item.file.name, item.mediaType);
    item.state = 'uploaded';
    item.retryable = false;
  } catch (error) {
    item.state = 'failed';
    item.error = error instanceof Error ? error.message : 'Upload failed';
    item.retryable = true;
  }
  render();
}

async function runUpload(targets) {
  const token = tokenInput.value.trim();
  if (!token) {
    setStatus('Paste your Micro.blog app token first.');
    tokenInput.focus();
    return;
  }
  if (!targets.length) return;

  busy = true;
  setStatus(`Uploading ${targets.length} image${targets.length === 1 ? '' : 's'}…`);
  render();

  for (const item of targets) {
    await uploadItem(item, token);
  }

  busy = false;
  const uploaded = selectedResults().length;
  const failed = failedItems().length;
  if (failed) {
    const retryable = retryableFailedItems().length;
    setStatus(`${uploaded} uploaded; ${failed} failed.${retryable ? ' Retry is available for upload failures.' : ''}`);
  } else {
    setStatus(`${uploaded} image${uploaded === 1 ? '' : 's'} uploaded to Micro.blog.`);
  }
  render();
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(successMessage);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    setStatus(copied ? successMessage : 'Could not copy automatically.');
  }
}

toggleToken.addEventListener('click', () => {
  const showing = tokenInput.type === 'text';
  tokenInput.type = showing ? 'password' : 'text';
  toggleToken.textContent = showing ? 'Show' : 'Hide';
  toggleToken.setAttribute('aria-pressed', String(!showing));
});

tokenInput.addEventListener('input', render);
filesInput.addEventListener('change', event => {
  addFiles(event.target.files);
  event.target.value = '';
});

for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    if (!busy) dropZone.classList.add('dragging');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    dropZone.classList.remove('dragging');
  });
}
dropZone.addEventListener('drop', event => {
  if (!busy) addFiles(event.dataTransfer?.files);
});

uploadButton.addEventListener('click', () => runUpload(queuedItems()));
retryButton.addEventListener('click', () => {
  const retryable = retryableFailedItems();
  for (const item of retryable) {
    item.state = 'queued';
    item.error = '';
  }
  render();
  return runUpload(retryable);
});

clearButton.addEventListener('click', () => {
  items = [];
  setStatus('Cleared.');
  render();
});

copyUrlsButton.addEventListener('click', () => {
  const results = selectedResults();
  return copyText(results.map(item => item.url).join('\n'), `Copied ${results.length} URL${results.length === 1 ? '' : 's'}.`);
});
copyMarkdownButton.addEventListener('click', () => {
  const results = selectedResults();
  return copyText(results.map(resultMarkdown).join('\n'), `Copied Markdown for ${results.length} image${results.length === 1 ? '' : 's'}.`);
});
copyHtmlButton.addEventListener('click', () => {
  const results = selectedResults();
  return copyText(results.map(resultHtml).join('\n'), `Copied HTML for ${results.length} image${results.length === 1 ? '' : 's'}.`);
});

render();
