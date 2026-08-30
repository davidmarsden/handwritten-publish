const token = document.querySelector('#token');
const connect = document.querySelector('#connect');
const connectionStatus = document.querySelector('#connection-status');
const destinationWrap = document.querySelector('#destination-wrap');
const destination = document.querySelector('#destination');
const file = document.querySelector('#file');
const fileNote = document.querySelector('#file-note');
const title = document.querySelector('#title');
const statusSelect = document.querySelector('#status-select');
const categories = document.querySelector('#categories');
const summary = document.querySelector('#summary');
const publish = document.querySelector('#publish');
const publishStatus = document.querySelector('#publish-status');
const results = document.querySelector('#results');
const verdict = document.querySelector('#verdict');
const verification = document.querySelector('#verification');
const openPost = document.querySelector('#open-post');

let connectedToken = '';

async function requestJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (${response.status}).`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

function parsedCategories() {
  return [...new Set(categories.value.split(',').map(value => value.trim()).filter(Boolean))];
}

function refreshState() {
  publish.disabled = !connectedToken || token.value.trim() !== connectedToken || !file.files?.length;
}

token.addEventListener('input', () => {
  if (token.value.trim() !== connectedToken) {
    connectedToken = '';
    destinationWrap.hidden = true;
    destination.innerHTML = '';
    connectionStatus.textContent = 'Not connected.';
  }
  refreshState();
});

file.addEventListener('change', () => {
  const selected = file.files?.[0];
  fileNote.textContent = selected ? `${selected.name} · ${Math.round(selected.size / 1024)} KB` : 'Choose a UTF-8 Markdown file up to 500 KB.';
  results.hidden = true;
  refreshState();
});

connect.addEventListener('click', async () => {
  const current = token.value.trim();
  if (!current) return;
  connect.disabled = true;
  connectionStatus.textContent = 'Connecting…';
  try {
    const config = await requestJson('/api/microblog/config', { token: current });
    destination.innerHTML = '';
    for (const item of config.destinations || []) {
      const option = document.createElement('option');
      option.value = item.uid;
      option.textContent = item.name || item.uid;
      destination.append(option);
    }
    connectedToken = current;
    destinationWrap.hidden = destination.options.length === 0;
    connectionStatus.textContent = destination.options.length ? 'Connected.' : 'Connected to Micro.blog.';
  } catch (error) {
    connectedToken = '';
    connectionStatus.textContent = error.message;
  } finally {
    connect.disabled = false;
    refreshState();
  }
});

publish.addEventListener('click', async () => {
  const selected = file.files?.[0];
  if (!selected || !connectedToken) return;

  publish.disabled = true;
  results.hidden = true;
  publishStatus.textContent = `Reading ${selected.name}…`;

  try {
    const markdown = await selected.text();
    const requestedStatus = statusSelect.value === 'published' ? 'published' : 'draft';
    if (requestedStatus === 'published') {
      const confirmed = window.confirm('Publish this Markdown file immediately? Draft is the safer default.');
      if (!confirmed) {
        publishStatus.textContent = 'Publishing cancelled.';
        return;
      }
    }

    publishStatus.textContent = requestedStatus === 'published'
      ? 'Publishing Markdown and verifying source…'
      : 'Creating draft and verifying source…';

    const payload = await requestJson('/api/microblog/markdown', {
      token: connectedToken,
      destination: destination.value || undefined,
      markdown,
      title: title.value,
      summary: summary.value,
      categories: parsedCategories(),
      status: requestedStatus,
    });

    openPost.href = payload.preview || payload.url;
    results.hidden = false;

    if (payload.verified && payload.matches) {
      verdict.textContent = 'Markdown preserved exactly ✓';
      verdict.className = 'result good';
      verification.textContent = `${payload.originalLength} characters sent · ${payload.returnedLength} returned · source shape: ${payload.returnedShape}.`;
      publishStatus.textContent = requestedStatus === 'published' ? 'Published successfully.' : 'Draft created successfully.';
    } else if (payload.verified) {
      verdict.textContent = 'Micro.blog source differs ✗';
      verdict.className = 'result bad';
      verification.textContent = `${payload.originalLength} characters sent · ${payload.returnedLength ?? 'unknown'} returned. The post exists, but Markdown Hand cannot certify an exact round-trip.`;
      publishStatus.textContent = 'Post created, but verification found a difference.';
    } else {
      verdict.textContent = 'Post created · verification unavailable';
      verdict.className = 'result warn';
      verification.textContent = 'Micro.blog accepted the post, but Markdown Hand could not fetch the stored source back to verify it.';
      publishStatus.textContent = 'Post created; source verification failed.';
    }
  } catch (error) {
    const payload = error.payload || {};
    if (payload.url || payload.preview) {
      openPost.href = payload.preview || payload.url;
      results.hidden = false;
      verdict.textContent = 'Post created · verification unavailable';
      verdict.className = 'result warn';
      verification.textContent = error.message;
    }
    publishStatus.textContent = error.message;
  } finally {
    refreshState();
  }
});
