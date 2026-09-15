import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, { southallDraftMarkdown } from '../netlify/functions/southall-research-by-email';

const ENV_KEYS = [
  'SOUTHALL_RESEARCH_RESEND_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'SOUTHALL_RESEARCH_GITHUB_TOKEN',
  'SOUTHALL_RESEARCH_EMAIL_ADDRESS',
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

function configureEnv() {
  process.env.SOUTHALL_RESEARCH_RESEND_WEBHOOK_SECRET = 'whsec_YQ==';
  process.env.RESEND_API_KEY = 're_test';
  process.env.SOUTHALL_RESEARCH_GITHUB_TOKEN = 'github-token';
  process.env.SOUTHALL_RESEARCH_EMAIL_ADDRESS = 'southall-private@inbound.resend.app';
}

async function signedRequest(options: {
  recipient?: string;
  emailId?: string;
  subject?: string;
} = {}) {
  const emailId = options.emailId ?? 'email_abc123456789';
  const body = JSON.stringify({
    type: 'email.received',
    data: {
      email_id: emailId,
      from: 'my@remarkable.com',
      to: [options.recipient ?? 'southall-private@inbound.resend.app'],
      subject: options.subject ?? 'Document from my reMarkable: Southall notebook',
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

  return new Request('https://hand.example/api/southall-research/by-email', {
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

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    const original = originalEnv[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe('Southall Research post by email', () => {
  it('turns reMarkable transcription into a private newsroom draft', async () => {
    configureEnv();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        text: 'Title: The Council Knew\nCategories: Investigations, Local Democracy\nStatus: published\n\nThis is the article body.\n\n--\nSent from my reMarkable paper tablet\nGet yours at www.remarkable.com\n\nPS: You cannot reply to this email',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        content: {
          path: 'drafts/the-council-knew-abc123456789.md',
          html_url: 'https://github.com/davidmarsden/Southall-Research/blob/main/drafts/the-council-knew-abc123456789.md',
        },
        commit: { html_url: 'https://github.com/davidmarsden/Southall-Research/commit/123' },
      }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(await signedRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      saved: true,
      updated: false,
      status: 'draft',
      path: 'drafts/the-council-knew-abc123456789.md',
    });

    const writeCall = fetchMock.mock.calls[2];
    expect(String(writeCall[0])).toContain('/davidmarsden/Southall-Research/contents/drafts/the-council-knew-abc123456789.md');
    const payload = JSON.parse(String((writeCall[1] as RequestInit).body));
    const markdown = Buffer.from(payload.content, 'base64').toString('utf8');
    expect(markdown).toContain('title: "The Council Knew"');
    expect(markdown).toContain('  - "Investigations"');
    expect(markdown).toContain('  - "Local Democracy"');
    expect(markdown).toContain('review_complete: false');
    expect(markdown).toContain('# The Council Knew');
    expect(markdown).toContain('This is the article body.');
    expect(markdown).not.toContain('Status: published');
  });

  it('ignores messages sent to another inbound alias', async () => {
    configureEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(await signedRequest({ recipient: 'other@inbound.resend.app' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ignored: true, reason: 'unknown posting address' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores ordinary mail even when it reaches the private alias', async () => {
    configureEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(await signedRequest({ subject: 'Hello Southall' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ignored: true, reason: 'not a reMarkable send-by-email message' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses a deterministic filename so a webhook retry updates the same file', async () => {
    configureEnv();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        text: 'Title: Retry Test\n\nSame email, same draft.',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'existing-sha' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        content: { path: 'drafts/retry-test-abc123456789.md' },
        commit: {},
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(await signedRequest());

    await expect(response.json()).resolves.toMatchObject({ saved: true, updated: true });
    const payload = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(payload.sha).toBe('existing-sha');
  });
});

describe('southallDraftMarkdown', () => {
  it('deduplicates categories and produces publication-compatible front matter', () => {
    const markdown = southallDraftMarkdown(
      'email-1',
      'A title',
      'Body',
      ['Community', 'community', 'Investigations'],
      new Date('2026-09-15T12:00:00Z'),
    );

    expect(markdown).toContain('date: 2026-09-15');
    expect(markdown.match(/Community/g)).toHaveLength(1);
    expect(markdown).toContain('review_complete: false');
    expect(markdown).toContain('helping_hand_email_id: "email-1"');
  });
});
