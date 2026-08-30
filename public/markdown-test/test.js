const token = document.querySelector('#token');
const connect = document.querySelector('#connect');
const destinationWrap = document.querySelector('#destination-wrap');
const destination = document.querySelector('#destination');
const title = document.querySelector('#title');
const file = document.querySelector('#file');
const run = document.querySelector('#run');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
const verdict = document.querySelector('#verdict');
const preview = document.querySelector('#preview');
const meta = document.querySelector('#meta');
const original = document.querySelector('#original');
const returned = document.querySelector('#returned');

let connectedToken = '';

async function requestJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function refreshRunState() {
  run.disabled = !connectedToken || token.value.trim() !== connectedToken || !file.files?.length;
}

token.addEventListener('input', () => {
  if (token.value.trim() !== connectedToken) {
    connectedToken = '';
    destinationWrap.hidden = true;
    destination.innerHTML = '';
  }
  refreshRunState();
});
file.addEventListener('change', refreshRunState);

connect.addEventListener('click', async () => {
  const current = token.value.trim();
  if (!current) return;
  connect.disabled = true;
  status.textContent = 'Connecting…';
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
    status.textContent = destination.options.length ? 'Connected. Choose a Markdown file.' : 'Connected.';
  } catch (error) {
    connectedToken = '';
    status.textContent = error.message;
  } finally {
    connect.disabled = false;
    refreshRunState();
  }
});

run.addEventListener('click', async () => {
  const selected = file.files?.[0];
  if (!selected || !connectedToken) return;
  run.disabled = true;
  results.hidden = true;
  status.textContent = `Reading ${selected.name}…`;
  try {
    const markdown = await selected.text();
    status.textContent = 'Creating private draft and fetching the source back…';
    const payload = await requestJson('/api/microblog/markdown-test', {
      token: connectedToken,
      destination: destination.value || undefined,
      title: title.value,
      markdown,
    });
    verdict.textContent = payload.matches ? 'Exact match ✓' : 'Source changed ✗';
    verdict.className = `result ${payload.matches ? 'good' : 'bad'}`;
    preview.href = payload.preview || payload.url;
    meta.textContent = `Original ${payload.originalLength} characters · returned ${payload.returnedLength ?? 'unknown'} · source shape: ${payload.returnedShape}`;
    original.textContent = payload.original;
    returned.textContent = payload.returned ?? '(Micro.blog returned no comparable content value.)';
    results.hidden = false;
    status.textContent = payload.matches ? 'Round-trip complete: Markdown survived exactly.' : 'Round-trip complete: the returned source differs. Compare below.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    refreshRunState();
  }
});
