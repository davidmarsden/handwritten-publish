import { bearer, json, MICROPUB_ENDPOINT, upstreamError } from './_shared/microblog';
import { publicPublishingDisabledResponse, publicUsageLimitResponse, recordPublicUsage } from './_shared/public-usage';

const API_ROOT = 'https://micro.blog';

export const config = {
  path: '/api/microblog/social',
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};

type SocialOperation =
  | 'timeline'
  | 'bookmarks'
  | 'mentions'
  | 'replies'
  | 'conversation'
  | 'profile'
  | 'account'
  | 'destinations'
  | 'bookmark'
  | 'unbookmark'
  | 'reply'
  | 'micropost';

type Destination = { uid: string; name: string };

function tokenFrom(request: Request): string | null {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function positiveInteger(value: string | null): string | null {
  if (!value) return null;
  return /^\d+$/.test(value) ? value : null;
}

function paging(url: URL): URLSearchParams {
  const params = new URLSearchParams();
  const count = positiveInteger(url.searchParams.get('count'));
  const beforeId = positiveInteger(url.searchParams.get('before_id'));
  const sinceId = positiveInteger(url.searchParams.get('since_id'));
  if (count) params.set('count', count);
  if (beforeId) params.set('before_id', beforeId);
  if (sinceId) params.set('since_id', sinceId);
  return params;
}

function safeUsername(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^@/, '');
  return /^[A-Za-z0-9_-]{1,64}$/.test(trimmed) ? trimmed : null;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function upstream(request: Request, path: string, init: RequestInit = {}): Promise<Response> {
  const token = tokenFrom(request);
  if (!token) return json({ error: 'Missing Micro.blog token.' }, 401);

  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...bearer(token),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) return upstreamError(response, 'Micro.blog request failed.');

  if (response.status === 204) return json({ ok: true });
  const text = await response.text();
  if (!text) return json({ ok: true });

  try {
    return json(JSON.parse(text));
  } catch {
    return json({ ok: true, result: text });
  }
}

async function accountFor(request: Request): Promise<Response> {
  const token = tokenFrom(request);
  if (!token) return json({ error: 'Missing Micro.blog token.' }, 401);

  const form = new URLSearchParams({ token });
  const response = await fetch(`${API_ROOT}/account/verify`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  if (!response.ok) return upstreamError(response, 'Could not identify the Micro.blog account.');

  const payload = await response.json().catch(() => null) as {
    token?: unknown;
    name?: unknown;
    username?: unknown;
    avatar?: unknown;
    default_site?: unknown;
  } | null;
  const username = safeUsername(typeof payload?.username === 'string' ? payload.username : null);
  if (!username) return json({ error: 'Micro.blog did not return an account username.' }, 502);

  return json({
    username,
    ...(typeof payload?.name === 'string' && payload.name.trim() ? { name: payload.name.trim() } : {}),
    ...(typeof payload?.avatar === 'string' && payload.avatar.trim() ? { avatar: payload.avatar.trim() } : {}),
    ...(typeof payload?.default_site === 'string' && payload.default_site.trim() ? { defaultSite: payload.default_site.trim() } : {}),
    ...(typeof payload?.token === 'string' && payload.token.trim() ? { token: payload.token.trim() } : {}),
  });
}

async function destinationsFor(token: string): Promise<{ response?: Response; destinations?: Destination[] }> {
  const configUrl = new URL(MICROPUB_ENDPOINT);
  configUrl.searchParams.set('q', 'config');
  const response = await fetch(configUrl, { headers: bearer(token) });
  if (!response.ok) {
    return { response: upstreamError(response, 'Could not load Micro.blog destinations.') };
  }

  const payload = await response.json().catch(() => null) as {
    destination?: Array<{ uid?: unknown; name?: unknown }>;
  } | null;
  const destinations = (payload?.destination ?? [])
    .filter((destination): destination is { uid: string; name?: unknown } => typeof destination.uid === 'string' && Boolean(destination.uid.trim()))
    .map(destination => ({
      uid: destination.uid.trim(),
      name: typeof destination.name === 'string' && destination.name.trim() ? destination.name.trim() : destination.uid.trim(),
    }));

  return { destinations };
}

export default async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const operation = url.searchParams.get('op') as SocialOperation | null;

  if (!operation) return json({ error: 'Missing social operation.' }, 400);

  if (request.method === 'GET') {
    const params = paging(url);
    const suffix = params.size ? `?${params.toString()}` : '';

    if (operation === 'timeline') return upstream(request, `/posts/timeline${suffix}`);
    if (operation === 'bookmarks') return upstream(request, `/posts/bookmarks${suffix}`);
    if (operation === 'mentions') return upstream(request, `/posts/mentions${suffix}`);
    if (operation === 'replies') return upstream(request, `/posts/replies${suffix}`);

    if (operation === 'conversation') {
      const id = positiveInteger(url.searchParams.get('id'));
      if (!id) return json({ error: 'Conversation id must be numeric.' }, 400);
      return upstream(request, `/posts/conversation?id=${encodeURIComponent(id)}`);
    }

    if (operation === 'profile') {
      const username = safeUsername(url.searchParams.get('username'));
      if (!username) return json({ error: 'Invalid username.' }, 400);
      return upstream(request, `/posts/${encodeURIComponent(username)}${suffix}`);
    }

    if (operation === 'account') return accountFor(request);

    if (operation === 'destinations') {
      const token = tokenFrom(request);
      if (!token) return json({ error: 'Missing Micro.blog token.' }, 401);
      const result = await destinationsFor(token);
      return result.response ?? json({ destinations: result.destinations ?? [] });
    }
  }

  if (request.method === 'POST') {
    const body = await readBody(request);

    if (operation === 'bookmark') {
      const id = typeof body.id === 'string' ? positiveInteger(body.id) : null;
      if (!id) return json({ error: 'Bookmark id must be numeric.' }, 400);
      const form = new URLSearchParams({ id });
      return upstream(request, '/posts/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
    }

    if (operation === 'reply') {
      const id = typeof body.id === 'string' ? positiveInteger(body.id) : null;
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      if (!id) return json({ error: 'Reply id must be numeric.' }, 400);
      if (!content) return json({ error: 'Reply content is required.' }, 400);
      if (content.length > 10000) return json({ error: 'Reply content is too long.' }, 400);
      const form = new URLSearchParams({ id, content });
      return upstream(request, '/posts/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
    }

    if (operation === 'micropost') {
      const disabled = publicPublishingDisabledResponse();
      if (disabled) return disabled;

      const token = tokenFrom(request);
      if (!token) return json({ error: 'Missing Micro.blog token.' }, 401);
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      const destination = typeof body.destination === 'string' ? body.destination.trim() : '';
      if (!content) return json({ error: 'Micropost content is required.' }, 400);
      if (!destination) return json({ error: 'Choose a Micro.blog destination before posting.' }, 400);
      if (content.length > 10000) return json({ error: 'Micropost content is too long.' }, 400);

      const configured = await destinationsFor(token);
      if (configured.response) return configured.response;
      if (!(configured.destinations ?? []).some(candidate => candidate.uid === destination)) {
        return json({ error: 'That destination is not available for this Micro.blog account.' }, 400);
      }

      const limitResponse = await publicUsageLimitResponse();
      if (limitResponse) return limitResponse;

      const payload = {
        type: ['h-entry'],
        'mp-destination': destination,
        properties: {
          content: [content],
          'post-status': ['published'],
        },
      };

      const createResponse = await fetch(MICROPUB_ENDPOINT, {
        method: 'POST',
        headers: { ...bearer(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!createResponse.ok) {
        return upstreamError(createResponse, `Micro.blog could not publish the micropost (HTTP ${createResponse.status}).`);
      }

      let created: { url?: string; preview?: string } = {};
      try {
        created = await createResponse.clone().json() as { url?: string; preview?: string };
      } catch {
        // Location fallback below.
      }
      const createdUrl = created.url || createResponse.headers.get('Location');
      await recordPublicUsage('create');
      return json({ ok: true, url: createdUrl || null, preview: created.preview || createdUrl || null });
    }
  }

  if (request.method === 'DELETE' && operation === 'unbookmark') {
    const id = positiveInteger(url.searchParams.get('id'));
    if (!id) return json({ error: 'Bookmark id must be numeric.' }, 400);
    return upstream(request, `/posts/bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  return json({ error: 'Unsupported Micro.blog social operation.' }, 405);
};
