import { describe, expect, it } from 'vitest';
import { assetExtension, documentAssets, type ImportedAsset } from './assets';

describe('photo assets', () => {
  it('strips browser-only file and preview fields from document metadata', () => {
    const asset = {
      id: 'photo-1',
      filename: 'station.jpg',
      mediaType: 'image/jpeg',
      sha256: 'abc123',
      width: 1600,
      height: 900,
      file: {} as File,
      previewUrl: 'blob:preview',
    } satisfies ImportedAsset;

    expect(documentAssets([asset])).toEqual([{
      id: 'photo-1',
      filename: 'station.jpg',
      mediaType: 'image/jpeg',
      sha256: 'abc123',
      width: 1600,
      height: 900,
    }]);
  });

  it('uses deterministic bundle extensions for supported media', () => {
    expect(assetExtension('image/jpeg')).toBe('jpg');
    expect(assetExtension('image/png')).toBe('png');
    expect(assetExtension('image/webp')).toBe('webp');
  });
});
