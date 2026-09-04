import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../netlify/functions/microblog-media';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Micro.blog image media bridge', () => {
  it('forwards mp-destination with the image upload', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        'media-endpoint': 'https://micro.blog/micropub/media',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 201,
        headers: { Location: 'https://example.micro.blog/uploads/photo.png' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('https://hand.example/api/microblog/media', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'X-Microblog-Token': 'token',
        'X-Microblog-Destination': encodeURIComponent('https://example.micro.blog/'),
        'X-File-Name': encodeURIComponent('photo.png'),
      },
      body: new Uint8Array([1, 2, 3]),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, uploadOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    const form = uploadOptions.body as FormData;
    expect(form.get('mp-destination')).toBe('https://example.micro.blog/');
    const file = form.get('file') as File;
    expect(file.name).toBe('photo.png');
    expect(file.type).toBe('image/png');
  });
});
