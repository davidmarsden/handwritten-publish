export const MICROBLOG_MAX_MEDIA_BYTES = 5_000_000;
export const MICROBLOG_BRIDGE_SAFE_BYTES = 3_500_000;
export const MICROBLOG_TARGET_MEDIA_BYTES = 3_000_000;
const MAX_WEB_EDGE = 3000;
const MIN_WEB_EDGE = 1200;
const JPEG_QUALITIES = [0.9, 0.82, 0.74, 0.66] as const;

type SupportedPhotoType = 'image/jpeg' | 'image/png' | 'image/webp';
type BrowserImageSource = ImageBitmap | HTMLImageElement;

export type PreparedMicroblogPhoto = {
  file: File;
  optimized: boolean;
  originalBytes: number;
  uploadBytes: number;
  width?: number;
  height?: number;
};

function isSupportedPhotoType(value: string): value is SupportedPhotoType {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';
}

function webJpegFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, '') || 'photo';
  return `${stem}-web.jpg`;
}

function canvasJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('The browser could not encode an optimized JPEG.'));
    }, 'image/jpeg', quality);
  });
}

function sourceDimensions(source: BrowserImageSource): [number, number] {
  return source instanceof HTMLImageElement
    ? [source.naturalWidth, source.naturalHeight]
    : [source.width, source.height];
}

function drawSource(source: BrowserImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser could not prepare this photo for upload.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function materializeBrowserFile(file: File, mediaType: string): Promise<File> {
  try {
    const bytes = await file.arrayBuffer();
    return new File([bytes], file.name, {
      type: mediaType || file.type,
      lastModified: file.lastModified,
    });
  } catch {
    throw new Error(`${file.name} could not be read from the selected photo provider. Try selecting it again or saving it to the device first.`);
  }
}

async function htmlImage(file: File): Promise<{ source: HTMLImageElement; cleanup: () => void }> {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.src = objectUrl;
  try {
    if (typeof image.decode === 'function') await image.decode();
    else await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The source image could not be decoded.'));
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('The source image could not be decoded.');
    return { source: image, cleanup: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function loadImage(file: File): Promise<{ source: BrowserImageSource; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, cleanup: () => bitmap.close() };
    } catch {
      // Some Android/Google Photos combinations expose a valid browser File that
      // createImageBitmap cannot decode. The HTMLImageElement path is more tolerant.
    }
  }
  return htmlImage(file);
}

function dimensionsForMaxEdge(width: number, height: number, maxEdge: number): [number, number] {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return [width, height];
  const scale = maxEdge / longest;
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

export async function preparePhotoForMicroblog(
  file: File,
  mediaType: string = file.type,
): Promise<PreparedMicroblogPhoto> {
  const originalBytes = file.size;

  // Android/Google Photos and other document providers can hand the browser a
  // provider-backed File whose bytes become unreliable when read later by a
  // different API. Copy it once into a browser-owned File, then use that stable
  // copy for both image decoding and the eventual upload request.
  const stableFile = await materializeBrowserFile(file, mediaType);

  // The Micro.blog endpoint accepts 5 MB, but the Netlify function transport has
  // its own payload ceiling. Leave a generous margin for request encoding/metadata.
  if (stableFile.size <= MICROBLOG_BRIDGE_SAFE_BYTES) {
    return {
      file: stableFile,
      optimized: false,
      originalBytes,
      uploadBytes: stableFile.size,
    };
  }

  if (!isSupportedPhotoType(mediaType)) {
    throw new Error(`${file.name} is too large for the upload bridge and cannot be optimized automatically.`);
  }

  const loaded = await loadImage(stableFile);
  try {
    const [sourceWidth, sourceHeight] = sourceDimensions(loaded.source);
    let [width, height] = dimensionsForMaxEdge(sourceWidth, sourceHeight, MAX_WEB_EDGE);
    let smallest: { blob: Blob; width: number; height: number } | null = null;

    while (true) {
      const canvas = drawSource(loaded.source, width, height);
      for (const quality of JPEG_QUALITIES) {
        const blob = await canvasJpeg(canvas, quality);
        if (!smallest || blob.size < smallest.blob.size) smallest = { blob, width, height };
        if (blob.size <= MICROBLOG_TARGET_MEDIA_BYTES) {
          const optimized = new File([blob], webJpegFilename(stableFile.name), { type: 'image/jpeg' });
          return {
            file: optimized,
            optimized: true,
            originalBytes,
            uploadBytes: optimized.size,
            width,
            height,
          };
        }
      }

      if (Math.max(width, height) <= MIN_WEB_EDGE) break;
      const nextWidth = Math.max(1, Math.round(width * 0.82));
      const nextHeight = Math.max(1, Math.round(height * 0.82));
      if ((nextWidth === width && nextHeight === height) || Math.max(nextWidth, nextHeight) < MIN_WEB_EDGE) break;
      width = nextWidth;
      height = nextHeight;
    }

    if (smallest && smallest.blob.size <= MICROBLOG_BRIDGE_SAFE_BYTES) {
      const optimized = new File([smallest.blob], webJpegFilename(stableFile.name), { type: 'image/jpeg' });
      return {
        file: optimized,
        optimized: true,
        originalBytes,
        uploadBytes: optimized.size,
        width: smallest.width,
        height: smallest.height,
      };
    }

    throw new Error(`${file.name} could not be reduced to a safe upload size without making it unreasonably small.`);
  } finally {
    loaded.cleanup();
  }
}

export function formatOptimizationNotice(filename: string, originalBytes: number, uploadBytes: number): string {
  const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `Optimized ${filename} for Micro.blog: ${mb(originalBytes)} → ${mb(uploadBytes)}.`;
}
