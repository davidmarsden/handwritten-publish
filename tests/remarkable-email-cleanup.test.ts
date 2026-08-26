import { describe, expect, it } from 'vitest';
import { stripRemarkableEmailFooter, titleFromEmailSubject } from '../netlify/functions/post-by-email';

describe('reMarkable email cleanup', () => {
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
});
