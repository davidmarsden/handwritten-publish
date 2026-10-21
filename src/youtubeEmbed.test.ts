import { describe, expect, it } from 'vitest';
import { embedYoutubeLinks, youtubeVideoId } from './youtubeEmbed';

const ID = 'dQw4w9WgXcQ';

describe('YouTube shortcode embedding', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?feature=share&v=${ID}&t=42`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}?si=abc123`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}`,
  ])('converts %s', url => {
    expect(youtubeVideoId(`Look: ${url}`)).toBe(ID);
    expect(embedYoutubeLinks(`Look: ${url}`)).toBe(`Look: {{< yt ${ID} >}}`);
  });

  it('keeps surrounding punctuation and brackets', () => {
    expect(embedYoutubeLinks(`Watch https://youtu.be/${ID}.`)).toBe(`Watch {{< yt ${ID} >}}.`);
    expect(embedYoutubeLinks(`(https://www.youtube.com/watch?v=${ID}&t=42)`)).toBe(`({{< yt ${ID} >}})`);
  });

  it('uses the v parameter rather than a lookalike', () => {
    expect(youtubeVideoId(`https://www.youtube.com/watch?rv=AAAAAAAAAAA&v=${ID}`)).toBe(ID);
  });

  it('replaces whole Markdown links to YouTube and leaves other links alone', () => {
    expect(embedYoutubeLinks(`See [this](https://youtu.be/${ID}) now`)).toBe(`See {{< yt ${ID} >}} now`);
    const other = 'See [this](https://example.com/page) now';
    expect(embedYoutubeLinks(other)).toBe(other);
  });

  it('ignores non-YouTube and malformed links', () => {
    expect(youtubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeVideoId(`https://youtu.be/${ID}extra`)).toBeNull();
  });

  it('converts multiple links', () => {
    expect(embedYoutubeLinks(`https://youtu.be/${ID} and https://youtu.be/AAAAAAAAAAA`))
      .toBe(`{{< yt ${ID} >}} and {{< yt AAAAAAAAAAA >}}`);
  });
});
