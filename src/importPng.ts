import type { AssetMediaType, DocumentPage, HandwrittenDocument, HandwrittenPage, PhotoPage } from './model';

export type ImportedPage = DocumentPage & { file: File; previewUrl: string };

function naturalCompare(a: File, b: File) {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

async function imageDimensions(file: File): Promise<{width: number; height: number}> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function photoMediaType(file: File): AssetMediaType | null {
  if (file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp') return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}

export async function sha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function importedPage(page: DocumentPage, file: File): ImportedPage {
  return {
    ...page,
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

export async function importPngFiles(files: File[]): Promise<ImportedPage[]> {
  const pngs = files.filter(file => file.type === 'image/png' || file.name.toLowerCase().endsWith('.png'));
  pngs.sort(naturalCompare);

  return Promise.all(pngs.map(async (file, index) => {
    const dimensions = await imageDimensions(file);
    const page: HandwrittenPage = {
      kind: 'handwritten',
      id: crypto.randomUUID(),
      position: index + 1,
      filename: file.name,
      mediaType: 'image/png',
      sha256: await sha256(file),
      width: dimensions.width,
      height: dimensions.height,
      annotations: [],
    };
    return { ...page, file, previewUrl: URL.createObjectURL(file) };
  }));
}

export async function importPhotoPageFiles(files: File[]): Promise<ImportedPage[]> {
  const photos = files
    .map(file => ({ file, mediaType: photoMediaType(file) }))
    .filter((entry): entry is { file: File; mediaType: AssetMediaType } => Boolean(entry.mediaType))
    .sort((a, b) => naturalCompare(a.file, b.file));

  if (!photos.length) throw new Error('Choose a JPEG, PNG or WebP photo.');

  return Promise.all(photos.map(async ({ file, mediaType }, index) => {
    const dimensions = await imageDimensions(file);
    const page: PhotoPage = {
      kind: 'photo',
      id: crypto.randomUUID(),
      position: index + 1,
      filename: file.name,
      mediaType,
      sha256: await sha256(file),
      width: dimensions.width,
      height: dimensions.height,
      annotations: [],
    };
    return { ...page, file, previewUrl: URL.createObjectURL(file) };
  }));
}

export function documentPages(pages: ImportedPage[]): HandwrittenDocument['pages'] {
  return pages.map(({ file: _file, previewUrl: _previewUrl, ...page }, index) => ({
    ...page,
    position: index + 1,
  }));
}
