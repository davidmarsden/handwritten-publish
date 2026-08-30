import { bearer, json, MICROPUB_ENDPOINT, upstreamError } from './_shared/microblog';
import { publicPublishingDisabledResponse, publicUsageLimitResponse, recordPublicUsage } from './_shared/public-usage';

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

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const disabled = publicPublishingDisabledResponse();
  if (disabled) return disabled;

  const body = await request.json().catch(() => ({})) as {
    token?: string;
    destination?: string;
    markdown?: string;
    title?: string;
  };
  const token = body.token?.trim();
  const markdown = body.markdown ?? '';
  const title = body.title?.trim() || 'Helping Hand Markdown round-trip test';
  const destination = body.destination?.trim();
  if (!token) return json({ error: 'Micro.blog app token is required.' }, 400);
  if (!markdown.trim()) return json({ error: 'Choose a non-empty Markdown file.' }, 400);
  if (markdown.length > 500_000) return json({ error: 'This test accepts Markdown files up to 500 KB.' }, 413);

  const limitResponse = await publicUsageLimitResponse();
  if (limitResponse) return limitResponse;

  const payload = {
    type: ['h-entry'],
    ...(destination ? { 'mp-destination': destination } : {}),
    properties: {
      name: [title],
      content: [markdown],
      'post-status': ['draft'],
    },
  };

  const createResponse = await fetch(MICROPUB_ENDPOINT, {
    method: 'POST',
    headers: { ...bearer(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!createResponse.ok) return upstreamError(createResponse, `Micro.blog could not create the Markdown test draft (HTTP ${createResponse.status}).`);

  let created: { url?: string; preview?: string } = {};
  try {
    created = await createResponse.clone().json() as { url?: string; preview?: string };
  } catch {
    // Location fallback below.
  }
  const url = created.url || createResponse.headers.get('Location');
  if (!url) return json({ error: 'Micro.blog created the draft but returned no post URL.' }, 502);
  await recordPublicUsage('create');

  const sourceUrl = new URL(MICROPUB_ENDPOINT);
  sourceUrl.searchParams.set('q', 'source');
  sourceUrl.searchParams.set('url', url);
  if (destination) sourceUrl.searchParams.set('mp-destination', destination);
  const sourceResponse = await fetch(sourceUrl, { headers: bearer(token) });
  if (!sourceResponse.ok) {
    return json({
      error: 'The draft was created, but Helping Hand could not fetch its Micropub source back for comparison.',
      url,
      preview: created.preview || url,
    }, 502);
  }

  const source = await sourceResponse.json().catch(() => null);
  const returned = sourceContent(source);
  return json({
    url,
    preview: created.preview || url,
    original: markdown,
    returned: returned.value,
    returnedShape: returned.shape,
    matches: returned.value === markdown,
    originalLength: markdown.length,
    returnedLength: returned.value?.length ?? null,
  });
};

export const config = {
  path: '/api/microblog/markdown-test',
  rateLimit: {
    windowLimit: 8,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
