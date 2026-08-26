import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { HandwrittenPage } from './model';
import { sha256, type ImportedPage } from './importPng';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const TARGET_LONG_EDGE = 2200;
const MAX_SCALE = 2.5;

export function pdfRenderScale(width: number, height: number): number {
  const longEdge = Math.max(width, height);
  if (!Number.isFinite(longEdge) || longEdge <= 0) return 1;
  return Math.min(MAX_SCALE, TARGET_LONG_EDGE / longEdge);
}

function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Could not render a PDF page to PNG.'));
    }, 'image/png');
  });
}

function baseFilename(name: string): string {
  return name.replace(/\.pdf$/i, '') || 'document';
}

export async function importPdfFile(file: File): Promise<ImportedPage[]> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) throw new Error('Choose a PDF file.');

  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;

  if (!pdf.numPages) throw new Error('This PDF contains no pages.');

  const imported: ImportedPage[] = [];
  const prefix = baseFilename(file.name);

  try {
    for (let index = 0; index < pdf.numPages; index += 1) {
      const pdfPage = await pdf.getPage(index + 1);
      const baseViewport = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: pdfRenderScale(baseViewport.width, baseViewport.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('This browser could not create a canvas for PDF rendering.');

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;

      const blob = await canvasPng(canvas);
      const filename = `${prefix}-page-${String(index + 1).padStart(4, '0')}.png`;
      const pageFile = new File([blob], filename, { type: 'image/png' });
      const page: HandwrittenPage = {
        kind: 'handwritten',
        id: crypto.randomUUID(),
        position: index + 1,
        filename,
        mediaType: 'image/png',
        sha256: await sha256(pageFile),
        width: canvas.width,
        height: canvas.height,
        annotations: [],
      };

      imported.push({ ...page, file: pageFile, previewUrl: URL.createObjectURL(pageFile) });
      pdfPage.cleanup();
    }
  } catch (error) {
    imported.forEach(page => URL.revokeObjectURL(page.previewUrl));
    throw error;
  } finally {
    await loadingTask.destroy();
  }

  return imported;
}
