import JSZip from 'jszip';
import type { HandwrittenDocument } from './model';
import type { ImportedPage } from './importPng';

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

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
