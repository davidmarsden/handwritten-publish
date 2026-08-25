import type { Annotation, NormalizedRect } from './model';

const MIN_SIZE = 0.01;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function constrainRect(rect: NormalizedRect): NormalizedRect {
  const x = clamp01(rect.x);
  const y = clamp01(rect.y);
  const width = Math.min(Math.max(MIN_SIZE, rect.width), 1 - x);
  const height = Math.min(Math.max(MIN_SIZE, rect.height), 1 - y);
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
  if (width < MIN_SIZE || height < MIN_SIZE) return null;
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
