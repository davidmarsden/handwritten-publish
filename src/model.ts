export const LEGACY_FORMAT_VERSION = 1 as const;
export const FORMAT_VERSION = 2 as const;
export type FormatVersion = typeof LEGACY_FORMAT_VERSION | typeof FORMAT_VERSION;

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LinkAnnotation = NormalizedRect & {
  type: 'link';
  href: string;
  label?: string;
};

export type PhotoAnnotation = NormalizedRect & {
  type: 'photo';
  assetId: string;
  alt?: string;
};

export type Annotation = LinkAnnotation | PhotoAnnotation;

export type AssetMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

export type HandwrittenPage = {
  kind?: 'handwritten';
  id: string;
  position: number;
  filename: string;
  mediaType: 'image/png';
  sha256: string;
  width: number;
  height: number;
  annotations: Annotation[];
};

export type PhotoPage = {
  kind: 'photo';
  id: string;
  position: number;
  filename: string;
  mediaType: AssetMediaType;
  sha256: string;
  width: number;
  height: number;
  annotations: Annotation[];
  alt?: string;
};

export type DocumentPage = HandwrittenPage | PhotoPage;

export type HandwrittenAsset = {
  id: string;
  filename: string;
  mediaType: AssetMediaType;
  sha256: string;
  width: number;
  height: number;
};

export type MicroblogPhotoMedia = {
  assetId: string;
  sha256: string;
  url: string;
};

export type MicroblogDraftState = {
  destination: string;
  url: string;
  preview: string;
  createdAt: string;
  syncedAt?: string;
  syncedDocumentUpdatedAt?: string;
  syncedContentRevision?: string;
  pageHashes?: string[];
  mediaUrls?: string[];
  photoMedia?: MicroblogPhotoMedia[];
};

export type HandwrittenDocument = {
  format: 'handwritten-publish';
  version: FormatVersion;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  transcript?: string;
  pages: DocumentPage[];
  assets?: HandwrittenAsset[];
  publishing?: {
    microblog?: MicroblogDraftState;
  };
};

export function isPhotoPage(page: DocumentPage): page is PhotoPage {
  return page.kind === 'photo';
}

export function isHandwrittenPage(page: DocumentPage): page is HandwrittenPage {
  return page.kind !== 'photo';
}

export function upgradeDocumentFormat(document: HandwrittenDocument): HandwrittenDocument {
  return {
    ...document,
    version: FORMAT_VERSION,
    pages: document.pages.map(page => page.kind === undefined
      ? { ...page, kind: 'handwritten' as const }
      : page),
  };
}

export function createDocument(title = 'Untitled handwritten post'): HandwrittenDocument {
  const now = new Date().toISOString();
  return {
    format: 'handwritten-publish',
    version: FORMAT_VERSION,
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    pages: [],
    assets: [],
  };
}
