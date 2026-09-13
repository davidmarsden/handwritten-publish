import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MastodonSocialClient } from '../src/mastodonSocial';
import type { MicroblogAccount, MicroblogAuthor, MicroblogFeed, MicroblogItem } from '../src/microblogSocial';
import { RichContent } from './RichContent';
import './social.css';

type CirclePerson = { id: string; name: string; username?: string; url?: string; avatar?: string };

const PAGE_SIZE = 40;
const CIRCLE_KEY = 'dent-hand-circle';
const PROVIDER_KEY = 'dent-hand-provider';

function canonicalUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function personFromAuthor(author?: MicroblogAuthor): CirclePerson | null {
  if (!author) return null;
  const username = author.username?.trim().replace(/^@/, '');
  const url = canonicalUrl(author.url);
  const id = url ? `url:${url.toLowerCase()}` : username ? `fediverse:${username.toLowerCase()}` : '';
  if (!id) return null;
  return {
    id,
    name: author.name || (username ? `@${username}` : 'Fediverse account'),
    ...(username ? { username } : {}),
    ...(url ? { url } : {}),
    ...(author.avatar ? { avatar: author.avatar } : {}),
  };
}

function readCircle(): CirclePerson[] {
  try {
    const value = JSON.parse(localStorage.getItem(CIRCLE_KEY) || '[]');
    return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string') : [];
  } catch {
    return [];
  }
}

function authorLabel(item: MicroblogItem): string {
  return item.author?.name || (item.author?.username ? `@${item.author.username}` : 'Fediverse account');
}

function App() {
  const client = useMemo(() => new MastodonSocialClient(), []);
  const [account, setAccount] = useState<MicroblogAccount | null>(null);
  const [feed, setFeed] = useState<MicroblogFeed>({ items: [] });
  const [circle, setCircle] = useState<CirclePerson[]>(readCircle);
  const [view, setView] = useState<'timeline' | 'circle'>('timeline');
  const [busy, setBusy] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const circleSet = useMemo(() => new Set(circle.map(person => person.id)), [circle]);

  useEffect(() => {
    localStorage.setItem(PROVIDER_KEY, 'mastodon');
    document.querySelector<HTMLElement>('.my-posts-shortcut')?.style.setProperty('display', 'none');
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/dent-hand-sw.js', { scope: '/social/', updateViaCache: 'none' }).catch(() => undefined);
    void loadInitial();
  }, []);

  async function loadInitial() {
    setBusy(true); setError('');
    try {
      const [identity, result] = await Promise.all([client.account(), client.timeline({ count: PAGE_SIZE })]);
      setAccount(identity);
      setFeed(result);
      setHasMore(result.items.length >= PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your Mastodon timeline.');
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    const firstId = feed.items[0]?.id;
    setBusy(true); setError('');
    try {
      const result = await client.timeline({ count: PAGE_SIZE, ...(firstId ? { sinceId: firstId } : {}) });
      const seen = new Set(feed.items.map(item => item.id));
      setFeed(current => ({ ...current, items: [...result.items.filter(item => !seen.has(item.id)), ...current.items] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh your Mastodon timeline.');
    } finally {
      setBusy(false);
    }
  }

  async function loadOlder() {
    if (loadingOlder || !hasMore) return;
    const lastId = feed.items[feed.items.length - 1]?.id;
    if (!lastId) return;
    setLoadingOlder(true); setError('');
    try {
      const result = await client.timeline({ count: PAGE_SIZE, beforeId: lastId });
      setFeed(current => {
        const seen = new Set(current.items.map(item => item.id));
        return { ...current, items: [...current.items, ...result.items.filter(item => !seen.has(item.id))] };
      });
      setHasMore(result.items.length >= PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load older dents.');
    } finally {
      setLoadingOlder(false);
    }
  }

  function toggleCircle(person: CirclePerson) {
    const next = circleSet.has(person.id) ? circle.filter(item => item.id !== person.id) : [...circle, person];
    const unique = new Map(next.map(item => [item.id, item]));
    const clean = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
    setCircle(clean);
    localStorage.setItem(CIRCLE_KEY, JSON.stringify(clean));
  }

  async function signOut() {
    setError('');
    try {
      const response = await fetch(client.auth.signOutPath, { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Sign out failed (${response.status}).`);
      localStorage.removeItem(PROVIDER_KEY);
      window.location.assign('/social/?choose=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out.');
    }
  }

  const items = view === 'circle'
    ? feed.items.filter(item => { const person = personFromAuthor(item.author); return person ? circleSet.has(person.id) : false; })
    : feed.items;

  return <div className="social-shell">
    <header className="social-header">
      <div>
        <a className="back-link" href="/">Helping Hand</a>
        <p className="eyebrow">Dent Hand · Mastodon / Fediverse</p>
        <h1>{view === 'circle' ? 'Circle' : 'Timeline'}</h1>
        <p className="lede">Chronological dents from your home timeline. No algorithm required.</p>
      </div>
      <div className="token-card">
        {account ? <>
          <strong>{account.name || `@${account.username}`}</strong>
          <div className="token-note">@{account.username} · Connected securely. Your access token stays encrypted on the server.</div>
          <div className="token-row">
            <button className="text-button" onClick={() => void signOut()}>Sign out</button>
            <button className="text-button" onClick={() => window.location.assign('/social/?choose=1')}>Switch network</button>
          </div>
        </> : <div className="token-note">Loading your Fediverse account…</div>}
      </div>
    </header>

    <nav className="tabs" aria-label="Dent Hand views">
      <button className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}>Timeline</button>
      <button className={view === 'circle' ? 'active' : ''} onClick={() => setView('circle')}>Circle</button>
      <button className="refresh-button" onClick={() => void refresh()} disabled={busy}>{busy ? 'Checking…' : 'Refresh'}</button>
    </nav>

    {error && <div className="notice error" role="alert">{error}</div>}
    {busy && feed.items.length === 0 && <div className="notice">Loading your home timeline…</div>}
    {view === 'circle' && <section className="circle-bar"><strong>Circle</strong><span>{circle.length ? 'Showing people in your local Dent Hand Circle.' : 'Add people from the timeline. Your Circle stays on this device.'}</span></section>}

    <main className="feed" aria-live="polite">
      {items.map(item => {
        const person = personFromAuthor(item.author);
        return <article className="post-card" key={item.id}>
          <div className="author-button">
            {item.author?.avatar ? <img className="avatar" src={item.author.avatar} alt=""/> : <span className="avatar fallback"/>}
            <span><strong>{authorLabel(item)}</strong><span className="meta">{item.author?.username && <span>@{item.author.username}</span>}</span></span>
          </div>
          <RichContent item={item}/>
          <div className="actions">
            {person && <button onClick={() => toggleCircle(person)}>{circleSet.has(person.id) ? '★ In Circle' : '☆ Add to Circle'}</button>}
            {item.url && <a href={item.url} target="_blank" rel="noreferrer">Original ↗</a>}
          </div>
        </article>;
      })}
      {!busy && items.length === 0 && <div className="notice">No dents here yet.</div>}
    </main>

    {view === 'timeline' && hasMore && feed.items.length > 0 && <div className="load-older-wrap"><button onClick={() => void loadOlder()} disabled={loadingOlder}>{loadingOlder ? 'Loading…' : 'Load older dents'}</button></div>}
    <footer className="social-footer">Dent Hand is reading your server’s Mastodon-compatible API. Replying, boosting, favourites and publishing come next.</footer>
  </div>;
}

createRoot(document.getElementById('social-root')!).render(<App />);
