import { describe, expect, it } from 'vitest';

// The edge function deliberately leaves static fallback metadata in drawing/index.html.
// These checks protect the two contracts the dynamic preview relies on: the route is
// limited to the public Drawing Hand page and the challenge API remains the source of
// the newest challenge image.
describe('Drawing Hand social preview', () => {
  it('uses the public Drawing Hand route only', async () => {
    const source = await import('./drawing-social-preview?raw').then(module => module.default as string);
    expect(source).toContain("path: ['/drawing', '/drawing/']");
    expect(source).toContain("'/api/drawing-challenges'");
    expect(source).toContain('payload.challenges?.[0]');
  });

  it('keeps a static branded fallback when no challenge can be loaded', async () => {
    const source = await import('./drawing-social-preview?raw').then(module => module.default as string);
    expect(source).toContain('/brand/drawing-hand-og.svg');
    expect(source).toContain('if (!newest) return response');
  });
});
