export const MICROBLOG_MAX_MEDIA_BYTES = 5_000_000;

export type MicroblogDestination = {
  uid: string;
  name: string;
};

export type MicroblogConfig = {
  mediaEndpoint: string;
  destinations: MicroblogDestination[];
};

export type MicroblogCollection = {
  uid: string | number | null;
  url: string;
  name: string;
  uploadCount: number;
};

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

async function postJson<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await responseError(response, fallback));
  return response.json() as Promise<T>;
}

export function inferImageMediaType(file: Pick<File, 'name' | 'type'>): string {
  if (file.type) return file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  return '';
}

export async function fetchMicroblogConfig(token: string): Promise<MicroblogConfig> {
  const response = await fetch('/api/microblog/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token.trim() }),
  });
  if (!response.ok) throw new Error(await responseError(response, 'Could not connect to Micro.blog.'));
  const config = await response.json() as { destinations: MicroblogDestination[] };
  return { mediaEndpoint: '/api/microblog/media', destinations: config.destinations };
}

export async function fetchMicroblogCategories(token: string, destination: string): Promise<string[]> {
  if (!destination.trim()) return [];
  const response = await fetch('/api/microblog/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token.trim(), destination: destination.trim() }),
  });
  if (!response.ok) throw new Error(await responseError(response, 'Could not load Micro.blog categories.'));
  const config = await response.json() as { categories?: unknown[] };
  return Array.isArray(config.categories)
    ? config.categories.filter((category): category is string => typeof category === 'string')
    : [];
}

export async function fetchMicroblogCollections(token: string, destination: string): Promise<MicroblogCollection[]> {
  if (!destination.trim()) return [];
  const payload = await postJson<{ collections?: MicroblogCollection[] }>(
    '/api/microblog/collections',
    { token: token.trim(), destination: destination.trim(), action: 'list' },
    'Could not load Micro.blog photo collections.',
  );
  return Array.isArray(payload.collections) ? payload.collections : [];
}

export async function createMicroblogCollection(
  token: string,
  destination: string,
  name: string,
): Promise<{ url: string | null; name: string }> {
  return postJson(
    '/api/microblog/collections',
    { token: token.trim(), destination: destination.trim(), action: 'create', name: name.trim() },
    'Could not create the Micro.blog photo collection.',
  );
}

export async function addPhotosToMicroblogCollection(
  token: string,
  destination: string,
  collectionUrl: string,
  photoUrls: string[],
): Promise<number> {
  if (!photoUrls.length) return 0;
  const payload = await postJson<{ added?: number }>(
    '/api/microblog/collections',
    {
      token: token.trim(),
      destination: destination.trim(),
      action: 'add',
      collectionUrl: collectionUrl.trim(),
      photoUrls,
    },
    'Could not add the uploaded photos to the Micro.blog collection.',
  );
  return typeof payload.added === 'number' ? payload.added : photoUrls.length;
}

export async function uploadMicroblogMedia(
  token: string,
  file: File,
  filename: string = file.name,
  mediaType: string = inferImageMediaType(file),
  destination: string = '',
): Promise<string> {
  if (file.size > MICROBLOG_MAX_MEDIA_BYTES) {
    throw new Error(`${filename} is ${(file.size / 1_000_000).toFixed(1)} MB; the current Micro.blog bridge supports media files up to 5 MB.`);
  }

  const headers: Record<string, string> = {
    'Content-Type': mediaType,
    'X-Microblog-Token': token.trim(),
    'X-File-Name': encodeURIComponent(filename),
  };
  if (destination.trim()) headers['X-Microblog-Destination'] = encodeURIComponent(destination.trim());

  const response = await fetch('/api/microblog/media', {
    method: 'POST',
    headers,
    body: file,
  });
  if (!response.ok) throw new Error(await responseError(response, `Could not upload ${filename}.`));
  const payload = await response.json() as { url?: string };
  if (!payload.url) throw new Error(`Micro.blog uploaded ${filename} but returned no media URL.`);
  return payload.url;
}
