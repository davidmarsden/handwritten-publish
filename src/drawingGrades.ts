export type DrawingGrade = {
  label: string;
  min: number;
  max: number;
};

// Elijah's grading system is intentionally irregular. Keep these exact ranges;
// values in the gaps do not receive an automatic suggestion.
export const DRAWING_GRADES: readonly DrawingGrade[] = [
  { label: 'G−', min: 0, max: 0.02 },
  { label: 'G', min: 0.03, max: 0.05 },
  { label: 'G+', min: 0.06, max: 0.09 },
  { label: 'F−', min: 0.1, max: 1.1 },
  { label: 'F', min: 1.2, max: 1.37 },
  { label: 'F+', min: 1.38, max: 1.43 },
  { label: 'E−', min: 1.44, max: 1.96 },
  { label: 'E', min: 1.97, max: 2 },
  { label: 'E+', min: 2.1, max: 2.27 },
  { label: 'D−', min: 2.28, max: 2.43 },
  { label: 'D', min: 2.44, max: 2.5 },
  { label: 'D+', min: 2.6, max: 2.82 },
  { label: 'C−', min: 2.89, max: 2.9 },
  { label: 'C', min: 3, max: 3.15 },
  { label: 'C+', min: 3.16, max: 3.5 },
  { label: 'B−', min: 3.6, max: 4.86 },
  { label: 'B', min: 4.87, max: 5 },
  { label: 'B+', min: 5.1, max: 5.32 },
  { label: 'A−', min: 5.33, max: 5.6 },
  { label: 'A', min: 5.7, max: 5.95 },
  { label: 'A+', min: 5.96, max: 6 },
  { label: 'S−', min: 6.1, max: 6.97 },
  { label: 'S', min: 6.98, max: 8 },
  { label: 'S+', min: 8.1, max: 9.4 },
  { label: 'P', min: 9.5, max: 10 },
] as const;

export function suggestedDrawingGrade(score: number): string | null {
  if (!Number.isFinite(score) || score < 0 || score > 10) return null;
  return DRAWING_GRADES.find(({ min, max }) => score >= min && score <= max)?.label ?? null;
}
