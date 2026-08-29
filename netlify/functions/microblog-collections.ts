import { bearer, json, MICROPUB_ENDPOINT, upstreamError } from './_shared/microblog';
import { publicPublishingDisabledResponse } from './_shared/public-usage';

type CollectionItem = {
  properties?: {
    uid?: unknown[];
    url?: unknown[];
    name?: unknown[];
    'microblog-uploads-count'?: unknown;
  };
};

type Collection = {
  uid: string | number | null;
  url: string;
  name: string;
  uploadCount: number;
};

function firstString(value: unknown): string {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : '';
}

function firstId(value: unknown): string | number | null {
  if (!Array.isArray(value)) return null;
  return typeof value[0] === 'string' || typeof value[0] === 'number' ? value[0] : null;
}

function normalizeCollection(item: CollectionItem): Collection | null {
  const url = firstString(item.properties?.url).trim();
  const name = firstString(item.properties?.name).trim();
  if (!url || !name) return null;
  const rawCount = item.properties?.['microblog-uploads-count'];
  const uploadCount = typeof rawCount === 'number' && Number.isFinite(rawCount) ? rawCount : 0;
  return {
    uid: firstId(item.properties?.uid),
    url,
    name,
    uploadCount,
  };
}

async function listCollections(token: string, destination: string): Promise<Response> {
  const url = new URL(MICROPUB_ENDPOINT);
  url.searchParams.set('q', 'source');
  url.searchParams.set('mp-channel', 'collections');
  url.searchParams.set('mp-destination', destination);

  const response = await fetch(url, { headers: bearer(token) });
  if (!response.ok) return upstreamError(response, 'Could not load Micro.blog photo collections.');

  const payload = await response.json().catch(() => null) as { items?: CollectionItem[] } | null;
  const collections = Array.isArray(payload?.items)
    ? payload.items.map(normalizeCollection).filter((item): item is Collection => item !== null)
    : [];
  return json({ collections });
}

async function createCollection(token: string, destination: string, name: string): Promise<Response> {
  const response = await fetch(MICROPUB_ENDPOINT, {
    method: 'POST',
    headers: {
      ...bearer(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      'mp-channel': 'collections',
      'mp-destination': destination,
      properties: { name: [name] },
    }),
  });
  if (!response.ok) return upstreamError(response, 'Could not create the Micro.blog photo collection.');

  const location = response.headers.get('Location');
  return json({ url: location || null, name }, response.status === 201 ? 201 : 200);
}

async function addPhotos(
  token: string,
  destination: string,
  collectionUrl: string,
  photoUrls: string[],
): Promise<Response> {
  const response = await fetch(MICROPUB_ENDPOINT, {
    method: 'POST',
    headers: {
      ...bearer(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'update',
      'mp-channel': 'collections',
      'mp-destination': destination,
      url: collectionUrl,
      add: { photo: photoUrls },
    }),
  });
  if (!response.ok) return upstreamError(response, 'Could not add the uploaded photos to the Micro.blog collection.');
  return json({ added: photoUrls.length });
}

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const disabled = publicPublishingDisabledResponse();
  if (disabled) return disabled;

  const body = await request.json().catch(() => ({})) as {
    token?: string;
    destination?: string;
    action?: string;
    name?: string;
    collectionUrl?: string;
    photoUrls?: unknown[];
  };

  const token = body.token?.trim();
  const destination = body.destination?.trim();
  if (!token) return json({ error: 'Micro.blog app token is required.' }, 400);
  if (!destination) return json({ error: 'A Micro.blog destination is required.' }, 400);

  if (body.action === 'list') return listCollections(token, destination);

  if (body.action === 'create') {
    const name = body.name?.trim();
    if (!name) return json({ error: 'A collection name is required.' }, 400);
    return createCollection(token, destination, name);
  }

  if (body.action === 'add') {
    const collectionUrl = body.collectionUrl?.trim();
    const photoUrls = Array.isArray(body.photoUrls)
      ? [...new Set(body.photoUrls.filter((url): url is string => typeof url === 'string').map(url => url.trim()).filter(Boolean))]
      : [];
    if (!collectionUrl) return json({ error: 'A collection URL is required.' }, 400);
    if (!photoUrls.length) return json({ error: 'At least one uploaded photo URL is required.' }, 400);
    if (photoUrls.length > 30) return json({ error: 'A maximum of 30 photos can be added in one request.' }, 400);
    return addPhotos(token, destination, collectionUrl, photoUrls);
  }

  return json({ error: 'Unknown collection action.' }, 400);
};

export const config = {
  path: '/api/microblog/collections',
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
