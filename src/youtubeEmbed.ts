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
  // Replace complete Markdown links, not just the URL inside their delimiters.
  const markdownLink = /\[([^\]\n]+)\]\((https?:\/\/[^\s()]+)\)/g;
  const converted = text.replace(markdownLink, (original, _label: string, url: string) => {
    const id = videoIdFromUrl(url);
    return id ? `{{< yt ${id} >}}` : original;
  });
  return converted.replace(YOUTUBE_URL, (url, offset: number, source: string) => {
    // Do not rewrite a URL embedded in a Markdown link that was not convertible.
    const before = source.slice(0, offset);
    if (/\[[^\]\n]+\]\($/.test(before) && source[offset + url.length] === ')') return url;
    const cleanUrl = url.replace(/[.,!?;:]+$/, '');
    const id = videoIdFromUrl(cleanUrl);
    return id ? `{{< yt ${id} >}}${url.slice(cleanUrl.length)}` : url;
  });
}
