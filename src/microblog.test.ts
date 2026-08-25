import { describe, expect, it } from 'vitest';
import { microblogHtml } from './microblog';
import { createDocument } from './model';

describe('microblogHtml', () => {
  it('keeps ordered handwritten pages and safely escapes transcript text', () => {
    const document = createDocument('Test');
    document.transcript = '<hello> & goodbye';
    const html = microblogHtml(document, ['https://example.com/1.png', 'https://example.com/2.png']);

    expect(html.indexOf('1.png')).toBeLessThan(html.indexOf('2.png'));
    expect(html).toContain('alt="Handwritten page 1 of 2"');
    expect(html).toContain('&lt;hello&gt; &amp; goodbye');
    expect(html).not.toContain('<hello>');
  });
});
