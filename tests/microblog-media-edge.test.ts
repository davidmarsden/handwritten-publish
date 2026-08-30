import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../netlify/edge-functions/microblog-media';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Micro.blog streamed media edge proxy', () => {
  it.each([
    ['audio/mpeg', 'song.mp3', 'https://example.micro.blog/uploads/song.mp3'],
    ['application/pdf', 'annual-report.pdf', 'https://example.micro.blog/uploads/annual-report.pdf'],
  ])('streams %s uploads to the Micro.blog media endpoint', async (contentType, filename, location) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', {
      status: 202,
      headers: { Location: location },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const response = await handler(new Request('https://hand.example/api/microblog/stream-media', {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
        'X-Microblog-Token': 'token',
        'X-Microblog-Media-Endpoint': encodeURIComponent('https://micro.blog/micropub/media'),
        'X-Microblog-Destination': encodeURIComponent('https://example.micro.blog/'),
        'X-File-Name': encodeURIComponent(filename),
      },
      body: bytes,
    }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ url: location });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token');
    expect(new Headers(init.headers).get('Content-Type')).toMatch(/^multipart\/form-data; boundary=----bum-hand-/);
    expect(init.body).toBeInstanceOf(ReadableStream);
  });

  it('rejects streamed media above 75 MB before proxying', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(new Request('https://hand.example/api/microblog/stream-media', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': '75000001',
        'X-Microblog-Token': 'token',
        'X-Microblog-Media-Endpoint': encodeURIComponent('https://micro.blog/micropub/media'),
        'X-Microblog-Destination': encodeURIComponent('https://example.micro.blog/'),
        'X-File-Name': encodeURIComponent('too-big.pdf'),
      },
      body: new Uint8Array([1]),
    }));

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
