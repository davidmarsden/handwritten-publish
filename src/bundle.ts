import JSZip from 'jszip';
import type { Annotation, HandwrittenDocument, HandwrittenPage } from './model';
import { FORMAT_VERSION } from './model';
import { importedPage, sha256, type ImportedPage } from './importPng';

export async function buildBundle(document: HandwrittenDocument, pages: ImportedPage[]): Promise<Blob> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(document, null, 2));
  if (document.transcript) zip.file('transcript.md', document.transcript);

  const pageFolder = zip.folder('pages');
  pages.forEach((page, index) => {
    const filename = `page-${String(index + 1).padStart(4, '0')}.png`;
    pageFolder?.file(filename, page.file);
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
    || annotation.y + annotation.height > 1) {
    return false;
  }

  if (annotation.type === 'link') {
    return typeof annotation.href === 'string'
      && (annotation.label === undefined || typeof annotation.label === 'string');
  }
  if (annotation.type === 'photo') {
    return typeof annotation.assetId === 'string'
      && (annotation.alt === undefined || typeof annotation.alt === 'string');
  }
  return false;
}

function isPage(value: unknown): value is HandwrittenPage {
  if (!value || typeof value !== 'object') return false;
  const page = value as Partial<HandwrittenPage>;
  return typeof page.id === 'string'
    && typeof page.position === 'number'
    && typeof page.filename === 'string'
    && page.mediaType === 'image/png'
    && typeof page.sha256 === 'string'
    && typeof page.width === 'number'
    && typeof page.height === 'number'
    && Array.isArray(page.annotations)
    && page.annotations.every(isAnnotation);
}

function parseManifest(value: unknown): HandwrittenDocument {
  if (!value || typeof value !== 'object') throw new Error('Invalid .hwpublish manifest.');
  const document = value as Partial<HandwrittenDocument>;
  if (document.format !== 'handwritten-publish' || document.version !== FORMAT_VERSION) {
    throw new Error('Unsupported .hwpublish format version.');
  }
  if (typeof document.id !== 'string' || typeof document.title !== 'string'
    || typeof document.createdAt !== 'string' || typeof document.updatedAt !== 'string'
    || !Array.isArray(document.pages) || !document.pages.every(isPage)) {
    throw new Error('Invalid .hwpublish manifest.');
  }
  return document as HandwrittenDocument;
}

export async function readBundle(file: File): Promise<{ document: HandwrittenDocument; pages: ImportedPage[] }> {
  const zip = await JSZip.loadAsync(file);
  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) throw new Error('This bundle does not contain manifest.json.');

  const document = parseManifest(JSON.parse(await manifestEntry.async('string')));
  const orderedPages = [...document.pages].sort((a, b) => a.position - b.position);
  const pages: ImportedPage[] = [];

  for (let index = 0; index < orderedPages.length; index += 1) {
    const page = orderedPages[index];
    const archiveName = `pages/page-${String(index + 1).padStart(4, '0')}.png`;
    const entry = zip.file(archiveName);
    if (!entry) throw new Error(`Bundle is missing ${archiveName}.`);
    const blob = await entry.async('blob');
    const actualHash = await sha256(blob);
    if (actualHash !== page.sha256) throw new Error(`Page ${index + 1} failed its integrity check.`);
    const pageFile = new File([blob], page.filename, { type: 'image/png' });
    pages.push(importedPage(page, pageFile));
  }

  return { document, pages };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
