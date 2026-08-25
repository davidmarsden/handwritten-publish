export const FORMAT_VERSION = 1 as const;

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

export type HandwrittenPage = {
  id: string;
  position: number;
  filename: string;
  mediaType: 'image/png';
  sha256: string;
  width: number;
  height: number;
  annotations: Annotation[];
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
};

export type HandwrittenDocument = {
  format: 'handwritten-publish';
  version: typeof FORMAT_VERSION;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  transcript?: string;
  pages: HandwrittenPage[];
  publishing?: {
    microblog?: MicroblogDraftState;
  };
};

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
  };
}
