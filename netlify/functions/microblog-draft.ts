import { bearer, json, MICROPUB_ENDPOINT, upstreamError } from './_shared/microblog';

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const body = await request.json().catch(() => ({})) as {
    token?: string;
    destination?: string;
    title?: string;
    html?: string;
  };
  const token = body.token?.trim();
  if (!token) return json({ error: 'Micro.blog app token is required.' }, 400);
  if (!body.title?.trim()) return json({ error: 'Post title is required.' }, 400);
  if (!body.html?.trim()) return json({ error: 'Handwritten post content is required.' }, 400);

  const payload = {
    type: ['h-entry'],
    ...(body.destination ? { 'mp-destination': body.destination } : {}),
    properties: {
      name: [body.title.trim()],
      content: [{ html: body.html }],
      'post-status': ['draft'],
    },
  };

  const response = await fetch(MICROPUB_ENDPOINT, {
    method: 'POST',
    headers: {
      ...bearer(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return upstreamError(response, 'Micro.blog could not create the draft.');

  let result: { url?: string; preview?: string } = {};
  try {
    result = await response.json() as { url?: string; preview?: string };
  } catch {
    // Draft responses normally contain JSON; Location remains a fallback.
  }
  const url = result.url || response.headers.get('Location');
  if (!url) return json({ error: 'Micro.blog created the draft but returned no post URL.' }, 502);
  return json({ url, preview: result.preview || url });
};

export const config = { path: '/api/microblog/draft' };
