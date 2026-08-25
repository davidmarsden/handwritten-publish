import type { ImportedPage } from './importPng';
import type { HandwrittenDocument, LinkAnnotation, MicroblogDraftState } from './model';

export type MicroblogDestination = {
  uid: string;
  name: string;
};

export type MicroblogConfig = {
  mediaEndpoint: string;
  destinations: MicroblogDestination[];
};

type DraftResponse = {
  url: string;
  preview: string;
};

const MAX_MEDIA_PAGE_BYTES = 5_000_000;

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
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

export async function uploadMicroblogPage(
  _mediaEndpoint: string,
  token: string,
  page: ImportedPage,
): Promise<string> {
  if (page.file.size > MAX_MEDIA_PAGE_BYTES) {
    throw new Error(`${page.filename} is ${(page.file.size / 1_000_000).toFixed(1)} MB; the current Micro.blog bridge supports PNG pages up to 5 MB.`);
  }

  const response = await fetch('/api/microblog/media', {
    method: 'POST',
    headers: {
      'Content-Type': 'image/png',
      'X-Microblog-Token': token.trim(),
      'X-File-Name': encodeURIComponent(page.filename),
    },
    body: page.file,
  });
  if (!response.ok) throw new Error(await responseError(response, `Could not upload ${page.filename}.`));
  const payload = await response.json() as { url?: string };
  if (!payload.url) throw new Error(`Micro.blog uploaded ${page.filename} but returned no media URL.`);
  return payload.url;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function percent(value: number): string {
  return `${Number((value * 100).toFixed(4))}%`;
}

function isPublishableHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function microblogAnnotationError(document: HandwrittenDocument): string | null {
  for (let pageIndex = 0; pageIndex < document.pages.length; pageIndex += 1) {
    const links = document.pages[pageIndex].annotations.filter(
      (annotation): annotation is LinkAnnotation => annotation.type === 'link',
    );
    for (const link of links) {
      const href = link.href.trim();
      if (!href) {
        return `Page ${pageIndex + 1} has a link region without a URL. Add the URL or delete the region before syncing Micro.blog.`;
      }
      if (!isPublishableHttpUrl(href)) {
        return `Page ${pageIndex + 1} has a link region with an invalid URL. Use a complete http:// or https:// address before syncing Micro.blog.`;
      }
    }
  }
  return null;
}

function linkHtml(link: LinkAnnotation, pageIndex: number): string {
  const label = link.label?.trim() || `Handwritten link on page ${pageIndex + 1}`;
  const style = [
    'position:absolute',
    `left:${percent(link.x)}`,
    `top:${percent(link.y)}`,
    `width:${percent(link.width)}`,
    `height:${percent(link.height)}`,
    'display:block',
    'z-index:2',
  ].join(';');
  return `<a href="${escapeHtml(link.href.trim())}" aria-label="${escapeHtml(label)}" style="${style}"></a>`;
}

export function microblogHtml(document: HandwrittenDocument, mediaUrls: string[]): string {
  const pages = mediaUrls.map((url, index) => {
    const links = document.pages[index]?.annotations.filter(
      (annotation): annotation is LinkAnnotation => annotation.type === 'link' && isPublishableHttpUrl(annotation.href.trim()),
    ) ?? [];
    const overlays = links.map(link => linkHtml(link, index)).join('');
    return `<figure class="handwritten-page" style="position:relative;margin:0;display:block"><img src="${escapeHtml(url)}" alt="Handwritten page ${index + 1} of ${mediaUrls.length}" style="display:block;width:100%;height:auto">${overlays}</figure>`;
  });
  if (document.transcript) {
    pages.push(`<details class="handwritten-transcript"><summary>Transcript</summary><div>${escapeHtml(document.transcript).replaceAll('\n', '<br>')}</div></details>`);
  }
  return pages.join('\n');
}

export function microblogContentRevision(document: HandwrittenDocument): string {
  return JSON.stringify({
    title: document.title.trim(),
    transcript: document.transcript ?? '',
    pages: document.pages.map(page => ({
      sha256: page.sha256,
      links: page.annotations
        .filter((annotation): annotation is LinkAnnotation => annotation.type === 'link')
        .map(link => ({
          x: link.x,
          y: link.y,
          width: link.width,
          height: link.height,
          href: link.href.trim(),
          label: link.label?.trim() ?? '',
        })),
    })),
  });
}

function syncedDraftState(
  draft: Pick<MicroblogDraftState, 'destination' | 'url' | 'preview' | 'createdAt'>,
  document: HandwrittenDocument,
  mediaUrls: string[],
): MicroblogDraftState {
  return {
    ...draft,
    syncedAt: new Date().toISOString(),
    syncedDocumentUpdatedAt: document.updatedAt,
    syncedContentRevision: microblogContentRevision(document),
    pageHashes: document.pages.map(page => page.sha256),
    mediaUrls,
  };
}

export function isMicroblogDraftStale(document: HandwrittenDocument, draft: MicroblogDraftState): boolean {
  if (draft.syncedContentRevision) {
    return draft.syncedContentRevision !== microblogContentRevision(document);
  }
  return draft.syncedDocumentUpdatedAt !== document.updatedAt;
}

export function canReuseMicroblogMedia(document: HandwrittenDocument, draft: MicroblogDraftState): boolean {
  const hashes = document.pages.map(page => page.sha256);
  return Array.isArray(draft.mediaUrls)
    && draft.mediaUrls.length === hashes.length
    && Array.isArray(draft.pageHashes)
    && draft.pageHashes.length === hashes.length
    && draft.pageHashes.every((hash, index) => hash === hashes[index]);
}

export async function verifyMicroblogDraft(token: string, draft: MicroblogDraftState): Promise<void> {
  const response = await fetch('/api/microblog/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: token.trim(),
      destination: draft.destination,
      updateUrl: draft.url,
      verifyOnly: true,
    }),
  });
  if (!response.ok) throw new Error(await responseError(response, 'Could not verify the existing Micro.blog draft.'));
}

export async function createMicroblogDraft(
  token: string,
  destination: string,
  document: HandwrittenDocument,
  mediaUrls: string[],
): Promise<MicroblogDraftState> {
  const annotationError = microblogAnnotationError(document);
  if (annotationError) throw new Error(annotationError);

  const response = await fetch('/api/microblog/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: token.trim(),
      destination,
      title: document.title,
      html: microblogHtml(document, mediaUrls),
    }),
  });
  if (!response.ok) throw new Error(await responseError(response, 'Micro.blog could not create the draft.'));
  const result = await response.json() as DraftResponse;
  return syncedDraftState({
    destination,
    url: result.url,
    preview: result.preview || result.url,
    createdAt: new Date().toISOString(),
  }, document, mediaUrls);
}

export async function updateMicroblogDraft(
  token: string,
  document: HandwrittenDocument,
  draft: MicroblogDraftState,
  mediaUrls: string[],
): Promise<MicroblogDraftState> {
  const annotationError = microblogAnnotationError(document);
  if (annotationError) throw new Error(annotationError);

  const response = await fetch('/api/microblog/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: token.trim(),
      destination: draft.destination,
      title: document.title,
      html: microblogHtml(document, mediaUrls),
      updateUrl: draft.url,
    }),
  });
  if (!response.ok) throw new Error(await responseError(response, 'Micro.blog could not update the draft.'));
  return syncedDraftState(draft, document, mediaUrls);
}
