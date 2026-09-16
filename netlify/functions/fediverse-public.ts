import { createHash } from 'node:crypto';
import { json } from './_shared/microblog';
import { normalizeMastodonInstance } from './_shared/mastodon-session';
import { boundedPublicFetch } from './_shared/bounded-public-fetch';

export const config = {
  path: '/api/fediverse/public',
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};

type ChannelTarget = {
  origin: string;
  host: string;
  username: string;
  profileUrl: string;
};

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseChannelProfile(value: string): ChannelTarget | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 2 || parts[0] !== 'channel') return null;
    const username = parts[1];
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(username)) return null;
    const origin = normalizeMastodonInstance(url.origin);
    return { origin, host: url.hostname.toLowerCase(), username, profileUrl: `${origin}/channel/${encodeURIComponent(username)}` };
  } catch {
    return null;
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function element(block: string, name: string): string | undefined {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : undefined;
}

function meta(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeXml(match[1]);
  }
  return undefined;
}

function stableId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function parseFeed(xml: string, target: ChannelTarget, avatar?: string) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return blocks.slice(0, 39).flatMap(block => {
    const link = element(block, 'link') || element(block, 'guid');
    const guid = element(block, 'guid') || link;
    if (!guid) return [];
    const content = element(block, 'content:encoded') || element(block, 'description') || element(block, 'title') || '';
    const date = element(block, 'pubDate') || element(block, 'published') || element(block, 'updated');
    const id = `mastodon:${target.host}:fediverse-${stableId(guid)}`;
    return [{
      id,
      url: link,
      content_html: content,
      date_published: date ? new Date(date).toISOString() : undefined,
      author: {
        name: target.username,
        username: `${target.username}@${target.host}`,
        avatar,
        url: target.profileUrl,
      },
      _microblog: {
        source: 'mastodon',
        remote_id: `fediverse-${stableId(guid)}`,
        public_fallback: true,
      },
    }];
  });
}

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  const url = new URL(request.url);
  const profile = cleanText(url.searchParams.get('profile'));
  if (!profile) return json({ error: 'Profile URL is required.' }, 400);
  const target = parseChannelProfile(profile);
  if (!target) return json({ error: 'That is not a supported public Fediverse channel URL.' }, 400);

  try {
    const profilePromise = boundedPublicFetch(
      target.origin,
      `/channel/${encodeURIComponent(target.username)}`,
      { headers: { Accept: 'text/html' } },
      { maxBytes: 512 * 1024, totalTimeoutMs: 8000 },
    ).catch(() => null);
    const feedResponse = await boundedPublicFetch(
      target.origin,
      `/feed/${encodeURIComponent(target.username)}?f=&top=1`,
      { headers: { Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8' } },
      { maxBytes: 2 * 1024 * 1024, totalTimeoutMs: 8000 },
    );
    if (!feedResponse.ok) return json({ error: `Public Fediverse feed request failed (${feedResponse.status}).` }, 502);

    const profileResponse = await profilePromise;
    const html = profileResponse?.ok ? await profileResponse.text() : '';
    const xml = await feedResponse.text();
    const avatar = meta(html, 'og:image');
    const profileName = meta(html, 'og:title')?.replace(/\s+-\s+.*$/, '').trim() || target.username;
    const items = parseFeed(xml, target, avatar).map(item => ({
      ...item,
      author: { ...item.author, name: profileName },
    }));

    return json({
      account: {
        name: profileName,
        username: `${target.username}@${target.host}`,
        ...(avatar ? { avatar } : {}),
        url: target.profileUrl,
      },
      feed: { items },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not load public Fediverse profile.' }, 502);
  }
};
