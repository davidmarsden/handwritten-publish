import { bearer, json, upstreamError } from './_shared/microblog';

const API_ROOT = 'https://micro.blog';

type SocialOperation =
  | 'timeline'
  | 'bookmarks'
  | 'replies'
  | 'conversation'
  | 'profile'
  | 'bookmark'
  | 'unbookmark'
  | 'reply';

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

export default async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const operation = url.searchParams.get('op') as SocialOperation | null;

  if (!operation) return json({ error: 'Missing social operation.' }, 400);

  if (request.method === 'GET') {
    const params = paging(url);
    const suffix = params.size ? `?${params.toString()}` : '';

    if (operation === 'timeline') return upstream(request, `/posts/timeline${suffix}`);
    if (operation === 'bookmarks') return upstream(request, `/posts/bookmarks${suffix}`);
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
  }

  if (request.method === 'DELETE' && operation === 'unbookmark') {
    const id = positiveInteger(url.searchParams.get('id'));
    if (!id) return json({ error: 'Bookmark id must be numeric.' }, 400);
    return upstream(request, `/posts/bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  return json({ error: 'Unsupported Micro.blog social operation.' }, 405);
};
