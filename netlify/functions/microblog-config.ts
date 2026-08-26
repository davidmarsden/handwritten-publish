import { bearer, json, MICROPUB_ENDPOINT, upstreamError } from './_shared/microblog';

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const body = await request.json().catch(() => ({})) as { token?: string; destination?: string };
  const token = body.token?.trim();
  if (!token) return json({ error: 'Micro.blog app token is required.' }, 400);

  const response = await fetch(`${MICROPUB_ENDPOINT}?q=config`, {
    headers: bearer(token),
  });
  if (!response.ok) return upstreamError(response, 'Micro.blog rejected this app token.');

  const config = await response.json() as {
    'media-endpoint'?: string;
    destination?: Array<{ uid?: string; name?: string }>;
  };
  if (!config['media-endpoint']) return json({ error: 'Micro.blog did not return a media endpoint.' }, 502);

  const destinations = (config.destination ?? [])
    .filter(destination => typeof destination.uid === 'string')
    .map(destination => ({ uid: destination.uid as string, name: destination.name || destination.uid as string }));

  let categories: string[] = [];
  const selectedDestination = body.destination?.trim();
  if (selectedDestination) {
    const categoryUrl = new URL(MICROPUB_ENDPOINT);
    categoryUrl.searchParams.set('q', 'category');
    categoryUrl.searchParams.set('mp-destination', selectedDestination);
    const categoryResponse = await fetch(categoryUrl, { headers: bearer(token) });
    if (!categoryResponse.ok) return upstreamError(categoryResponse, 'Could not load Micro.blog categories.');
    const categoryPayload = await categoryResponse.json().catch(() => null) as { categories?: unknown[] } | null;
    categories = Array.isArray(categoryPayload?.categories)
      ? categoryPayload.categories.filter((category): category is string => typeof category === 'string')
      : [];
  }

  return json({ destinations, categories });
};

export const config = { path: '/api/microblog/config' };
