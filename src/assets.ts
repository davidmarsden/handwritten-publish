import type { AssetMediaType, HandwrittenAsset } from './model';
import { sha256 } from './importPng';

export type ImportedAsset = HandwrittenAsset & { file: File; previewUrl: string };

const SUPPORTED: Record<string, AssetMediaType> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

function inferredMediaType(file: File): AssetMediaType | null {
  if (SUPPORTED[file.type]) return SUPPORTED[file.type];
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}

async function imageDimensions(file: Blob): Promise<{ width: number; height: number }> {
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

export async function importPhotoAsset(file: File): Promise<ImportedAsset> {
  const mediaType = inferredMediaType(file);
  if (!mediaType) throw new Error('Choose a JPEG, PNG or WebP photo.');
  const { width, height } = await imageDimensions(file);
  return {
    id: crypto.randomUUID(),
    filename: file.name,
    mediaType,
    sha256: await sha256(file),
    width,
    height,
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

export function importedAsset(asset: HandwrittenAsset, file: File): ImportedAsset {
  return { ...asset, file, previewUrl: URL.createObjectURL(file) };
}

export function documentAssets(assets: ImportedAsset[]): HandwrittenAsset[] {
  return assets.map(({ file: _file, previewUrl: _previewUrl, ...asset }) => asset);
}

export function assetExtension(mediaType: AssetMediaType): string {
  if (mediaType === 'image/jpeg') return 'jpg';
  if (mediaType === 'image/webp') return 'webp';
  return 'png';
}
