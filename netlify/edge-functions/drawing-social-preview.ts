import type { Config, Context } from '@netlify/edge-functions';

const fallbackImage = '/.netlify/images?url=/brand/drawing-hand-og.svg&w=1200&h=630&fit=fill&fm=png';

function absolute(origin: string, path: string) {
  return new URL(path, origin).toString();
}

function escapeAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export default async (request: Request, context: Context) => {
  const response = await context.next();
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return response;

  try {
    const apiUrl = new URL('/api/drawing-challenges', request.url);
    const challengesResponse = await fetch(apiUrl, { headers: { accept: 'application/json' } });
    if (!challengesResponse.ok) return response;

    const payload = await challengesResponse.json() as {
      challenges?: Array<{ title: string; imageUrl: string }>;
      challenge?: { title: string; imageUrl: string } | null;
    };
    const newest = payload.challenges?.[0] ?? payload.challenge ?? null;
    if (!newest) return response;

    const html = await response.text();
    const origin = new URL(request.url).origin;
    const challengeImage = absolute(origin, newest.imageUrl);
    const image = absolute(origin, `/.netlify/images?url=${encodeURIComponent(challengeImage)}&w=1200&h=630&fit=contain&fm=jpg&q=85`);
    const title = `Drawing Hand — ${newest.title}`;
    const description = `Elijah's newest drawing challenge: ${newest.title}. Draw your version, send it in, and get graded.`;

    const replacements: Array<[RegExp, string]> = [
      [/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeAttribute(title)}" />`],
      [/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escapeAttribute(description)}" />`],
      [/<meta property="og:image" content="[^"]*"\s*\/>/, `<meta property="og:image" content="${escapeAttribute(image)}" />`],
      [/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${escapeAttribute(title)}" />`],
      [/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${escapeAttribute(description)}" />`],
      [/<meta name="twitter:image" content="[^"]*"\s*\/>/, `<meta name="twitter:image" content="${escapeAttribute(image)}" />`],
    ];
    let rewritten = html;
    for (const [pattern, replacement] of replacements) rewritten = rewritten.replace(pattern, replacement);

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(rewritten, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
};

export const config: Config = {
  path: ['/drawing', '/drawing/'],
};
