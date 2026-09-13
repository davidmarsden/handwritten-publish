import { bearer, json, MICROPUB_ENDPOINT } from './_shared/microblog';
import { dentHandSessionToken } from './_shared/dent-hand-session';

const API_ROOT = 'https://micro.blog';

export const config = {
  path: '/api/microblog/diagnostics',
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};

type VerifyPayload = {
  token?: unknown;
  scope?: unknown;
  username?: unknown;
  name?: unknown;
  url?: unknown;
  default_site?: unknown;
  [key: string]: unknown;
};

function safeSnippet(value: string): string | null {
  const clean = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.slice(0, 180);
}

async function responseSummary(response: Response) {
  const contentType = response.headers.get('content-type') || 'unknown';
  const text = await response.clone().text().catch(() => '');
  return {
    status: response.status,
    content_type: contentType,
    body_preview: safeSnippet(text),
  };
}

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);

  const token = await dentHandSessionToken(request);
  if (!token) return json({ error: 'Connect Dent Hand to Micro.blog first.' }, 401);

  const verifyForm = new URLSearchParams({ token });
  const verifyResponse = await fetch(`${API_ROOT}/account/verify`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      ...bearer(token),
    },
    body: verifyForm.toString(),
  });

  let verifyPayload: VerifyPayload | null = null;
  if (verifyResponse.ok) {
    verifyPayload = await verifyResponse.clone().json().catch(() => null) as VerifyPayload | null;
  }

  const replacementToken = typeof verifyPayload?.token === 'string' ? verifyPayload.token.trim() : '';
  const effectiveToken = replacementToken || token;

  const timelineResponse = await fetch(`${API_ROOT}/posts/timeline?count=1`, {
    headers: { Accept: 'application/json', ...bearer(effectiveToken) },
  });

  const micropubConfigUrl = new URL(MICROPUB_ENDPOINT);
  micropubConfigUrl.searchParams.set('q', 'config');
  const micropubResponse = await fetch(micropubConfigUrl, {
    headers: { Accept: 'application/json', ...bearer(effectiveToken) },
  });

  const verify = await responseSummary(verifyResponse);
  const timeline = await responseSummary(timelineResponse);
  const micropub = await responseSummary(micropubResponse);

  // Never return bearer tokens. Only expose status codes and non-secret metadata
  // needed to diagnose Micro.blog's 403 response.
  return json({
    verify: {
      ...verify,
      token_replaced: Boolean(replacementToken && replacementToken !== token),
      scope: typeof verifyPayload?.scope === 'string' ? verifyPayload.scope : null,
      username: typeof verifyPayload?.username === 'string' ? verifyPayload.username : null,
      fields: verifyPayload ? Object.keys(verifyPayload).filter(key => key !== 'token').sort() : [],
    },
    timeline,
    micropub_config: micropub,
  });
};
