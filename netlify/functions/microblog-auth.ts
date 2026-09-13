import { json, upstreamError } from './_shared/microblog';
import {
  clearSessionCookie,
  createDentHandSession,
  deleteDentHandSession,
  sessionCookie,
} from './_shared/dent-hand-session';

const AUTH_ENDPOINT = 'https://micro.blog/indieauth/auth';
const TOKEN_ENDPOINT = 'https://micro.blog/indieauth/token';
const STATE_COOKIE = 'dent_hand_oauth_state';
const STATE_TTL_SECONDS = 600;

export const config = {
  path: '/api/microblog/auth',
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) return decodeURIComponent(rawValue.join('='));
  }
  return null;
}

function stateCookie(value: string, request: Request, maxAge = STATE_TTL_SECONDS): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${STATE_COOKIE}=${encodeURIComponent(value)}; HttpOnly${secure}; SameSite=Lax; Path=/api/microblog/auth; Max-Age=${maxAge}`;
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  cookies.forEach(cookie => headers.append('Set-Cookie', cookie));
  return new Response(null, { status: 302, headers });
}

function appUrls(request: Request) {
  const origin = new URL(request.url).origin;
  return {
    clientId: `${origin}/social/`,
    redirectUri: `${origin}/api/microblog/auth`,
    returnTo: `${origin}/social/`,
  };
}

async function start(request: Request): Promise<Response> {
  const state = randomState();
  const { clientId, redirectUri } = appUrls(request);
  const auth = new URL(AUTH_ENDPOINT);
  auth.searchParams.set('client_id', clientId);
  // Dent Hand reads the timeline/profile and can publish, reply, bookmark and
  // otherwise update the authenticated account. Request the corresponding
  // IndieAuth scopes instead of create-only, which Micro.blog rejects for reads.
  auth.searchParams.set('scope', 'profile read create update');
  auth.searchParams.set('state', state);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('redirect_uri', redirectUri);
  return redirect(auth.toString(), [stateCookie(state, request)]);
}

async function callback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const expectedState = cookieValue(request, STATE_COOKIE) || '';
  const code = url.searchParams.get('code') || '';
  const { clientId, redirectUri, returnTo } = appUrls(request);

  if (!state || !expectedState || state !== expectedState || !code) {
    return redirect(`${returnTo}?auth=error`, [stateCookie('', request, 0)]);
  }

  const form = new URLSearchParams({
    code,
    client_id: clientId,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!tokenResponse.ok) {
    console.warn(`[dent-hand] Micro.blog token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}; content-type=${tokenResponse.headers.get('content-type') || 'unknown'}`);
    return upstreamError(tokenResponse, `Micro.blog sign-in failed (${tokenResponse.status}).`);
  }

  const payload = await tokenResponse.json().catch(() => null) as { access_token?: unknown } | null;
  const token = typeof payload?.access_token === 'string' ? payload.access_token.trim() : '';
  if (!token) return json({ error: 'Micro.blog did not return an access token.' }, 502);

  const sessionId = await createDentHandSession(token);
  return redirect(`${returnTo}?auth=connected`, [
    stateCookie('', request, 0),
    sessionCookie(sessionId, request),
  ]);
}

async function logout(request: Request): Promise<Response> {
  try {
    await deleteDentHandSession(request);
  } catch (error) {
    console.warn(`[dent-hand] session cleanup failed during logout: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': clearSessionCookie(request), 'Cache-Control': 'no-store' },
  });
}

export default async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const operation = url.searchParams.get('op');
  if (request.method === 'GET' && operation === 'start') return start(request);
  if (request.method === 'GET' && (operation === 'callback' || (url.searchParams.has('code') && url.searchParams.has('state')))) return callback(request);
  if (request.method === 'POST' && operation === 'logout') return logout(request);
  return json({ error: 'Unsupported Micro.blog authentication operation.' }, 405);
};
