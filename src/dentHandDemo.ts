import type { MicroblogItem } from './microblogSocial';

// Demo mode lets Dent Hand be exercised on deploy previews without signing in
// to Micro.blog (whose sign-in only works on the production origin). It serves
// canned data and never publishes anything.

export type DemoPost = { content: string; destination?: string; replyTo?: string };

export function demoModeAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
  // Netlify deploy previews and branch deploys: <context>--<site>.netlify.app
  return /^[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(host);
}

export function demoModeRequested(location: Pick<Location, 'hostname' | 'search'>): boolean {
  return demoModeAllowed(location.hostname) && new URLSearchParams(location.search).get('demo') === '1';
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const DEMO_ITEMS: MicroblogItem[] = [
  {
    id: '9000001',
    url: 'https://micro.blog/demo/9000001',
    content_html: '<p>Demo dent: nothing on this page talks to Micro.blog. Try <strong>New dent</strong> with a YouTube link.</p>',
    date_published: minutesAgo(3),
    author: { name: 'Dent Hand demo', username: 'demo', url: 'https://micro.blog/demo' },
    _microblog: { date_relative: '3m' },
  },
  {
    id: '9000002',
    url: 'https://streams.example/item/abc',
    content_html: '<p>A Fediverse author followed through Micro.blog.</p>',
    date_published: minutesAgo(25),
    author: { name: 'elmussol', username: 'elmussol@streams.example', url: 'https://streams.example/channel/elmussol' },
    _microblog: { date_relative: '25m' },
  },
  {
    id: '9000003',
    url: 'https://micro.blog/sample/9000003',
    content_html: '<p>Listening to this again: <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">https://www.youtube.com/watch?v=dQw4w9WgXcQ</a></p>',
    date_published: minutesAgo(90),
    author: { name: 'Sample person', username: 'sample', url: 'https://micro.blog/sample' },
    _microblog: { date_relative: '1h' },
  },
];

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

async function requestBody(init?: RequestInit): Promise<Record<string, unknown>> {
  if (typeof init?.body !== 'string') return {};
  try { return JSON.parse(init.body) as Record<string, unknown>; } catch { return {}; }
}

export function createDemoFetch(onPost: (post: DemoPost) => void = () => undefined): typeof fetch {
  const bookmarks = new Set<string>();
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url, 'https://demo.invalid');
    if (url.pathname !== '/api/microblog/social') return jsonResponse({ error: 'Not available in demo mode.' }, 404);
    const op = url.searchParams.get('op');
    const withBookmarks = (items: MicroblogItem[]) => items.map(item => ({
      ...item,
      _microblog: { ...(item._microblog || {}), is_bookmark: bookmarks.has(item.id) },
    }));
    // Every feed is a single page so "load older" ends immediately.
    const page = (items: MicroblogItem[]) => jsonResponse({ items: url.searchParams.has('before_id') || url.searchParams.has('since_id') ? [] : withBookmarks(items) });

    switch (op) {
      case 'account': return jsonResponse({ name: 'Demo account', username: 'demo' });
      case 'destinations': return jsonResponse({ destinations: [{ uid: 'https://demo.example/', name: 'demo.example (not published)' }] });
      case 'timeline': return page(DEMO_ITEMS);
      case 'bookmarks': return page(DEMO_ITEMS.filter(item => bookmarks.has(item.id)));
      case 'mentions': return page(DEMO_ITEMS.slice(1, 2));
      case 'replies': return page([]);
      case 'profile': return page(DEMO_ITEMS.filter(item => item.author?.username === url.searchParams.get('username')));
      case 'conversation': return page(DEMO_ITEMS.filter(item => item.id === url.searchParams.get('id')));
      case 'bookmark': {
        const body = await requestBody(init);
        if (typeof body.id === 'string') bookmarks.add(body.id);
        return jsonResponse({ ok: true });
      }
      case 'unbookmark': bookmarks.delete(url.searchParams.get('id') || ''); return jsonResponse({ ok: true });
      case 'micropost': {
        const body = await requestBody(init);
        onPost({ content: String(body.content || ''), destination: String(body.destination || '') });
        return jsonResponse({ ok: true, url: null });
      }
      case 'reply': {
        const body = await requestBody(init);
        onPost({ content: String(body.content || ''), replyTo: String(body.id || '') });
        return jsonResponse({ ok: true });
      }
      default: return jsonResponse({ error: 'Not available in demo mode.' }, 404);
    }
  };
}
