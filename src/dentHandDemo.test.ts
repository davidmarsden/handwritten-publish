import { describe, expect, it, vi } from 'vitest';
import { MicroblogSocialClient } from './microblogSocial';
import { createDemoFetch, demoModeAllowed, demoModeRequested } from './dentHandDemo';

describe('Dent Hand demo mode', () => {
  it('is only available on local and Netlify preview hosts', () => {
    expect(demoModeAllowed('localhost')).toBe(true);
    expect(demoModeAllowed('deploy-preview-132--helping-hand.netlify.app')).toBe(true);
    expect(demoModeAllowed('helping-hand.netlify.app')).toBe(false);
    expect(demoModeAllowed('example.com')).toBe(false);
    expect(demoModeRequested({ hostname: 'localhost', search: '?demo=1' })).toBe(true);
    expect(demoModeRequested({ hostname: 'localhost', search: '' })).toBe(false);
    expect(demoModeRequested({ hostname: 'example.com', search: '?demo=1' })).toBe(false);
  });

  it('serves sample data and captures posts instead of publishing', async () => {
    const onPost = vi.fn();
    const client = new MicroblogSocialClient({ fetchImpl: createDemoFetch(onPost) });

    expect((await client.account()).username).toBe('demo');
    expect((await client.timeline()).items.length).toBeGreaterThan(0);
    expect((await client.timeline({ beforeId: '9000003' })).items).toEqual([]);
    const [destination] = await client.destinations();

    await client.micropost('{{< yt dQw4w9WgXcQ >}}', destination.uid);
    expect(onPost).toHaveBeenCalledWith({ content: '{{< yt dQw4w9WgXcQ >}}', destination: destination.uid });

    await client.bookmark('9000001');
    expect((await client.bookmarks()).items.map(item => item.id)).toEqual(['9000001']);
  });
});
