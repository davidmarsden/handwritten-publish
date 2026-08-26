import { afterEach, describe, expect, it, vi } from 'vitest';

const databaseState = vi.hoisted(() => ({
  jobs: new Set<string>(),
}));

vi.mock('@netlify/database', () => {
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    if (query.startsWith('INSERT INTO post_by_email_jobs')) {
      const emailId = String(values[0]);
      if (databaseState.jobs.has(emailId)) return [];
      databaseState.jobs.add(emailId);
      return [{ email_id: emailId }];
    }
    if (query.includes('SET pages =')) return [];
    if (query.includes("SET status = 'completed'")) return [];
    if (query.startsWith('DELETE FROM post_by_email_jobs')) {
      databaseState.jobs.delete(String(values[0]));
      return [];
    }
    throw new Error(`Unexpected test SQL: ${query}`);
  };
  return { getDatabase: vi.fn(() => ({ sql })) };
});

import handler from '../netlify/functions/post-by-email';

const ENV_KEYS = [
  'RESEND_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'POST_BY_EMAIL_ADDRESS',
  'POST_BY_EMAIL_ROUTES',
  'MICROBLOG_EMAIL_TOKEN',
  'MICROBLOG_EMAIL_DESTINATION',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

function configureEnv() {
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_YQ==';
  process.env.RESEND_API_KEY = 're_test';
  process.env.MICROBLOG_EMAIL_TOKEN = 'microblog-token';
  process.env.POST_BY_EMAIL_ROUTES = JSON.stringify({
    'david-test@inbound.resend.app': 'https://david.example/',
    'southall-test@inbound.resend.app': 'https://southall.example/',
  });
  delete process.env.POST_BY_EMAIL_ADDRESS;
  delete process.env.MICROBLOG_EMAIL_DESTINATION;
}

async function signedRequest(recipient: string, emailId: string) {
  const body = JSON.stringify({
    type: 'email.received',
    data: {
      email_id: emailId,
      from: 'my@remarkable.com',
      to: [recipient],
      subject: 'Field notes',
    },
  });
  const id = `msg_${emailId}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = Uint8Array.from(atob('YQ=='), character => character.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, signed));
  let binary = '';
  digest.forEach(value => { binary += String.fromCharCode(value); });

  return new Request('https://handwritten-publish.test/api/post-by-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${btoa(binary)}`,
    },
    body,
  });
}

function successfulFetches() {
  return vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      data: [{
        id: 'attachment_1',
        filename: 'page.png',
        content_type: 'image/png',
        download_url: 'https://inbound-cdn.resend.test/page',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      'media-endpoint': 'https://micro.blog/micropub/media',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    .mockResolvedValueOnce(new Response(null, {
      status: 201,
      headers: { Location: 'https://cdn.uploads.micro.blog/page.png' },
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      url: 'https://example.micro.blog/draft',
      preview: 'https://micro.blog/preview/draft',
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  databaseState.jobs.clear();
  for (const key of ENV_KEYS) {
    const original = originalEnv[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe('post-by-email destination aliases', () => {
  it.each([
    ['david-test@inbound.resend.app', 'https://david.example/'],
    ['southall-test@inbound.resend.app', 'https://southall.example/'],
  ])('routes %s to %s', async (recipient, destination) => {
    configureEnv();
    const fetchMock = successfulFetches();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(await signedRequest(recipient, `email_${destination}`));

    expect(response.status).toBe(200);
    const draftCall = fetchMock.mock.calls[4];
    const draftPayload = JSON.parse(String((draftCall[1] as RequestInit).body));
    expect(draftPayload['mp-destination']).toBe(destination);
    expect(draftPayload.properties['post-status']).toEqual(['draft']);
  });

  it('ignores an address that is not in the route table', async () => {
    configureEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(await signedRequest('unknown@inbound.resend.app', 'email_unknown'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ignored: true, reason: 'unknown posting address' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['[]', 'null', '"not-an-object"', '{"david-test@inbound.resend.app":42}']) (
    'fails closed when POST_BY_EMAIL_ROUTES has the wrong shape: %s',
    async rawRoutes => {
      configureEnv();
      process.env.POST_BY_EMAIL_ROUTES = rawRoutes;
      process.env.POST_BY_EMAIL_ADDRESS = 'legacy@inbound.resend.app';
      process.env.MICROBLOG_EMAIL_DESTINATION = 'https://legacy.example/';
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const response = await handler(await signedRequest('legacy@inbound.resend.app', 'email_invalid_routes'));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: 'Post by email is not configured.' });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
