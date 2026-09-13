import { getStore } from '@netlify/blobs';

export const DRAWING_STORE = 'drawing-hand';
export const MAX_DRAWING_BYTES = 4_000_000;
export const DRAWING_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function drawingStore() {
  return getStore(DRAWING_STORE);
}

export function drawingAdminAuthorized(request: Request): boolean {
  const expected = (globalThis as typeof globalThis & { Netlify?: { env?: { get?: (key: string) => string | undefined } } })
    .Netlify?.env?.get?.('DRAWING_HAND_ADMIN_KEY') ?? process.env.DRAWING_HAND_ADMIN_KEY ?? '';
  if (!expected) return false;
  const supplied = request.headers.get('x-drawing-hand-key') ?? '';
  return supplied.length > 0 && supplied === expected;
}

export function cleanDisplayName(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
}

export function cleanTitle(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 100) : '';
}

export function cleanDifficulty(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s+/g, ' ').slice(0, 40);
  return clean || null;
}

export function validDrawingImage(value: FormDataEntryValue | null): value is File {
  return value instanceof File
    && DRAWING_IMAGE_TYPES.has(value.type)
    && value.size > 0
    && value.size <= MAX_DRAWING_BYTES;
}

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function randomResultToken(): string {
  return crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
}
