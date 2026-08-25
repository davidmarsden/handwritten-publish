import type { ImportedPage } from './importPng';
import type { HandwrittenDocument, MicroblogDraftState } from './model';

export const MICROPUB_ENDPOINT = 'https://micro.blog/micropub';

export type MicroblogDestination = {
  uid: string;
  name: string;
};

export type MicroblogConfig = {
  mediaEndpoint: string;
  destinations: MicroblogDestination[];
};

type RawConfig = {
  'media-endpoint'?: string;
  destination?: Array<{ uid?: string; name?: string }>;
};

type DraftResponse = {
  url?: string;
  preview?: string;
};

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token.trim()}` };
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: string; error_description?: string };
    return payload.error_description || payload.error || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchMicroblogConfig(token: string): Promise<MicroblogConfig> {
  const response = await fetch(`${MICROPUB_ENDPOINT}?q=config`, {
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(await errorMessage(response, 'Micro.blog rejected this app token.'));

  const config = await response.json() as RawConfig;
  if (!config['media-endpoint']) throw new Error('Micro.blog did not return a media endpoint.');

  return {
    mediaEndpoint: config['media-endpoint'],
    destinations: (config.destination ?? [])
      .filter((destination): destination is { uid: string; name?: string } => typeof destination.uid === 'string')
      .map(destination => ({ uid: destination.uid, name: destination.name || destination.uid })),
  };
}

export async function uploadMicroblogPage(mediaEndpoint: string, token: string, page: ImportedPage): Promise<string> {
  const body = new FormData();
  body.append('file', page.file, page.filename);
  const response = await fetch(mediaEndpoint, {
    method: 'POST',
    headers: authHeaders(token),
    body,
  });
  if (!response.ok) throw new Error(await errorMessage(response, `Could not upload ${page.filename}.`));
  const location = response.headers.get('Location');
  if (!location) throw new Error(`Micro.blog uploaded ${page.filename} but returned no media URL.`);
  return location;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function microblogHtml(document: HandwrittenDocument, mediaUrls: string[]): string {
  const pages = mediaUrls.map((url, index) => (
    `<figure class="handwritten-page"><img src="${escapeHtml(url)}" alt="Handwritten page ${index + 1} of ${mediaUrls.length}"></figure>`
  ));
  if (document.transcript) {
    pages.push(`<details class="handwritten-transcript"><summary>Transcript</summary><div>${escapeHtml(document.transcript).replaceAll('\n', '<br>')}</div></details>`);
  }
  return pages.join('\n');
}

export async function createMicroblogDraft(
  token: string,
  destination: string,
  document: HandwrittenDocument,
  mediaUrls: string[],
): Promise<MicroblogDraftState> {
  const payload = {
    type: ['h-entry'],
    ...(destination ? { 'mp-destination': destination } : {}),
    properties: {
      name: [document.title],
      content: [{ html: microblogHtml(document, mediaUrls) }],
      'post-status': ['draft'],
    },
  };

  const response = await fetch(MICROPUB_ENDPOINT, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await errorMessage(response, 'Micro.blog could not create the draft.'));

  let result: DraftResponse = {};
  try {
    result = await response.json() as DraftResponse;
  } catch {
    // Micro.blog normally returns JSON for drafts; fall back to Location when available.
  }
  const url = result.url || response.headers.get('Location') || '';
  if (!url) throw new Error('Micro.blog created the draft but returned no post URL.');

  return {
    destination,
    url,
    preview: result.preview || url,
    createdAt: new Date().toISOString(),
  };
}
