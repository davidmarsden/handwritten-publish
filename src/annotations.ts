import type { Annotation, NormalizedRect } from './model';

export const MIN_ANNOTATION_SIZE = 0.01;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function constrainRect(rect: NormalizedRect): NormalizedRect {
  const width = Math.min(1, Math.max(MIN_ANNOTATION_SIZE, rect.width));
  const height = Math.min(1, Math.max(MIN_ANNOTATION_SIZE, rect.height));
  const x = Math.min(clamp01(rect.x), 1 - width);
  const y = Math.min(clamp01(rect.y), 1 - height);
  return { x, y, width, height };
}

export function rectFromPoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
): NormalizedRect | null {
  const left = clamp01(Math.min(start.x, end.x));
  const top = clamp01(Math.min(start.y, end.y));
  const right = clamp01(Math.max(start.x, end.x));
  const bottom = clamp01(Math.max(start.y, end.y));
  const width = right - left;
  const height = bottom - top;
  if (width < MIN_ANNOTATION_SIZE || height < MIN_ANNOTATION_SIZE) return null;
  return { x: left, y: top, width, height };
}

export function annotationStyle(annotation: Annotation) {
  return {
    left: `${annotation.x * 100}%`,
    top: `${annotation.y * 100}%`,
    width: `${annotation.width * 100}%`,
    height: `${annotation.height * 100}%`,
  };
}

export function replaceAnnotation(
  annotations: Annotation[],
  index: number,
  next: Annotation,
): Annotation[] {
  return annotations.map((annotation, annotationIndex) => (
    annotationIndex === index ? next : annotation
  ));
}
