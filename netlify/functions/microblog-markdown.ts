import { bearer, json, MICROPUB_ENDPOINT, upstreamError } from './_shared/microblog';
import { publicPublishingDisabledResponse, publicUsageLimitResponse, recordPublicUsage } from './_shared/public-usage';

type PostStatus = 'draft' | 'published';

function sourceContent(source: unknown): { value: string | null; shape: string } {
  if (!source || typeof source !== 'object') return { value: null, shape: 'missing' };
  const properties = (source as { properties?: Record<string, unknown> }).properties;
  const content = properties?.content;
  const first = Array.isArray(content) ? content[0] : content;
  if (typeof first === 'string') return { value: first, shape: 'string' };
  if (first && typeof first === 'object') {
    const object = first as { value?: unknown; html?: unknown };
    if (typeof object.value === 'string') return { value: object.value, shape: 'value' };
    if (typeof object.html === 'string') return { value: object.html, shape: 'html' };
  }
  return { value: null, shape: typeof first };
}

function normalizedCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((category): category is string => typeof category === 'string')
    .map(category => category.trim())
    .filter(Boolean))];
}

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const disabled = publicPublishingDisabledResponse();
  if (disabled) return disabled;

  const body = await request.json().catch(() => ({})) as {
    token?: string;
    destination?: string;
    markdown?: string;
    title?: string;
    summary?: string;
    categories?: unknown;
    status?: PostStatus;
  };

  const token = body.token?.trim();
  const destination = body.destination?.trim();
  const markdown = body.markdown ?? '';
  const title = body.title?.trim() ?? '';
  const summary = body.summary?.trim() ?? '';
  const categories = normalizedCategories(body.categories);
  const status: PostStatus = body.status === 'published' ? 'published' : 'draft';

  if (!token) return json({ error: 'Micro.blog app token is required.' }, 400);
  if (!markdown.trim()) return json({ error: 'Choose a non-empty Markdown file.' }, 400);
  if (markdown.length > 500_000) return json({ error: 'Markdown Hand accepts files up to 500 KB.' }, 413);

  const limitResponse = await publicUsageLimitResponse();
  if (limitResponse) return limitResponse;

  const properties: Record<string, unknown> = {
    content: [markdown],
    'post-status': [status],
  };
  if (title) properties.name = [title];
  if (summary) properties.summary = [summary];
  if (categories.length) properties.category = categories;

  const payload = {
    type: ['h-entry'],
    ...(destination ? { 'mp-destination': destination } : {}),
    properties,
  };

  const createResponse = await fetch(MICROPUB_ENDPOINT, {
    method: 'POST',
    headers: { ...bearer(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!createResponse.ok) {
    return upstreamError(createResponse, `Micro.blog could not create the Markdown ${status === 'published' ? 'post' : 'draft'} (HTTP ${createResponse.status}).`);
  }

  let created: { url?: string; preview?: string } = {};
  try {
    created = await createResponse.clone().json() as { url?: string; preview?: string };
  } catch {
    // Location fallback below.
  }
  const url = created.url || createResponse.headers.get('Location');
  if (!url) return json({ error: 'Micro.blog created the post but returned no URL.' }, 502);
  await recordPublicUsage('create');

  const sourceUrl = new URL(MICROPUB_ENDPOINT);
  sourceUrl.searchParams.set('q', 'source');
  sourceUrl.searchParams.set('url', url);
  if (destination) sourceUrl.searchParams.set('mp-destination', destination);
  const sourceResponse = await fetch(sourceUrl, { headers: bearer(token) });
  if (!sourceResponse.ok) {
    return json({
      created: true,
      verified: false,
      error: 'The post was created, but Markdown Hand could not fetch its Micropub source back for verification.',
      url,
      preview: created.preview || url,
      status,
    }, 502);
  }

  const source = await sourceResponse.json().catch(() => null);
  const returned = sourceContent(source);
  return json({
    created: true,
    verified: true,
    url,
    preview: created.preview || url,
    status,
    returnedShape: returned.shape,
    matches: returned.value === markdown,
    originalLength: markdown.length,
    returnedLength: returned.value?.length ?? null,
  });
};

export const config = {
  path: '/api/microblog/markdown',
  rateLimit: {
    windowLimit: 8,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
