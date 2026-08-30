import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../netlify/edge-functions/microblog-audio';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Micro.blog audio edge proxy', () => {
  it('streams an audio upload to the Micro.blog media endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', {
      status: 202,
      headers: { Location: 'https://example.micro.blog/uploads/song.mp3' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const response = await handler(new Request('https://hand.example/api/microblog/audio', {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(bytes.byteLength),
        'X-Microblog-Token': 'token',
        'X-Microblog-Media-Endpoint': encodeURIComponent('https://micro.blog/micropub/media'),
        'X-Microblog-Destination': encodeURIComponent('https://example.micro.blog/'),
        'X-File-Name': encodeURIComponent('song.mp3'),
      },
      body: bytes,
    }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      url: 'https://example.micro.blog/uploads/song.mp3',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://micro.blog/micropub/media');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token');
    expect(new Headers(init.headers).get('Content-Type')).toMatch(/^multipart\/form-data; boundary=----bum-hand-/);
    expect(init.body).toBeInstanceOf(ReadableStream);
  });

  it('rejects audio above Micro.blog’s 75 MB limit before proxying', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(new Request('https://hand.example/api/microblog/audio', {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': '75000001',
        'X-Microblog-Token': 'token',
        'X-Microblog-Media-Endpoint': encodeURIComponent('https://micro.blog/micropub/media'),
        'X-Microblog-Destination': encodeURIComponent('https://example.micro.blog/'),
        'X-File-Name': encodeURIComponent('too-big.mp3'),
      },
      body: new Uint8Array([1]),
    }));

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
