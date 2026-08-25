import type { HandwrittenDocument, HandwrittenPage } from './model';

export type ImportedPage = HandwrittenPage & { file: File; previewUrl: string };

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

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function importPngFiles(files: File[]): Promise<ImportedPage[]> {
  const pngs = files.filter(file => file.type === 'image/png' || file.name.toLowerCase().endsWith('.png'));
  pngs.sort(naturalCompare);

  return Promise.all(pngs.map(async (file, index) => {
    const dimensions = await imageDimensions(file);
    return {
      id: crypto.randomUUID(),
      position: index + 1,
      filename: file.name,
      mediaType: 'image/png' as const,
      sha256: await sha256(file),
      width: dimensions.width,
      height: dimensions.height,
      annotations: [],
      file,
      previewUrl: URL.createObjectURL(file),
    };
  }));
}

export function documentPages(pages: ImportedPage[]): HandwrittenDocument['pages'] {
  return pages.map(({ file: _file, previewUrl: _previewUrl, ...page }, index) => ({
    ...page,
    position: index + 1,
  }));
}
