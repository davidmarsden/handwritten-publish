import { describe, expect, it } from 'vitest';
import {
  emailDraftHtml,
  isRemarkableEmailSubject,
  stripRemarkableEmailFooter,
  titleFromEmailSubject,
} from '../netlify/functions/post-by-email';

describe('reMarkable email cleanup', () => {
  it('recognises the reMarkable document subject', () => {
    expect(isRemarkableEmailSubject('Document from my reMarkable: Field notes')).toBe(true);
    expect(isRemarkableEmailSubject('Field notes')).toBe(false);
  });

  it('uses the document filename as the title', () => {
    expect(titleFromEmailSubject('Document from my reMarkable: Field notes')).toBe('Field notes');
  });

  it('leaves ordinary email subjects alone', () => {
    expect(titleFromEmailSubject('Field notes')).toBe('Field notes');
  });

  it('falls back when the reMarkable subject contains no filename', () => {
    expect(titleFromEmailSubject('Document from my reMarkable:   ')).toBe('Handwritten note');
  });

  it('strips the standard reMarkable footer only from the end of a body', () => {
    const body = `A useful note.\n\n--\nSent from my reMarkable paper tablet\nGet yours at www.remarkable.com\n\nPS: You cannot reply to this email`;
    expect(stripRemarkableEmailFooter(body)).toBe('A useful note.');
  });

  it('leaves unrelated body text untouched', () => {
    expect(stripRemarkableEmailFooter('A useful note.')).toBe('A useful note.');
  });

  it('creates a text-only draft body from edited transcription', () => {
    const body = `First paragraph.\n\nSecond line <needs escaping> & stays mine.\n\n--\nSent from my reMarkable paper tablet\nGet yours at www.remarkable.com\n\nPS: You cannot reply to this email`;
    const html = emailDraftHtml('email_text', body, []);

    expect(html).toContain('handwritten-publish-email:email_text');
    expect(html).toContain('<p>First paragraph.</p>');
    expect(html).toContain('<p>Second line &lt;needs escaping&gt; &amp; stays mine.</p>');
    expect(html).not.toContain('Sent from my reMarkable paper tablet');
    expect(html).not.toContain('<figure');
  });

  it('puts the edited transcription before original handwritten pages', () => {
    const html = emailDraftHtml(
      'email_combined',
      'My corrected transcription.',
      ['https://cdn.example/page-1.png', 'https://cdn.example/page-2.png'],
    );

    const textPosition = html.indexOf('My corrected transcription.');
    const firstPagePosition = html.indexOf('Handwritten page 1');
    const secondPagePosition = html.indexOf('Handwritten page 2');
    expect(textPosition).toBeGreaterThan(-1);
    expect(firstPagePosition).toBeGreaterThan(textPosition);
    expect(secondPagePosition).toBeGreaterThan(firstPagePosition);
  });
});
