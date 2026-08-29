export const MICROBLOG_MAX_MEDIA_BYTES = 5_000_000;
export const MICROBLOG_TARGET_MEDIA_BYTES = 4_500_000;
const MAX_WEB_EDGE = 3000;
const MIN_WEB_EDGE = 1200;
const JPEG_QUALITIES = [0.9, 0.82, 0.74, 0.66] as const;

type SupportedPhotoType = 'image/jpeg' | 'image/png' | 'image/webp';

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

function drawBitmap(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser could not prepare this photo for upload.');

  // JPEG has no alpha channel. A white backing keeps transparent PNG/WebP areas predictable.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas;
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
  if (file.size <= MICROBLOG_MAX_MEDIA_BYTES) {
    return {
      file,
      optimized: false,
      originalBytes: file.size,
      uploadBytes: file.size,
    };
  }

  if (!isSupportedPhotoType(mediaType)) {
    throw new Error(`${file.name} is too large for Micro.blog and cannot be optimized automatically.`);
  }

  if (typeof createImageBitmap !== 'function') {
    throw new Error(`${file.name} is too large for Micro.blog and this browser cannot optimize it automatically.`);
  }

  const bitmap = await createImageBitmap(file);
  try {
    let [width, height] = dimensionsForMaxEdge(bitmap.width, bitmap.height, MAX_WEB_EDGE);
    let smallest: { blob: Blob; width: number; height: number } | null = null;

    while (true) {
      const canvas = drawBitmap(bitmap, width, height);
      for (const quality of JPEG_QUALITIES) {
        const blob = await canvasJpeg(canvas, quality);
        if (!smallest || blob.size < smallest.blob.size) smallest = { blob, width, height };
        if (blob.size <= MICROBLOG_TARGET_MEDIA_BYTES) {
          const optimized = new File([blob], webJpegFilename(file.name), { type: 'image/jpeg' });
          return {
            file: optimized,
            optimized: true,
            originalBytes: file.size,
            uploadBytes: optimized.size,
            width,
            height,
          };
        }
      }

      if (Math.max(width, height) <= MIN_WEB_EDGE) break;
      const nextWidth = Math.max(1, Math.round(width * 0.82));
      const nextHeight = Math.max(1, Math.round(height * 0.82));
      if (nextWidth === width && nextHeight === height || Math.max(nextWidth, nextHeight) < MIN_WEB_EDGE) break;
      width = nextWidth;
      height = nextHeight;
    }

    if (smallest && smallest.blob.size <= MICROBLOG_MAX_MEDIA_BYTES) {
      const optimized = new File([smallest.blob], webJpegFilename(file.name), { type: 'image/jpeg' });
      return {
        file: optimized,
        optimized: true,
        originalBytes: file.size,
        uploadBytes: optimized.size,
        width: smallest.width,
        height: smallest.height,
      };
    }

    throw new Error(`${file.name} could not be reduced below the 5 MB Micro.blog upload limit without making it unreasonably small.`);
  } finally {
    bitmap.close();
  }
}

export function formatOptimizationNotice(filename: string, originalBytes: number, uploadBytes: number): string {
  const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `Optimized ${filename} for Micro.blog: ${mb(originalBytes)} → ${mb(uploadBytes)}.`;
}
