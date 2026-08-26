import { bearer, json, MICROPUB_ENDPOINT, upstreamError } from './_shared/microblog';

type PostStatus = 'draft' | 'published';

type InspectedPost = {
  status?: PostStatus;
  url?: string;
  error?: Response;
};

function sourceProperties(source: unknown): Record<string, unknown> | null {
  if (!source || typeof source !== 'object') return null;
  const properties = (source as { properties?: Record<string, unknown> }).properties;
  return properties && typeof properties === 'object' ? properties : null;
}

function sourceStatus(source: unknown): string | null {
  const properties = sourceProperties(source);
  const value = properties?.['post-status'];
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  if (typeof value === 'string') return value;
  return null;
}

function sourcePostUrl(source: unknown): string | null {
  const properties = sourceProperties(source);
  const value = properties?.url;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  if (typeof value === 'string') return value;
  return null;
}

function richHtmlContent(html: string) {
  return [{ html }];
}

function validStatus(status: string | null): PostStatus | null {
  return status === 'draft' || status === 'published' ? status : null;
}

async function recoverPublishedPostByMedia(
  token: string,
  knownMediaUrls: string[],
  destination?: string,
): Promise<InspectedPost> {
  const fingerprints = [...new Set(knownMediaUrls.map(url => url.trim()).filter(Boolean))];
  if (!fingerprints.length) {
    return { error: json({ error: 'The tracked Micro.blog URL no longer exists and there are no saved media URLs available to recover the published post safely.' }, 404) };
  }

  const matches: unknown[] = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const sourceUrl = new URL(MICROPUB_ENDPOINT);
    sourceUrl.searchParams.set('q', 'source');
    sourceUrl.searchParams.set('limit', '100');
    sourceUrl.searchParams.set('offset', String(offset));
    if (destination) sourceUrl.searchParams.set('mp-destination', destination);

    const response = await fetch(sourceUrl, { headers: bearer(token) });
    if (!response.ok) return { error: upstreamError(response, 'Could not search Micro.blog for the published version of this post.') };
    const payload = await response.json().catch(() => null) as { items?: unknown[] } | null;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    for (const item of items) {
      const serialized = JSON.stringify(item);
      if (fingerprints.every(url => serialized.includes(url))) matches.push(item);
    }
    if (items.length < 100 || matches.length > 1) break;
  }

  if (matches.length !== 1) {
    const reason = matches.length > 1
      ? 'More than one Micro.blog post contains the tracked media, so Handwritten Publish will not guess which live post to edit.'
      : 'The old draft URL no longer exists and Handwritten Publish could not uniquely identify the published post from its tracked media.';
    return { error: json({ error: reason }, 409) };
  }

  const status = validStatus(sourceStatus(matches[0]));
  const url = sourcePostUrl(matches[0]);
  if (!status || !url) {
    return { error: json({ error: 'Micro.blog found the post but did not return a safe published URL/status for it.' }, 409) };
  }
  return { status, url };
}

async function inspectPost(
  token: string,
  updateUrl: string,
  destination?: string,
  knownMediaUrls: string[] = [],
): Promise<InspectedPost> {
  const sourceUrl = new URL(MICROPUB_ENDPOINT);
  sourceUrl.searchParams.set('q', 'source');
  sourceUrl.searchParams.set('url', updateUrl);
  if (destination) sourceUrl.searchParams.set('mp-destination', destination);

  const sourceResponse = await fetch(sourceUrl, { headers: bearer(token) });
  if (!sourceResponse.ok) {
    if (sourceResponse.status === 404) {
      return recoverPublishedPostByMedia(token, knownMediaUrls, destination);
    }
    return { error: upstreamError(sourceResponse, 'Could not verify the existing Micro.blog post.') };
  }
  const source = await sourceResponse.json().catch(() => null);
  const status = validStatus(sourceStatus(source));
  if (!status) {
    return { error: json({ error: `Handwritten Publish cannot safely update a Micro.blog post with status ${sourceStatus(source) ?? 'unknown'}.` }, 409) };
  }
  return { status, url: sourcePostUrl(source) ?? updateUrl };
}

async function verifyExpectedStatus(
  token: string,
  updateUrl: string,
  expectedStatus: PostStatus,
  destination?: string,
  knownMediaUrls: string[] = [],
): Promise<{ url?: string; error?: Response }> {
  const inspected = await inspectPost(token, updateUrl, destination, knownMediaUrls);
  if (inspected.error) return { error: inspected.error };
  if (inspected.status !== expectedStatus) {
    return {
      error: json({
        error: `This Micro.blog post changed from ${expectedStatus} to ${inspected.status ?? 'an unknown status'} before the update, so Handwritten Publish did not modify it.`,
      }, 409),
    };
  }
  return { url: inspected.url ?? updateUrl };
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
    expectedPostStatus?: PostStatus;
    knownMediaUrls?: string[];
  };
  const token = body.token?.trim();
  if (!token) return json({ error: 'Micro.blog app token is required.' }, 400);
  const knownMediaUrls = Array.isArray(body.knownMediaUrls)
    ? body.knownMediaUrls.filter((url): url is string => typeof url === 'string')
    : [];

  if (body.verifyOnly) {
    if (!body.updateUrl) return json({ error: 'Tracked Micro.blog post URL is required.' }, 400);
    const inspected = await inspectPost(token, body.updateUrl, body.destination, knownMediaUrls);
    if (inspected.error) return inspected.error;
    return json({ status: inspected.status, url: inspected.url ?? body.updateUrl });
  }

  if (!body.title?.trim()) return json({ error: 'Post title is required.' }, 400);
  if (!body.html?.trim()) return json({ error: 'Handwritten post content is required.' }, 400);

  if (body.updateUrl) {
    // Backward-safe default: callers must explicitly opt into published updates.
    const expectedStatus: PostStatus = body.expectedPostStatus === 'published' ? 'published' : 'draft';
    const verification = await verifyExpectedStatus(token, body.updateUrl, expectedStatus, body.destination, knownMediaUrls);
    if (verification.error) return verification.error;
    const resolvedUrl = verification.url ?? body.updateUrl;

    const payload = {
      action: 'update',
      url: resolvedUrl,
      ...(body.destination ? { 'mp-destination': body.destination } : {}),
      replace: {
        name: [body.title.trim()],
        content: [body.html],
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
    if (!response.ok) {
      return upstreamError(response, `Micro.blog could not update the ${expectedStatus === 'published' ? 'published post' : 'draft'} (HTTP ${response.status}).`);
    }
    return json({ updated: true, status: expectedStatus, url: resolvedUrl });
  }

  const payload = {
    type: ['h-entry'],
    ...(body.destination ? { 'mp-destination': body.destination } : {}),
    properties: {
      name: [body.title.trim()],
      content: richHtmlContent(body.html),
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
  if (!response.ok) return upstreamError(response, `Micro.blog could not create the draft (HTTP ${response.status}).`);

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
