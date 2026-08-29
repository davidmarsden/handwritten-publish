import JSZip from 'jszip';
import type { Annotation, DocumentPage, HandwrittenAsset, HandwrittenDocument, HandwrittenPage } from './model';
import { FORMAT_VERSION, LEGACY_FORMAT_VERSION, isPhotoPage, upgradeDocumentFormat } from './model';
import { importedPage, sha256, type ImportedPage } from './importPng';
import { assetExtension, importedAsset, type ImportedAsset } from './assets';

function pageExtension(page: DocumentPage): string {
  if (page.mediaType === 'image/jpeg') return 'jpg';
  if (page.mediaType === 'image/webp') return 'webp';
  return 'png';
}

export async function buildBundle(document: HandwrittenDocument, pages: ImportedPage[], assets: ImportedAsset[] = []): Promise<Blob> {
  const zip = new JSZip();
  const manifest = upgradeDocumentFormat(document);
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  if (manifest.transcript) zip.file('transcript.md', manifest.transcript);

  const pageFolder = zip.folder('pages');
  pages.forEach((page, index) => {
    const filename = `page-${String(index + 1).padStart(4, '0')}.${pageExtension(page)}`;
    pageFolder?.file(filename, page.file);
  });

  const assetFolder = zip.folder('assets');
  assets.forEach(asset => {
    assetFolder?.file(`${asset.id}.${assetExtension(asset.mediaType)}`, asset.file);
  });

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

function isNormalizedNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isAnnotation(value: unknown): value is Annotation {
  if (!value || typeof value !== 'object') return false;
  const annotation = value as Partial<Annotation> & Record<string, unknown>;
  if (!isNormalizedNumber(annotation.x)
    || !isNormalizedNumber(annotation.y)
    || !isNormalizedNumber(annotation.width)
    || !isNormalizedNumber(annotation.height)
    || annotation.width <= 0
    || annotation.height <= 0
    || annotation.x + annotation.width > 1
    || annotation.y + annotation.height > 1) return false;
  if (annotation.type === 'link') return typeof annotation.href === 'string' && (annotation.label === undefined || typeof annotation.label === 'string');
  if (annotation.type === 'photo') return typeof annotation.assetId === 'string' && (annotation.alt === undefined || typeof annotation.alt === 'string');
  return false;
}

function hasBasePageFields(page: Partial<DocumentPage>): boolean {
  return typeof page.id === 'string'
    && typeof page.position === 'number'
    && Number.isFinite(page.position)
    && typeof page.filename === 'string'
    && typeof page.sha256 === 'string'
    && typeof page.width === 'number' && Number.isFinite(page.width) && page.width > 0
    && typeof page.height === 'number' && Number.isFinite(page.height) && page.height > 0;
}

function isLegacyPage(value: unknown): value is HandwrittenPage {
  if (!value || typeof value !== 'object') return false;
  const page = value as Partial<HandwrittenPage> & Record<string, unknown>;
  return hasBasePageFields(page)
    && page.kind === undefined
    && page.mediaType === 'image/png'
    && Array.isArray(page.annotations)
    && page.annotations.every(isAnnotation);
}

function isPage(value: unknown): value is DocumentPage {
  if (!value || typeof value !== 'object') return false;
  const page = value as Partial<DocumentPage> & Record<string, unknown>;
  if (!hasBasePageFields(page)) return false;

  if (page.kind === 'photo') {
    return (page.mediaType === 'image/jpeg' || page.mediaType === 'image/png' || page.mediaType === 'image/webp')
      && Array.isArray(page.annotations)
      && page.annotations.length === 0
      && (page.alt === undefined || typeof page.alt === 'string');
  }

  return (page.kind === undefined || page.kind === 'handwritten')
    && page.mediaType === 'image/png'
    && Array.isArray(page.annotations)
    && page.annotations.every(isAnnotation);
}

function isAsset(value: unknown): value is HandwrittenAsset {
  if (!value || typeof value !== 'object') return false;
  const asset = value as Partial<HandwrittenAsset>;
  return typeof asset.id === 'string'
    && typeof asset.filename === 'string'
    && (asset.mediaType === 'image/jpeg' || asset.mediaType === 'image/png' || asset.mediaType === 'image/webp')
    && typeof asset.sha256 === 'string'
    && typeof asset.width === 'number' && Number.isFinite(asset.width) && asset.width > 0
    && typeof asset.height === 'number' && Number.isFinite(asset.height) && asset.height > 0;
}

function parseManifest(value: unknown): HandwrittenDocument {
  if (!value || typeof value !== 'object') throw new Error('Invalid .handpub manifest.');
  const document = value as Partial<HandwrittenDocument> & { version?: number };
  if (document.format !== 'handwritten-publish') throw new Error('Invalid .handpub manifest.');
  if (document.version !== LEGACY_FORMAT_VERSION && document.version !== FORMAT_VERSION) {
    throw new Error('Unsupported .handpub format version.');
  }

  const pagesValid = Array.isArray(document.pages)
    && (document.version === LEGACY_FORMAT_VERSION
      ? document.pages.every(isLegacyPage)
      : document.pages.every(isPage));
  const categoriesValid = document.categories === undefined
    || (Array.isArray(document.categories) && document.categories.every(category => typeof category === 'string'));

  if (typeof document.id !== 'string' || typeof document.title !== 'string'
    || typeof document.createdAt !== 'string' || typeof document.updatedAt !== 'string'
    || (document.summary !== undefined && typeof document.summary !== 'string')
    || !categoriesValid
    || (document.transcript !== undefined && typeof document.transcript !== 'string')
    || !pagesValid
    || (document.assets !== undefined && (!Array.isArray(document.assets) || !document.assets.every(isAsset)))) {
    throw new Error('Invalid .handpub manifest.');
  }

  return upgradeDocumentFormat(document as HandwrittenDocument);
}

export async function readBundle(file: File): Promise<{ document: HandwrittenDocument; pages: ImportedPage[]; assets: ImportedAsset[] }> {
  const zip = await JSZip.loadAsync(file);
  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) throw new Error('This bundle does not contain manifest.json.');

  const rawManifest = JSON.parse(await manifestEntry.async('string')) as { version?: number };
  const sourceVersion = rawManifest.version;
  const document = parseManifest(rawManifest);
  const orderedPages = [...document.pages].sort((a, b) => a.position - b.position);
  const pages: ImportedPage[] = [];

  for (let index = 0; index < orderedPages.length; index += 1) {
    const page = orderedPages[index];
    const extension = sourceVersion === LEGACY_FORMAT_VERSION ? 'png' : pageExtension(page);
    const archiveName = `pages/page-${String(index + 1).padStart(4, '0')}.${extension}`;
    const entry = zip.file(archiveName);
    if (!entry) throw new Error(`Bundle is missing ${archiveName}.`);
    const blob = await entry.async('blob');
    const actualHash = await sha256(blob);
    if (actualHash !== page.sha256) throw new Error(`Page ${index + 1} failed its integrity check.`);
    pages.push(importedPage(page, new File([blob], page.filename, { type: page.mediaType })));
  }

  const assets: ImportedAsset[] = [];
  for (const asset of document.assets ?? []) {
    const archiveName = `assets/${asset.id}.${assetExtension(asset.mediaType)}`;
    const entry = zip.file(archiveName);
    if (!entry) throw new Error(`Bundle is missing ${archiveName}.`);
    const blob = await entry.async('blob');
    const actualHash = await sha256(blob);
    if (actualHash !== asset.sha256) throw new Error(`Photo asset ${asset.filename} failed its integrity check.`);
    assets.push(importedAsset(asset, new File([blob], asset.filename, { type: asset.mediaType })));
  }

  return { document: { ...document, assets: document.assets ?? [] }, pages, assets };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}