const MAX_MEDIA_BYTES = 75_000_000;
const SUPPORTED_MEDIA_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
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

function multipartStream(
  source: ReadableStream<Uint8Array>,
  boundary: string,
  filename: string,
  contentType: string,
  destination: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const prefix = encoder.encode(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="mp-destination"\r\n\r\n${destination}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${safeFilename(filename)}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`,
  );
  const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
  const reader = source.getReader();
  let sentPrefix = false;
  let finishedSource = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!sentPrefix) {
        sentPrefix = true;
        controller.enqueue(prefix);
        return;
      }
      if (!finishedSource) {
        const { done, value } = await reader.read();
        if (!done && value) {
          controller.enqueue(value);
          return;
        }
        finishedSource = true;
      }
      controller.enqueue(suffix);
      controller.close();
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
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

  if (!token) return json({ error: 'Micro.blog app token is required.' }, 400);
  if (!endpoint.startsWith('https://')) return json({ error: 'A valid Micro.blog media endpoint is required.' }, 400);
  if (!destination) return json({ error: 'Choose a Micro.blog destination first.' }, 400);
  if (!SUPPORTED_MEDIA_TYPES.has(contentType)) return json({ error: 'An MP3, M4A or PDF file is required.' }, 400);
  if (!request.body) return json({ error: 'Upload is empty.' }, 400);
  if (contentLength > MAX_MEDIA_BYTES) {
    return json({ error: `This file is ${(contentLength / 1_000_000).toFixed(1)} MB; BUM Hand currently accepts streamed media up to 75 MB.` }, 413);
  }

  const boundary = `----bum-hand-${crypto.randomUUID()}`;
  const outgoing = multipartStream(request.body, boundary, filename, contentType, destination);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: outgoing,
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
  path: '/api/microblog/media',
  method: 'POST',
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
