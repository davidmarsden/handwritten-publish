const target = document.querySelector('#target');
const targetNote = document.querySelector('#target-note');
const researchAuth = document.querySelector('#research-auth');
const researchKey = document.querySelector('#research-key');
const microblogAuth = document.querySelector('#microblog-auth');
const microblogMetadata = document.querySelector('#microblog-metadata');
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

function usingResearch() {
  return target.value === 'southall-research';
}

function refreshState() {
  const hasFile = Boolean(file.files?.length);
  if (usingResearch()) {
    publish.disabled = !hasFile || !researchKey.value.trim();
  } else {
    publish.disabled = !hasFile || !connectedToken || token.value.trim() !== connectedToken;
  }
}

function refreshTarget() {
  const research = usingResearch();
  researchAuth.hidden = !research;
  microblogAuth.hidden = research;
  microblogMetadata.hidden = research;
  publish.textContent = research ? 'Save draft to Southall-Research' : 'Send Markdown to Micro.blog';
  openPost.textContent = research ? 'Open saved draft ↗' : 'Open in Micro.blog ↗';
  targetNote.innerHTML = research
    ? '<strong>Working destination.</strong> Saves the Markdown unchanged under <code>Southall-Research/drafts/</code>, where the private draft-review workflow can inspect it.'
    : '<strong>Publication destination.</strong> Sends the raw Markdown through Micropub. Draft remains the safe default; published status requires explicit confirmation.';
  results.hidden = true;
  publishStatus.textContent = 'Ready.';
  refreshState();
}

target.addEventListener('change', refreshTarget);
researchKey.addEventListener('input', refreshState);

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
  fileNote.textContent = selected ? `${selected.name} · ${Math.round(selected.size / 1024)} KB` : 'Choose a UTF-8 Markdown file.';
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
  if (!selected) return;

  publish.disabled = true;
  results.hidden = true;
  publishStatus.textContent = `Reading ${selected.name}…`;

  try {
    const markdown = await selected.text();

    if (usingResearch()) {
      publishStatus.textContent = 'Saving private working draft to Southall-Research…';
      const payload = await requestJson('/api/southall-research/draft', {
        writeKey: researchKey.value,
        filename: selected.name,
        markdown,
      });

      openPost.href = payload.url;
      results.hidden = false;
      verdict.textContent = payload.updated ? 'Southall-Research draft updated ✓' : 'Southall-Research draft saved ✓';
      verdict.className = 'result good';
      verification.textContent = `${payload.path} · ${payload.originalLength} characters preserved unchanged. The private draft-review workflow will run from this commit.`;
      publishStatus.textContent = payload.updated ? 'Private working draft updated successfully.' : 'Private working draft saved successfully.';
      return;
    }

    if (!connectedToken) return;
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
    if (!usingResearch() && (payload.url || payload.preview)) {
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

refreshTarget();
