import type { ImportedAsset } from './assets';
import type { ImportedPage } from './importPng';
import type {
  HandwrittenAsset,
  HandwrittenDocument,
  LinkAnnotation,
  MicroblogDraftState,
  MicroblogPhotoMedia,
  PhotoAnnotation,
} from './model';

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

const MAX_MEDIA_BYTES = 5_000_000;

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

async function uploadMicroblogMedia(token: string, file: File, filename: string, mediaType: string): Promise<string> {
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error(`${filename} is ${(file.size / 1_000_000).toFixed(1)} MB; the current Micro.blog bridge supports media files up to 5 MB.`);
  }

  const response = await fetch('/api/microblog/media', {
    method: 'POST',
    headers: {
      'Content-Type': mediaType,
      'X-Microblog-Token': token.trim(),
      'X-File-Name': encodeURIComponent(filename),
    },
    body: file,
  });
  if (!response.ok) throw new Error(await responseError(response, `Could not upload ${filename}.`));
  const payload = await response.json() as { url?: string };
  if (!payload.url) throw new Error(`Micro.blog uploaded ${filename} but returned no media URL.`);
  return payload.url;
}

export async function uploadMicroblogPage(
  _mediaEndpoint: string,
  token: string,
  page: ImportedPage,
): Promise<string> {
  return uploadMicroblogMedia(token, page.file, page.filename, 'image/png');
}

export async function uploadMicroblogPhoto(
  _mediaEndpoint: string,
  token: string,
  asset: ImportedAsset,
): Promise<string> {
  return uploadMicroblogMedia(token, asset.file, asset.filename, asset.mediaType);
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

function canonicalPublishableHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

function assetById(document: HandwrittenDocument, assetId: string): HandwrittenAsset | undefined {
  return document.assets?.find(asset => asset.id === assetId);
}

export function microblogPhotoAssetIds(document: HandwrittenDocument): string[] {
  const ids: string[] = [];
  for (const page of document.pages) {
    for (const annotation of page.annotations) {
      if (annotation.type === 'photo' && annotation.assetId && !ids.includes(annotation.assetId)) ids.push(annotation.assetId);
    }
  }
  return ids;
}

export function reusableMicroblogPhotoUrl(draft: MicroblogDraftState, asset: HandwrittenAsset): string | null {
  const existing = draft.photoMedia?.find(media => media.assetId === asset.id && media.sha256 === asset.sha256);
  return existing?.url ?? null;
}

export function microblogAnnotationError(document: HandwrittenDocument): string | null {
  for (let pageIndex = 0; pageIndex < document.pages.length; pageIndex += 1) {
    for (const annotation of document.pages[pageIndex].annotations) {
      if (annotation.type === 'link') {
        const href = annotation.href.trim();
        if (!href) {
          return `Page ${pageIndex + 1} has a link region without a URL. Add the URL or delete the region before syncing Micro.blog.`;
        }
        if (!canonicalPublishableHttpUrl(href)) {
          return `Page ${pageIndex + 1} has a link region with an invalid URL. Use a complete http:// or https:// address before syncing Micro.blog.`;
        }
      }
      if (annotation.type === 'photo') {
        if (!annotation.assetId.trim()) {
          return `Page ${pageIndex + 1} has a photo region without a photo. Add a photo or delete the region before syncing Micro.blog.`;
        }
        if (!assetById(document, annotation.assetId)) {
          return `Page ${pageIndex + 1} references a photo that is missing from this document. Rebind the photo before syncing Micro.blog.`;
        }
      }
    }
  }
  return null;
}

function linkHtml(link: LinkAnnotation, pageIndex: number): string {
  const label = link.label?.trim() || `Handwritten link on page ${pageIndex + 1}`;
  const href = canonicalPublishableHttpUrl(link.href.trim());
  if (!href) return '';
  const style = [
    'position:absolute',
    `left:${percent(link.x)}`,
    `top:${percent(link.y)}`,
    `width:${percent(link.width)}`,
    `height:${percent(link.height)}`,
    'display:block',
    'z-index:3',
  ].join(';');
  return `<a href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}" style="${style}"></a>`;
}

function photoHtml(photo: PhotoAnnotation, pageIndex: number, photoUrls: Record<string, string>): string {
  const url = photoUrls[photo.assetId];
  if (!url) return '';
  const alt = photo.alt?.trim() || `Photo on handwritten page ${pageIndex + 1}`;
  const style = [
    'position:absolute',
    `left:${percent(photo.x)}`,
    `top:${percent(photo.y)}`,
    `width:${percent(photo.width)}`,
    `height:${percent(photo.height)}`,
    'display:block',
    'object-fit:cover',
    'z-index:2',
  ].join(';');
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" style="${style}">`;
}

export function microblogHtml(
  document: HandwrittenDocument,
  mediaUrls: string[],
  photoUrls: Record<string, string> = {},
): string {
  const pages = mediaUrls.map((url, index) => {
    const annotations = document.pages[index]?.annotations ?? [];
    const photos = annotations
      .filter((annotation): annotation is PhotoAnnotation => annotation.type === 'photo')
      .map(photo => photoHtml(photo, index, photoUrls))
      .join('');
    const links = annotations
      .filter((annotation): annotation is LinkAnnotation => annotation.type === 'link' && Boolean(canonicalPublishableHttpUrl(annotation.href.trim())))
      .map(link => linkHtml(link, index))
      .join('');
    return `<figure class="handwritten-page" style="position:relative;margin:0;display:block"><img src="${escapeHtml(url)}" alt="Handwritten page ${index + 1} of ${mediaUrls.length}" style="display:block;width:100%;height:auto">${photos}${links}</figure>`;
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
      annotations: page.annotations.map(annotation => annotation.type === 'link'
        ? {
            type: 'link',
            x: annotation.x,
            y: annotation.y,
            width: annotation.width,
            height: annotation.height,
            href: canonicalPublishableHttpUrl(annotation.href.trim()) ?? annotation.href.trim(),
            label: annotation.label?.trim() ?? '',
          }
        : {
            type: 'photo',
            x: annotation.x,
            y: annotation.y,
            width: annotation.width,
            height: annotation.height,
            assetId: annotation.assetId,
            assetSha256: assetById(document, annotation.assetId)?.sha256 ?? '',
            alt: annotation.alt?.trim() ?? '',
          }),
    })),
  });
}

function syncedDraftState(
  draft: Pick<MicroblogDraftState, 'destination' | 'url' | 'preview' | 'createdAt'>,
  document: HandwrittenDocument,
  mediaUrls: string[],
  photoMedia: MicroblogPhotoMedia[],
): MicroblogDraftState {
  return {
    ...draft,
    syncedAt: new Date().toISOString(),
    syncedDocumentUpdatedAt: document.updatedAt,
    syncedContentRevision: microblogContentRevision(document),
    pageHashes: document.pages.map(page => page.sha256),
    mediaUrls,
    photoMedia,
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
  photoMedia: MicroblogPhotoMedia[] = [],
): Promise<MicroblogDraftState> {
  const annotationError = microblogAnnotationError(document);
  if (annotationError) throw new Error(annotationError);
  const photoUrls = Object.fromEntries(photoMedia.map(media => [media.assetId, media.url]));

  const response = await fetch('/api/microblog/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: token.trim(),
      destination,
      title: document.title,
      html: microblogHtml(document, mediaUrls, photoUrls),
    }),
  });
  if (!response.ok) throw new Error(await responseError(response, 'Micro.blog could not create the draft.'));
  const result = await response.json() as DraftResponse;
  return syncedDraftState({
    destination,
    url: result.url,
    preview: result.preview || result.url,
    createdAt: new Date().toISOString(),
  }, document, mediaUrls, photoMedia);
}

export async function updateMicroblogDraft(
  token: string,
  document: HandwrittenDocument,
  draft: MicroblogDraftState,
  mediaUrls: string[],
  photoMedia: MicroblogPhotoMedia[] = [],
): Promise<MicroblogDraftState> {
  const annotationError = microblogAnnotationError(document);
  if (annotationError) throw new Error(annotationError);
  const photoUrls = Object.fromEntries(photoMedia.map(media => [media.assetId, media.url]));

  const response = await fetch('/api/microblog/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: token.trim(),
      destination: draft.destination,
      title: document.title,
      html: microblogHtml(document, mediaUrls, photoUrls),
      updateUrl: draft.url,
    }),
  });
  if (!response.ok) throw new Error(await responseError(response, 'Micro.blog could not update the draft.'));
  return syncedDraftState(draft, document, mediaUrls, photoMedia);
}
