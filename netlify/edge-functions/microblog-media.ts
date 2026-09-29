const MAX_MEDIA_BYTES = 25_000_000;
const SUPPORTED_MEDIA_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
  'application/ogg',
  'video/mp4',
  'application/pdf',
]);

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function decodedHeader(value: string | null): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return '';
  }
}

function safeFilename(value: string): string {
  return value.replace(/[\r\n"\\]/g, '_').trim() || 'upload';
}

function mediaKey(value: string): string {
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* use original */ }
  const leaf = decoded.split('/').pop() || decoded;
  const dot = leaf.lastIndexOf('.');
  const stem = dot > 0 ? leaf.slice(0, dot) : leaf;
  const ext = dot > 0 ? leaf.slice(dot + 1).toLowerCase() : '';
  const words = stem.normalize('NFKD').toLowerCase().match(/[a-z0-9]+/g)?.join('-') || '';
  return `${words}.${ext}`;
}

function recentMatchingUrls(payload: unknown, filename: string): string[] {
  const entries = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items)
      ? (payload as { items: unknown[] }).items
      : [];
  const wanted = mediaKey(filename);
  return entries.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const direct = (entry as { url?: unknown }).url;
    const propertyUrl = (entry as { properties?: { url?: unknown } }).properties?.url;
    const candidate = typeof direct === 'string'
      ? direct
      : Array.isArray(propertyUrl) && typeof propertyUrl[0] === 'string'
        ? propertyUrl[0]
        : '';
    return candidate && mediaKey(candidate) === wanted ? [candidate] : [];
  });
}

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const token = request.headers.get('x-microblog-token')?.trim() ?? '';
  const endpoint = decodedHeader(request.headers.get('x-microblog-media-endpoint'));
  const destination = decodedHeader(request.headers.get('x-microblog-destination'));
  const filename = decodedHeader(request.headers.get('x-file-name')) || 'upload';
  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  const contentLength = Number(request.headers.get('content-length') || '0');
  const action = request.headers.get('x-bum-action')?.trim().toLowerCase() || '';

  if (!token) return json({ error: 'Micro.blog app token is required.' }, 400);
  if (!endpoint.startsWith('https://')) return json({ error: 'A valid Micro.blog media endpoint is required.' }, 400);
  if (!destination) return json({ error: 'Choose a Micro.blog destination first.' }, 400);

  if (action === 'alt') {
    const mediaUrl = decodedHeader(request.headers.get('x-media-url'));
    if (!mediaUrl.startsWith('https://')) return json({ error: 'A valid uploaded media URL is required.' }, 400);
    const url = new URL(endpoint);
    url.searchParams.set('q', 'source');
    url.searchParams.set('mp-destination', destination);
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return json({ error: `Could not check Micro.blog accessibility text (HTTP ${response.status}).` }, 502);
      const payload = await response.json().catch(() => ({}));
      const entries = payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items)
        ? (payload as { items: unknown[] }).items
        : [];
      const match = entries.find(entry => entry && typeof entry === 'object' && (entry as { url?: unknown }).url === mediaUrl);
      const alt = match && typeof (match as { alt?: unknown }).alt === 'string'
        ? (match as { alt: string }).alt.trim()
        : '';
      return json({ alt });
    } catch (error) {
      return json({ error: `Could not check Micro.blog accessibility text: ${error instanceof Error ? error.message : 'network error'}` }, 502);
    }
  }

  if (action === 'recent') {
    const url = new URL(endpoint);
    url.searchParams.set('q', 'source');
    url.searchParams.set('mp-destination', destination);
    url.searchParams.set('limit', '100');
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return json({ error: `Could not check recent Micro.blog uploads (HTTP ${response.status}).` }, 502);
      const payload = await response.json().catch(() => []);
      return json({ urls: recentMatchingUrls(payload, filename) });
    } catch (error) {
      return json({ error: `Could not check recent Micro.blog uploads: ${error instanceof Error ? error.message : 'network error'}` }, 502);
    }
  }

  if (!SUPPORTED_MEDIA_TYPES.has(contentType)) return json({ error: 'An MP3, M4A, OGG, MP4 or PDF file is required.' }, 400);
  if (!request.body) return json({ error: 'Upload is empty.' }, 400);
  if (contentLength > MAX_MEDIA_BYTES) {
    return json({ error: `This file is ${(contentLength / 1_000_000).toFixed(1)} MB; BUM Hand currently accepts streamed media up to 75 MB.` }, 413);
  }

  // Let the Fetch/FormData implementation serialize multipart headers and filename.
  // This mirrors the browser/native upload path recommended for Micropub media and
  // avoids subtle differences in hand-built Content-Disposition serialization.
  // Native FormData currently requires buffering the incoming body in this edge
  // runtime. Keep this path deliberately bounded; larger media must not be buffered
  // into an isolate while we test Micro.blog's filename-preserving behaviour.
  let mediaBytes: ArrayBuffer;
  try {
    mediaBytes = await request.arrayBuffer();
  } catch {
    return json({ error: 'Could not read upload bytes.' }, 400);
  }
  if (mediaBytes.byteLength > MAX_MEDIA_BYTES) {
    return json({ error: `This file is ${(mediaBytes.byteLength / 1_000_000).toFixed(1)} MB; BUM Hand currently accepts native-form media up to 25 MB.` }, 413);
  }
  const form = new FormData();
  form.append('mp-destination', destination);
  form.append('file', new Blob([mediaBytes], { type: contentType }), safeFilename(filename));

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });
  } catch (error) {
    return json({ error: `Could not reach the Micro.blog media endpoint: ${error instanceof Error ? error.message : 'network error'}` }, 502);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim();
    return json({ error: detail || `Micro.blog rejected ${filename} (HTTP ${response.status}).` }, response.status);
  }

  const location = response.headers.get('Location');
  if (!location) return json({ error: 'Micro.blog accepted the upload but returned no media URL.' }, 502);
  return json({ url: location }, 202);
};

export const config = {
  path: '/api/microblog/stream-media',
  method: 'POST',
  rateLimit: {
    // A full 30-image batch can poll asynchronously for Micro.blog-generated alt
    // text (up to 11 lookups each), in addition to upload preflight/upload/recovery.
    // Keep enough headroom for that supported worst case without 429ing our own UI.
    windowLimit: 450,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
