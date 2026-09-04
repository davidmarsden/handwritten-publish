import { bearer, json, MICROPUB_ENDPOINT, upstreamError } from './_shared/microblog';
import { publicPublishingDisabledResponse, publicUsageLimitResponse } from './_shared/public-usage';

const MAX_MEDIA_BYTES = 5_000_000;
const SUPPORTED_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function decodedHeader(value: string | null): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return '';
  }
}

function decodedFilename(value: string | null): string {
  return decodedHeader(value) || 'handwritten-media';
}

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const disabled = publicPublishingDisabledResponse();
  if (disabled) return disabled;
  const limitResponse = await publicUsageLimitResponse();
  if (limitResponse) return limitResponse;

  const token = request.headers.get('x-microblog-token')?.trim() ?? '';
  const destination = decodedHeader(request.headers.get('x-microblog-destination'));
  const filename = decodedFilename(request.headers.get('x-file-name'));
  const contentType = request.headers.get('content-type') || 'application/octet-stream';

  if (!token) return json({ error: 'Micro.blog app token is required.' }, 400);
  if (!SUPPORTED_MEDIA_TYPES.has(contentType)) {
    return json({ error: 'A PNG, JPEG or WebP image is required.' }, 400);
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await request.arrayBuffer();
  } catch (error) {
    return json({ error: `Could not read the image upload: ${error instanceof Error ? error.message : 'unknown error'}` }, 400);
  }

  if (!bytes.byteLength) return json({ error: 'Image upload is empty.' }, 400);
  if (bytes.byteLength > MAX_MEDIA_BYTES) {
    return json({ error: `This image is ${(bytes.byteLength / 1_000_000).toFixed(1)} MB; the current upload bridge supports media files up to 5 MB.` }, 413);
  }

  let configResponse: Response;
  try {
    configResponse = await fetch(`${MICROPUB_ENDPOINT}?q=config`, { headers: bearer(token) });
  } catch (error) {
    return json({ error: `Could not reach Micro.blog while discovering the media endpoint: ${error instanceof Error ? error.message : 'network error'}` }, 502);
  }
  if (!configResponse.ok) return upstreamError(configResponse, 'Could not discover the Micro.blog media endpoint.');

  const config = await configResponse.json() as { 'media-endpoint'?: string };
  if (!config['media-endpoint']) return json({ error: 'Micro.blog did not return a media endpoint.' }, 502);

  const outgoing = new FormData();
  if (destination) outgoing.append('mp-destination', destination);
  outgoing.append('file', new Blob([bytes], { type: contentType }), filename);

  let response: Response;
  try {
    response = await fetch(config['media-endpoint'], {
      method: 'POST',
      headers: bearer(token),
      body: outgoing,
    });
  } catch (error) {
    return json({ error: `Could not reach the Micro.blog media endpoint: ${error instanceof Error ? error.message : 'network error'}` }, 502);
  }

  if (!response.ok) return upstreamError(response, `Could not upload ${filename}.`);

  const location = response.headers.get('Location');
  if (!location) return json({ error: 'Micro.blog accepted the upload but returned no media URL.' }, 502);
  return json({ url: location });
};

export const config = {
  path: '/api/microblog/media',
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
