const TARGET_LONG_EDGE = 2200;
const MAX_SCALE = 2.5;

export function pdfRenderScale(width: number, height: number): number {
  const longEdge = Math.max(width, height);
  if (!Number.isFinite(longEdge) || longEdge <= 0) return 1;
  return Math.min(MAX_SCALE, TARGET_LONG_EDGE / longEdge);
}
