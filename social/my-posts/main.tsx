import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MicroblogAccount, MicroblogFeed, MicroblogSocialClient } from '../../src/microblogSocial';
import { RichContent } from '../RichContent';
import '../social.css';

const PAGE_SIZE = 40;

function siteUrl(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return undefined;
  }
}

function App() {
  const [account, setAccount] = useState<MicroblogAccount | null>(null);
  const [feed, setFeed] = useState<MicroblogFeed>({ items: [] });
  const [busy, setBusy] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const client = new MicroblogSocialClient();

  useEffect(() => { void load(); }, []);

  async function load() {
    setBusy(true); setError('');
    try {
      const identity = await client.account();
      const result = await client.profile(identity.username, { count: PAGE_SIZE });
      setAccount(identity);
      setFeed(result);
      setHasMore(result.items.length >= PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your Micro.blog profile.');
    } finally {
      setBusy(false);
    }
  }

  async function loadOlder() {
    if (!account || loadingOlder || !hasMore) return;
    const lastId = feed.items[feed.items.length - 1]?.id;
    if (!lastId) return;

    setLoadingOlder(true); setError('');
    try {
      const result = await client.profile(account.username, { count: PAGE_SIZE, beforeId: lastId });
      setFeed(current => ({
        ...current,
        items: [...current.items, ...result.items.filter(item => !current.items.some(existing => existing.id === item.id))],
      }));
      setHasMore(result.items.length >= PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load older posts.');
    } finally {
      setLoadingOlder(false);
    }
  }

  const microblogProfile = account ? `https://micro.blog/${encodeURIComponent(account.username)}` : undefined;
  const defaultSite = siteUrl(account?.defaultSite);

  return <div className="social-shell">
    <header className="social-header">
      <div>
        <a className="back-link" href="/social/">← Dent Hand</a>
        <p className="eyebrow">Dent Hand · Micro.blog</p>
        <h1>My posts</h1>
        <p className="lede">Your own Micro.blog profile and posts. No dashboard, no statistics, just what you published.</p>
      </div>
    </header>

    {error && <div className="notice error" role="alert">{error} <a href="/api/microblog/auth?op=start">Connect Micro.blog</a></div>}
    {busy && <div className="notice">Loading your Micro.blog profile…</div>}

    {account && <section className="profile-card">
      <div className="profile-main">
        {account.avatar && <img className="profile-avatar" src={account.avatar} alt=""/>}
        <div>
          <p className="eyebrow">Your profile</p>
          <h2>{account.name || `@${account.username}`}</h2>
          <p>@{account.username}</p>
        </div>
      </div>
      <div className="profile-actions">
        {defaultSite && <a className="profile-link" href={defaultSite} target="_blank" rel="noreferrer">Open site ↗</a>}
        {microblogProfile && <a className="profile-link" href={microblogProfile} target="_blank" rel="noreferrer">Open Micro.blog profile ↗</a>}
      </div>
    </section>}

    <main className="feed" aria-live="polite">
      {feed.items.map(item => <article className="post-card" key={item.id}>
        <div className="meta">{item._microblog?.date_relative && <span>{item._microblog.date_relative}</span>}</div>
        <RichContent item={item}/>
        <div className="actions">
          {item.url && <a href={item.url} target="_blank" rel="noreferrer">Original ↗</a>}
        </div>
      </article>)}

      {!busy && account && feed.items.length === 0 && <div className="notice inline">No posts returned for this profile yet.</div>}
      {feed.items.length > 0 && <div className="load-more-wrap">
        {hasMore
          ? <button className="load-more" onClick={loadOlder} disabled={loadingOlder}>{loadingOlder ? 'Loading older posts…' : 'Load older posts'}</button>
          : <span>You’ve reached the end.</span>}
      </div>}
    </main>
  </div>;
}

createRoot(document.getElementById('my-posts-root')!).render(<App />);
