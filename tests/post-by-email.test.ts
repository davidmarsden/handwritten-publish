import { afterEach, describe, expect, it, vi } from 'vitest';

type TestJob = {
  email_id: string;
  status: 'processing' | 'completed';
  started_at: Date;
  pages: number | null;
  url: string | null;
  preview: string | null;
  completed_at?: Date | null;
};

const databaseState = vi.hoisted(() => ({
  jobs: new Map<string, TestJob>(),
  failCompletionWrite: false,
}));

vi.mock('@netlify/database', () => {
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join(' ? ').replace(/\s+/g, ' ').trim();

    if (query.startsWith('INSERT INTO post_by_email_jobs')) {
      const emailId = String(values[0]);
      if (databaseState.jobs.has(emailId)) return [];
      databaseState.jobs.set(emailId, {
        email_id: emailId,
        status: 'processing',
        started_at: new Date(),
        pages: null,
        url: null,
        preview: null,
        completed_at: null,
      });
      return [{ email_id: emailId }];
    }

    if (query.startsWith('SELECT email_id, status, started_at')) {
      const emailId = String(values[0]);
      const job = databaseState.jobs.get(emailId);
      return job ? [{ ...job }] : [];
    }

    if (query.startsWith('UPDATE post_by_email_jobs SET started_at = NOW()')) {
      const emailId = String(values[0]);
      const expectedStartedAt = new Date(values[1] as string | number | Date).getTime();
      const job = databaseState.jobs.get(emailId);
      if (!job || job.status !== 'processing' || job.started_at.getTime() !== expectedStartedAt) return [];
      job.started_at = new Date();
      job.pages = null;
      job.url = null;
      job.preview = null;
      job.completed_at = null;
      return [{ email_id: emailId }];
    }

    if (query.startsWith('DELETE FROM post_by_email_jobs')) {
      const emailId = String(values[0]);
      const job = databaseState.jobs.get(emailId);
      if (job?.status === 'processing') databaseState.jobs.delete(emailId);
      return [];
    }

    if (query.includes('SET pages =') && !query.includes("status = 'completed'")) {
      const pages = Number(values[0]);
      const emailId = String(values[1]);
      const job = databaseState.jobs.get(emailId);
      if (job?.status === 'processing') job.pages = pages;
      return [];
    }

    if (query.includes("SET status = 'completed'")) {
      if (databaseState.failCompletionWrite) throw new Error('simulated completion persistence failure');
      const pages = Number(values[0]);
      const url = String(values[1]);
      const preview = String(values[2]);
      const emailId = String(values[3]);
      const job = databaseState.jobs.get(emailId);
      if (job?.status === 'processing') {
        job.status = 'completed';
        job.pages = pages;
        job.url = url;
        job.preview = preview;
        job.completed_at = new Date();
      }
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

function receivedEvent(emailId = 'email_123') {
  return {
    type: 'email.received',
    data: {
      email_id: emailId,
      from: 'my@remarkable.com',
      to: ['secret@inbound.resend.app'],
      subject: 'Field notes',
      attachments: [{ id: 'attachment_1', filename: 'field-notes-1.png', content_type: 'image/png' }],
    },
  };
}

function processingJob(emailId = 'email_123', startedAt = new Date()): TestJob {
  return {
    email_id: emailId,
    status: 'processing',
    started_at: startedAt,
    pages: null,
    url: null,
    preview: null,
    completed_at: null,
  };
}

function successfulUpstreamFetches() {
  return vi.fn()
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
}

afterEach(() => {
  vi.unstubAllGlobals();
  databaseState.jobs.clear();
  databaseState.failCompletionWrite = false;
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
    const response = await handler(await signedRequest(receivedEvent('email_stale'), {}, staleTimestamp));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores mail sent to an old or unknown posting alias', async () => {
    configureEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const request = await signedRequest({
      ...receivedEvent(),
      data: { ...receivedEvent().data, to: ['old-secret@inbound.resend.app'] },
    });
    const response = await handler(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ignored: true, reason: 'unknown posting address' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the original draft without upstream work when the email was already completed', async () => {
    configureEnv();
    databaseState.jobs.set('email_123', {
      ...processingJob(),
      status: 'completed',
      pages: 2,
      url: 'https://example.micro.blog/draft/original',
      preview: 'https://micro.blog/preview/original',
      completed_at: new Date(),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(await signedRequest(receivedEvent()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      created: false,
      duplicate: true,
      pages: 2,
      url: 'https://example.micro.blog/draft/original',
      preview: 'https://micro.blog/preview/original',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('atomically refuses a second worker while the same email is being processed', async () => {
    configureEnv();
    databaseState.jobs.set('email_123', processingJob());
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(await signedRequest(receivedEvent()));

    expect(response.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reconciles a stale processing job when Micro.blog already contains its email marker', async () => {
    configureEnv();
    const stale = processingJob('email_123', new Date(Date.now() - 11 * 60 * 1000));
    stale.pages = 1;
    databaseState.jobs.set('email_123', stale);
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      items: [{
        url: 'https://example.micro.blog/draft/recovered',
        properties: {
          content: [{ html: '<!-- handwritten-publish-email:email_123 -->' }],
        },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(await signedRequest(receivedEvent()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      created: false,
      duplicate: true,
      reconciled: true,
      pages: 1,
      url: 'https://example.micro.blog/draft/recovered',
      preview: 'https://example.micro.blog/draft/recovered',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(databaseState.jobs.get('email_123')).toMatchObject({
      status: 'completed',
      pages: 1,
      url: 'https://example.micro.blog/draft/recovered',
    });
  });

  it('turns ordered PNG attachments into a private Micro.blog draft and records completion', async () => {
    configureEnv();
    const fetchMock = successfulUpstreamFetches();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(await signedRequest(receivedEvent()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      created: true,
      pages: 1,
      url: 'https://example.micro.blog/2026/08/26/field-notes.html',
      preview: 'https://micro.blog/preview/field-notes',
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    const draftCall = fetchMock.mock.calls[4];
    expect(draftCall[0]).toBe('https://micro.blog/micropub');
    const draftPayload = JSON.parse(String((draftCall[1] as RequestInit).body));
    expect(draftPayload.properties['post-status']).toEqual(['draft']);
    expect(draftPayload.properties.content[0].html).toContain('handwritten-publish-email:email_123');
    expect(databaseState.jobs.get('email_123')).toMatchObject({
      status: 'completed',
      pages: 1,
      url: 'https://example.micro.blog/2026/08/26/field-notes.html',
      preview: 'https://micro.blog/preview/field-notes',
    });
  });

  it('does not clear the job when completion persistence fails after Micro.blog created the draft', async () => {
    configureEnv();
    databaseState.failCompletionWrite = true;
    const fetchMock = successfulUpstreamFetches();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(await signedRequest(receivedEvent()));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      created: true,
      persistence: 'pending',
      pages: 1,
      url: 'https://example.micro.blog/2026/08/26/field-notes.html',
    });
    expect(databaseState.jobs.get('email_123')).toMatchObject({
      status: 'processing',
      pages: 1,
    });
  });
});
