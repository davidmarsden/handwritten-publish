import { describe, expect, it } from 'vitest';
import {
  emailDraftHtml,
  isRemarkableEmailSubject,
  stripRemarkableEmailFooter,
  titleFromEmailSubject,
} from '../netlify/functions/post-by-email';
import {
  matchExistingCategories,
  parseRemarkablePostMetadata,
  transcriptionFromRemarkableEmail,
} from '../netlify/functions/_shared/remarkable-email';

describe('reMarkable email cleanup', () => {
  it('recognises the reMarkable document subject', () => {
    expect(isRemarkableEmailSubject('Document from my reMarkable: Field notes')).toBe(true);
    expect(isRemarkableEmailSubject('Field notes')).toBe(false);
  });

  it('uses the document filename as the image-only title fallback', () => {
    expect(titleFromEmailSubject('Document from my reMarkable: Field notes')).toBe('Field notes');
  });

  it('leaves ordinary email subjects alone', () => {
    expect(titleFromEmailSubject('Field notes')).toBe('Field notes');
  });

  it('falls back when the reMarkable subject contains no filename', () => {
    expect(titleFromEmailSubject('Document from my reMarkable:   ')).toBe('Handwritten note');
  });

  it('strips the standard reMarkable footer only from the end of a plain-text body', () => {
    const body = `A useful note.\n\n--\nSent from my reMarkable paper tablet\nGet yours at www.remarkable.com\n\nPS: You cannot reply to this email`;
    expect(stripRemarkableEmailFooter(body)).toBe('A useful note.');
  });

  it('leaves unrelated body text untouched', () => {
    expect(stripRemarkableEmailFooter('A useful note.')).toBe('A useful note.');
  });

  it('extracts clean paragraphs from reMarkable HTML instead of email hard-wraps', () => {
    const transcription = transcriptionFromRemarkableEmail({
      text: 'A useful bonus feature of handwritten-publish is that if I use the built-in\ntranscription, it works.',
      html: '<!DOCTYPE html><html><body><p>A useful bonus feature of handwritten-publish is that if I use the built-in transcription, it works.</p><p>How cool is that?!</p></body></html><br><br>--<br>Sent from my reMarkable paper tablet',
    });

    expect(transcription).toBe('A useful bonus feature of handwritten-publish is that if I use the built-in transcription, it works.\n\nHow cool is that?!');
  });

  it('falls back to plain text when no usable HTML body is present', () => {
    expect(transcriptionFromRemarkableEmail({ text: 'Plain transcription.', html: null }))
      .toBe('Plain transcription.');
  });

  it('parses an explicit title and categories from a handwriting-friendly metadata block', () => {
    expect(parseRemarkablePostMetadata(`Title: A proper long-post title\nCategories: reMarkable, micropost\n\nThis is the actual post.`)).toEqual({
      title: 'A proper long-post title',
      requestedCategories: ['reMarkable', 'micropost'],
      body: 'This is the actual post.',
    });
  });

  it('treats leading hashtags as categories and removes them from the post body', () => {
    expect(parseRemarkablePostMetadata(`#reMarkable #micropost\n\nHow cool is that?!`)).toEqual({
      title: null,
      requestedCategories: ['reMarkable', 'micropost'],
      body: 'How cool is that?!',
    });
  });

  it('leaves a text post untitled when no Title field is present', () => {
    expect(parseRemarkablePostMetadata('A short micropost from the Blog notebook.')).toEqual({
      title: null,
      requestedCategories: [],
      body: 'A short micropost from the Blog notebook.',
    });
  });

  it('matches requested categories case-insensitively without inventing categories', () => {
    expect(matchExistingCategories(
      ['remarkable', 'MICROPOST', 'does-not-exist'],
      ['reMarkable', 'Micropost', 'Notes'],
    )).toEqual(['reMarkable', 'Micropost']);
  });

  it('creates a text-only draft body from edited transcription', () => {
    const html = emailDraftHtml('email_text', 'First paragraph.\n\nSecond line <needs escaping> & stays mine.', []);

    expect(html).toContain('handwritten-publish-email:email_text');
    expect(html).toContain('<p>First paragraph.</p>');
    expect(html).toContain('<p>Second line &lt;needs escaping&gt; &amp; stays mine.</p>');
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
