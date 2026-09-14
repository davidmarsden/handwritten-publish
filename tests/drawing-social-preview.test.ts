import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = await readFile(new URL('../netlify/edge-functions/drawing-social-preview.ts', import.meta.url), 'utf8');

describe('Drawing Hand social preview', () => {
  it('uses the public Drawing Hand route only', () => {
    expect(source).toContain("path: ['/drawing', '/drawing/']");
    expect(source).toContain("'/api/drawing-challenges'");
    expect(source).toContain('payload.challenges?.[0]');
  });

  it('keeps a static branded fallback when no challenge can be loaded', () => {
    expect(source).toContain('/brand/drawing-hand-og.svg');
    expect(source).toContain('if (!newest) return response');
  });
});
