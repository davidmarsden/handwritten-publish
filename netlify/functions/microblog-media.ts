import { bearer, json, MICROPUB_ENDPOINT, upstreamError } from './_shared/microblog';

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const incoming = await request.formData();
  const token = incoming.get('token');
  const file = incoming.get('file');
  if (typeof token !== 'string' || !token.trim()) return json({ error: 'Micro.blog app token is required.' }, 400);
  if (!(file instanceof File)) return json({ error: 'PNG page is required.' }, 400);
  if (file.size > 5_500_000) return json({ error: 'This PNG page is too large for the current upload bridge.' }, 413);

  const configResponse = await fetch(`${MICROPUB_ENDPOINT}?q=config`, { headers: bearer(token.trim()) });
  if (!configResponse.ok) return upstreamError(configResponse, 'Could not discover the Micro.blog media endpoint.');
  const config = await configResponse.json() as { 'media-endpoint'?: string };
  if (!config['media-endpoint']) return json({ error: 'Micro.blog did not return a media endpoint.' }, 502);

  const outgoing = new FormData();
  outgoing.append('file', file, file.name);
  const response = await fetch(config['media-endpoint'], {
    method: 'POST',
    headers: bearer(token.trim()),
    body: outgoing,
  });
  if (!response.ok) return upstreamError(response, `Could not upload ${file.name}.`);

  const location = response.headers.get('Location');
  if (!location) return json({ error: 'Micro.blog accepted the upload but returned no media URL.' }, 502);
  return json({ url: location });
};

export const config = { path: '/api/microblog/media' };
