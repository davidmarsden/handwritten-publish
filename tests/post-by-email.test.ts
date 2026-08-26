import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../netlify/functions/post-by-email';

const ENV_KEYS = [
  'RESEND_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'POST_BY_EMAIL_ADDRESS',
  'MICROBLOG_EMAIL_TOKEN',
  'MICROBLOG_EMAIL_DESTINATION',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

function configureEnv() {
  // Deliberately tiny synthetic key so secret scanners do not mistake this test fixture for a credential.
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_YQ==';
  process.env.RESEND_API_KEY = 're_test';
  process.env.POST_BY_EMAIL_ADDRESS = 'secret@inbound.resend.app';
  process.env.MICROBLOG_EMAIL_TOKEN = 'microblog-token';
  process.env.MICROBLOG_EMAIL_DESTINATION = 'https://example.micro.blog/';
}

async function signedRequest(
  payload: object,
  overrides: Record<string, string> = {},
  timestamp = String(Math.floor(Date.now() / 1000)),
) {
  const body = JSON.stringify(payload);
  const id = 'msg_test';
  const secret = Uint8Array.from(atob('YQ=='), character => character.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, signed));
  let binary = '';
  digest.forEach(value => { binary += String.fromCharCode(value); });
  const signature = btoa(binary);

  return new Request('https://handwritten-publish.test/api/post-by-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
      ...overrides,
    },
    body,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    const original = originalEnv[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe('post by email', () => {
  it('rejects an unsigned webhook before touching upstream services', async () => {
    configureEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(new Request('https://handwritten-publish.test/api/post-by-email', {
      method: 'POST',
      body: JSON.stringify({ type: 'email.received' }),
    }));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a correctly signed webhook outside the replay window', async () => {
    configureEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const staleTimestamp = String(Math.floor(Date.now() / 1000) - (10 * 60));
    const request = await signedRequest({
      type: 'email.received',
      data: {
        email_id: 'email_stale',
        to: ['secret@inbound.resend.app'],
        subject: 'Replay attempt',
      },
    }, {}, staleTimestamp);
    const response = await handler(request);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores mail sent to an old or unknown posting alias', async () => {
    configureEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const request = await signedRequest({
      type: 'email.received',
      data: {
        email_id: 'email_123',
        to: ['old-secret@inbound.resend.app'],
        subject: 'Field notes',
      },
    });
    const response = await handler(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ignored: true, reason: 'unknown posting address' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns ordered PNG attachments into a private Micro.blog draft', async () => {
    configureEnv();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          id: 'attachment_1',
          filename: 'field-notes-1.png',
          size: 4,
          content_type: 'image/png',
          download_url: 'https://inbound-cdn.resend.test/attachment_1',
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        'media-endpoint': 'https://micro.blog/micropub/media',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 201,
        headers: { Location: 'https://cdn.uploads.micro.blog/field-notes-1.png' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        url: 'https://example.micro.blog/2026/08/26/field-notes.html',
        preview: 'https://micro.blog/preview/field-notes',
      }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const request = await signedRequest({
      type: 'email.received',
      data: {
        email_id: 'email_123',
        from: 'my@remarkable.com',
        to: ['secret@inbound.resend.app'],
        subject: 'Field notes',
        attachments: [{ id: 'attachment_1', filename: 'field-notes-1.png', content_type: 'image/png' }],
      },
    });
    const response = await handler(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      created: true,
      pages: 1,
      url: 'https://example.micro.blog/2026/08/26/field-notes.html',
      preview: 'https://micro.blog/preview/field-notes',
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/emails/receiving/email_123/attachments');

    const draftCall = fetchMock.mock.calls[4];
    expect(draftCall[0]).toBe('https://micro.blog/micropub');
    const draftPayload = JSON.parse(String((draftCall[1] as RequestInit).body));
    expect(draftPayload['mp-destination']).toBe('https://example.micro.blog/');
    expect(draftPayload.properties.name).toEqual(['Field notes']);
    expect(draftPayload.properties['post-status']).toEqual(['draft']);
    expect(draftPayload.properties.content[0].html).toContain('https://cdn.uploads.micro.blog/field-notes-1.png');
    expect(draftPayload.properties.content[0].html).toContain('handwritten-publish-email:email_123');
  });
});
