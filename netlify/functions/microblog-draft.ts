import { bearer, json, MICROPUB_ENDPOINT, upstreamError } from './_shared/microblog';

function sourceStatus(source: unknown): string | null {
  if (!source || typeof source !== 'object') return null;
  const properties = (source as { properties?: Record<string, unknown> }).properties;
  const value = properties?.['post-status'];
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  if (typeof value === 'string') return value;
  return null;
}

async function verifyDraft(token: string, updateUrl: string, destination?: string) {
  const sourceUrl = new URL(MICROPUB_ENDPOINT);
  sourceUrl.searchParams.set('q', 'source');
  sourceUrl.searchParams.set('url', updateUrl);
  if (destination) sourceUrl.searchParams.set('mp-destination', destination);

  const sourceResponse = await fetch(sourceUrl, { headers: bearer(token) });
  if (!sourceResponse.ok) return upstreamError(sourceResponse, 'Could not verify the existing Micro.blog draft.');
  const source = await sourceResponse.json().catch(() => null);
  if (sourceStatus(source) !== 'draft') {
    return json({ error: 'This Micro.blog post is no longer a draft, so Handwritten Publish will not modify it.' }, 409);
  }
  return null;
}

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const body = await request.json().catch(() => ({})) as {
    token?: string;
    destination?: string;
    title?: string;
    html?: string;
    updateUrl?: string;
    verifyOnly?: boolean;
  };
  const token = body.token?.trim();
  if (!token) return json({ error: 'Micro.blog app token is required.' }, 400);

  if (body.verifyOnly) {
    if (!body.updateUrl) return json({ error: 'Tracked Micro.blog draft URL is required.' }, 400);
    const verificationError = await verifyDraft(token, body.updateUrl, body.destination);
    return verificationError ?? json({ draft: true });
  }

  if (!body.title?.trim()) return json({ error: 'Post title is required.' }, 400);
  if (!body.html?.trim()) return json({ error: 'Handwritten post content is required.' }, 400);

  if (body.updateUrl) {
    const verificationError = await verifyDraft(token, body.updateUrl, body.destination);
    if (verificationError) return verificationError;

    const payload = {
      action: 'update',
      url: body.updateUrl,
      ...(body.destination ? { 'mp-destination': body.destination } : {}),
      replace: {
        name: [body.title.trim()],
        content: [{ html: body.html }],
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
    if (!response.ok) return upstreamError(response, 'Micro.blog could not update the draft.');
    return json({ updated: true });
  }

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
