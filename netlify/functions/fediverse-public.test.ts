import { describe, expect, it } from 'vitest';
import { parseFeed } from './fediverse-public';

const target = {
  origin: 'https://streams.example',
  host: 'streams.example',
  username: 'alice',
  profileUrl: 'https://streams.example/channel/alice',
};

describe('public Fediverse feed parsing', () => {
  it('parses Atom entries used by full streams channel feeds', () => {
    const xml = `
      <feed xmlns="http://www.w3.org/2005/Atom" xmlns:thr="http://purl.org/syndication/thread/1.0">
        <entry>
          <id>tag:streams.example,2026:item-123</id>
          <title>Reply title</title>
          <link rel="alternate" href="https://streams.example/item/123" />
          <published>2026-09-23T09:38:00Z</published>
          <content type="html">&lt;p&gt;Hello from Atom&lt;/p&gt;</content>
          <thr:in-reply-to href="https://davidmarsden.info/2026/09/23/example/" />
        </entry>
      </feed>
    `;

    const items = parseFeed(xml, target, undefined, 80);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: 'https://streams.example/item/123',
      content_html: '<p>Hello from Atom</p>',
      date_published: '2026-09-23T09:38:00.000Z',
      author: {
        username: 'alice@streams.example',
        url: 'https://streams.example/channel/alice',
      },
      _microblog: {
        source: 'mastodon',
        public_fallback: true,
        in_reply_to: 'https://davidmarsden.info/2026/09/23/example/',
      },
    });
  });

  it('continues to parse RSS items', () => {
    const xml = `
      <rss><channel><item>
        <guid>https://streams.example/item/456</guid>
        <link>https://streams.example/item/456</link>
        <pubDate>Wed, 23 Sep 2026 09:40:00 GMT</pubDate>
        <description><![CDATA[<p>Hello from RSS</p>]]></description>
      </item></channel></rss>
    `;

    const items = parseFeed(xml, target, undefined, 39);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: 'https://streams.example/item/456',
      content_html: '<p>Hello from RSS</p>',
      date_published: '2026-09-23T09:40:00.000Z',
    });
  });

  it('does not throw on malformed feed dates', () => {
    const xml = `
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <id>tag:streams.example,2026:item-789</id>
          <link href="https://streams.example/item/789" />
          <updated>not-a-date</updated>
          <summary>Still visible</summary>
        </entry>
      </feed>
    `;

    const [item] = parseFeed(xml, target, undefined, 80);
    expect(item.content_html).toBe('Still visible');
    expect(item.date_published).toBeUndefined();
  });
});
