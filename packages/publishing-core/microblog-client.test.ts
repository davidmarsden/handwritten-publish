import { describe, expect, it, vi } from 'vitest';
import {
  inferImageMediaType,
  MICROBLOG_MAX_MEDIA_BYTES,
  uploadMicroblogMedia,
} from './microblog-client';

describe('publishing core Micro.blog client', () => {
  it('infers image types when File.type is empty', () => {
    expect(inferImageMediaType({ name: 'scan.PNG', type: '' })).toBe('image/png');
    expect(inferImageMediaType({ name: 'photo.jpeg', type: '' })).toBe('image/jpeg');
    expect(inferImageMediaType({ name: 'image.webp', type: '' })).toBe('image/webp');
    expect(inferImageMediaType({ name: 'notes.txt', type: '' })).toBe('');
  });

  it('uses the shared media bridge contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'https://example.com/photo.jpg' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' });
    await expect(uploadMicroblogMedia(' token ', file)).resolves.toBe('https://example.com/photo.jpg');
    expect(fetchMock).toHaveBeenCalledWith('/api/microblog/media', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'image/jpeg',
        'X-Microblog-Token': 'token',
        'X-File-Name': 'photo.jpg',
      }),
      body: file,
    }));
    vi.unstubAllGlobals();
  });

  it('infers the upload Content-Type when File.type is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'https://example.com/scan.png' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['abc'], 'scan.PNG', { type: '' });
    await expect(uploadMicroblogMedia('token', file)).resolves.toBe('https://example.com/scan.png');
    expect(fetchMock).toHaveBeenCalledWith('/api/microblog/media', expect.objectContaining({
      headers: expect.objectContaining({ 'Content-Type': 'image/png' }),
      body: file,
    }));
    vi.unstubAllGlobals();
  });

  it('rejects files over the bridge limit before fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const file = new File([new Uint8Array(MICROBLOG_MAX_MEDIA_BYTES + 1)], 'large.jpg', { type: 'image/jpeg' });
    await expect(uploadMicroblogMedia('token', file)).rejects.toThrow('supports media files up to 5 MB');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
