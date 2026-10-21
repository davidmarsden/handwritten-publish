// Micro.blog's YouTube plugin renders `{{< yt VIDEO_ID >}}`. These helpers
// convert YouTube links in a dent to that shortcode at publish time.

const YOUTUBE_URL = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^\s<>()[\]]*|shorts\/[^\s<>()[\]]*|live\/[^\s<>()[\]]*)|youtu\.be\/[^\s<>()[\]]*)/gi;

function videoIdFromUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    let candidate: string | null = null;
    if (host === 'youtu.be') candidate = url.pathname.slice(1).split('/')[0];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') candidate = url.searchParams.get('v');
      else if (/^\/(shorts|live)\//.test(url.pathname)) candidate = url.pathname.split('/')[2];
    }
    return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
  } catch { return null; }
}

export function youtubeVideoId(text: string): string | null {
  for (const match of text.matchAll(YOUTUBE_URL)) {
    const id = videoIdFromUrl(match[0].replace(/[.,!?;:]+$/, ''));
    if (id) return id;
  }
  return null;
}

export function embedYoutubeLinks(text: string): string {
  // Markdown links keep their wording; their videos are embedded after the text.
  const markdownLink = /\[([^\]\n]+)\]\((https?:\/\/[^\s()]+)\)/g;
  const appended: string[] = [];
  for (const match of text.matchAll(markdownLink)) {
    const id = videoIdFromUrl(match[2]);
    if (id && !appended.includes(id)) appended.push(id);
  }

  // Bare links are replaced by the embed where they appear.
  const converted = text.replace(YOUTUBE_URL, (url, offset: number, source: string) => {
    const before = source.slice(0, offset);
    if (/\[[^\]\n]+\]\($/.test(before) && source[offset + url.length] === ')') return url;
    const cleanUrl = url.replace(/[.,!?;:]+$/, '');
    const id = videoIdFromUrl(cleanUrl);
    return id ? `{{< yt ${id} >}}${url.slice(cleanUrl.length)}` : url;
  });

  const embeds = appended
    .filter(id => !converted.includes(`{{< yt ${id} >}}`))
    .map(id => `{{< yt ${id} >}}`);
  return embeds.length ? `${converted}\n\n${embeds.join('\n\n')}` : converted;
}
