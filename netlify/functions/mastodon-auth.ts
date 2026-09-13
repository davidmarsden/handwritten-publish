import { json } from './_shared/microblog';
import {
  clearMastodonSessionCookie,
  consumeMastodonOAuthState,
  createMastodonOAuthState,
  createMastodonSession,
  mastodonApp,
  mastodonFetch,
  mastodonSessionCookie,
  normalizeMastodonInstance,
  saveMastodonApp,
  deleteMastodonSession,
} from './_shared/mastodon-session';

const STATE_COOKIE = 'dent_hand_mastodon_oauth_state';
const STATE_TTL_SECONDS = 600;
const SCOPES = 'read';

export const config = {
  path: '/api/mastodon/auth',
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};

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
  return `${STATE_COOKIE}=${encodeURIComponent(value)}; HttpOnly${secure}; SameSite=Lax; Path=/api/mastodon/auth; Max-Age=${maxAge}`;
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  cookies.forEach(cookie => headers.append('Set-Cookie', cookie));
  return new Response(null, { status: 302, headers });
}

function appUrls(request: Request) {
  const origin = new URL(request.url).origin;
  return {
    origin,
    redirectUri: `${origin}/api/mastodon/auth`,
    returnTo: `${origin}/social/`,
    website: `${origin}/social/`,
  };
}

async function getOrCreateApp(instanceOrigin: string, request: Request): Promise<{ clientId: string; clientSecret: string }> {
  const { origin, redirectUri, website } = appUrls(request);
  const existing = await mastodonApp(instanceOrigin, origin);
  if (existing) return existing;

  const response = await mastodonFetch(instanceOrigin, '/api/v1/apps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Dent Hand',
      redirect_uris: [redirectUri],
      scopes: SCOPES,
      website,
    }),
  });
  if (!response.ok) throw new Error(`Could not register Dent Hand with that server (${response.status}).`);
  const payload = await response.json().catch(() => null) as { client_id?: unknown; client_secret?: unknown } | null;
  const clientId = typeof payload?.client_id === 'string' ? payload.client_id.trim() : '';
  const clientSecret = typeof payload?.client_secret === 'string' ? payload.client_secret.trim() : '';
  if (!clientId || !clientSecret) throw new Error('That server did not return OAuth application credentials.');
  await saveMastodonApp(instanceOrigin, origin, clientId, clientSecret);
  return { clientId, clientSecret };
}

async function start(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let instanceOrigin: string;
  try {
    instanceOrigin = normalizeMastodonInstance(url.searchParams.get('instance') || '');
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid Mastodon server.' }, 400);
  }

  try {
    const app = await getOrCreateApp(instanceOrigin, request);
    const { origin, redirectUri } = appUrls(request);
    const state = await createMastodonOAuthState(instanceOrigin, origin);
    const auth = new URL('/oauth/authorize', instanceOrigin);
    auth.searchParams.set('client_id', app.clientId);
    auth.searchParams.set('scope', SCOPES);
    auth.searchParams.set('state', state);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('redirect_uri', redirectUri);
    return redirect(auth.toString(), [stateCookie(state, request)]);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not connect to that Mastodon server.' }, 502);
  }
}

async function callback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const expectedState = cookieValue(request, STATE_COOKIE) || '';
  const code = url.searchParams.get('code') || '';
  const { origin, redirectUri, returnTo } = appUrls(request);

  if (!state || !expectedState || state !== expectedState || !code) {
    return redirect(`${returnTo}?auth=error&provider=mastodon`, [stateCookie('', request, 0)]);
  }

  const oauthState = await consumeMastodonOAuthState(state);
  if (!oauthState || oauthState.redirectOrigin !== origin) {
    return redirect(`${returnTo}?auth=error&provider=mastodon`, [stateCookie('', request, 0)]);
  }
  const { instanceOrigin } = oauthState;

  try {
    const app = await mastodonApp(instanceOrigin, origin);
    if (!app) throw new Error('Dent Hand no longer has OAuth credentials for that server and callback origin.');

    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: redirectUri,
      scope: SCOPES,
    });
    const tokenResponse = await mastodonFetch(instanceOrigin, '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!tokenResponse.ok) throw new Error(`Mastodon sign-in failed (${tokenResponse.status}).`);
    const payload = await tokenResponse.json().catch(() => null) as { access_token?: unknown } | null;
    const token = typeof payload?.access_token === 'string' ? payload.access_token.trim() : '';
    if (!token) throw new Error('That server did not return an access token.');

    const verify = await mastodonFetch(instanceOrigin, '/api/v1/accounts/verify_credentials', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!verify.ok) throw new Error(`Mastodon account verification failed (${verify.status}).`);

    const sessionId = await createMastodonSession(instanceOrigin, token);
    return redirect(`${returnTo}?auth=connected&provider=mastodon`, [
      stateCookie('', request, 0),
      mastodonSessionCookie(sessionId, request),
    ]);
  } catch (error) {
    console.warn(`[dent-hand] Mastodon OAuth callback failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    return redirect(`${returnTo}?auth=error&provider=mastodon`, [stateCookie('', request, 0)]);
  }
}

async function logout(request: Request): Promise<Response> {
  try {
    await deleteMastodonSession(request);
  } catch (error) {
    console.warn(`[dent-hand] Mastodon session cleanup failed during logout: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': clearMastodonSessionCookie(request), 'Cache-Control': 'no-store' },
  });
}

export default async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const operation = url.searchParams.get('op');
  if (request.method === 'GET' && operation === 'start') return start(request);
  if (request.method === 'GET' && (operation === 'callback' || (url.searchParams.has('code') && url.searchParams.has('state')))) return callback(request);
  if (request.method === 'POST' && operation === 'logout') return logout(request);
  return json({ error: 'Unsupported Mastodon authentication operation.' }, 405);
};
