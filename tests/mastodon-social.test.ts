import { describe, expect, it } from 'vitest';
import { mastodonPagingId } from '../netlify/functions/mastodon-social';

describe('mastodonPagingId', () => {
  it('preserves stock numeric Mastodon IDs', () => {
    expect(mastodonPagingId('1234567890')).toBe('1234567890');
  });

  it('extracts opaque IDs from Dent Hand namespaced cursors', () => {
    expect(mastodonPagingId('mastodon:social.example:01JZK-opaque:id')).toBe('01JZK-opaque:id');
  });

  it('preserves unnamespaced opaque compatible-server IDs', () => {
    expect(mastodonPagingId('01JZK_opaque-id')).toBe('01JZK_opaque-id');
  });

  it('rejects whitespace and control characters', () => {
    expect(mastodonPagingId('bad id')).toBeUndefined();
    expect(mastodonPagingId('bad\nvalue')).toBeUndefined();
  });
});
