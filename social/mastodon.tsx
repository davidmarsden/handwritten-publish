import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MastodonSocialClient } from '../src/mastodonSocial';
import type { MicroblogAccount, MicroblogAuthor, MicroblogFeed, MicroblogItem } from '../src/microblogSocial';
import { RichContent } from './RichContent';
import './social.css';

type CirclePerson = { id: string; name: string; username?: string; url?: string; avatar?: string };
type PublishNotice = { message: string; url?: string | null } | null;

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

function displayText(item: MicroblogItem): string {
  if (item.content_text?.trim()) return item.content_text.trim();
  const html = item.content_html || '';
  if (!html) return '';
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() || '';
}

function targetStatusId(item: MicroblogItem): string {
  const visible = item._microblog?.visible_remote_id;
  const remote = item._microblog?.remote_id;
  return typeof visible === 'string' && visible ? visible : typeof remote === 'string' ? remote : '';
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
  const [acting, setActing] = useState('');
  const [replyingTo, setReplyingTo] = useState<MicroblogItem | null>(null);
  const [replyText, setReplyText] = useState('');
  const [composing, setComposing] = useState(false);
  const [micropostText, setMicropostText] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishNotice, setPublishNotice] = useState<PublishNotice>(null);
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

  function updateItem(id: string, key: 'is_favourite' | 'is_bookmark' | 'is_reblogged', value: boolean) {
    setFeed(current => ({
      ...current,
      items: current.items.map(item => item.id === id
        ? { ...item, _microblog: { ...(item._microblog || {}), [key]: value } }
        : item),
    }));
  }

  async function runToggle(item: MicroblogItem, kind: 'favourite' | 'bookmark' | 'boost') {
    const id = targetStatusId(item);
    if (!id) { setError('Dent Hand could not find the Mastodon status id for that dent.'); return; }
    const key = kind === 'favourite' ? 'is_favourite' : kind === 'bookmark' ? 'is_bookmark' : 'is_reblogged';
    const active = Boolean(item._microblog?.[key]);
    const actionKey = `${kind}:${item.id}`;
    setActing(actionKey); setError('');
    try {
      if (kind === 'favourite') {
        if (active) await client.unfavourite(id); else await client.favourite(id);
      } else if (kind === 'bookmark') {
        if (active) await client.unbookmark(id); else await client.bookmark(id);
      } else {
        if (active) await client.unboost(id); else await client.boost(id);
      }
      updateItem(item.id, key, !active);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${kind} that dent.`);
    } finally {
      setActing('');
    }
  }

  async function submitReply(event: FormEvent) {
    event.preventDefault();
    if (!replyingTo || !replyText.trim()) return;
    const id = targetStatusId(replyingTo);
    if (!id) { setError('Dent Hand could not find the Mastodon status id for that dent.'); return; }
    setPublishing(true); setError('');
    try {
      const result = await client.reply(id, replyText.trim());
      setReplyText(''); setReplyingTo(null);
      setPublishNotice({ message: `Reply posted to ${authorLabel(replyingTo)}.`, url: result.url });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reply failed.');
    } finally {
      setPublishing(false);
    }
  }

  async function submitMicropost(event: FormEvent) {
    event.preventDefault();
    const content = micropostText.trim();
    if (!content) return;
    setPublishing(true); setError('');
    try {
      const result = await client.publish(content);
      setMicropostText(''); setComposing(false);
      setPublishNotice({ message: 'Dent published to Mastodon.', url: result.url });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish dent.');
    } finally {
      setPublishing(false);
    }
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
        <p className="lede">Chronological dents from your home timeline. Read, reply, favourite, bookmark, boost and post. No algorithm required.</p>
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
      <button className="compose-launch" onClick={() => { setPublishNotice(null); setComposing(true); }}>+ New dent</button>
    </nav>

    {error && <div className="notice error" role="alert">{error}</div>}
    {publishNotice && <div className="notice success" role="status">{publishNotice.message} {publishNotice.url && <a href={publishNotice.url} target="_blank" rel="noreferrer">View dent ↗</a>}</div>}
    {busy && feed.items.length === 0 && <div className="notice">Loading your home timeline…</div>}
    {view === 'circle' && <section className="circle-bar"><strong>Circle</strong><span>{circle.length ? 'Showing people in your local Dent Hand Circle.' : 'Add people from the timeline. Your Circle stays on this device.'}</span></section>}

    <main className="feed" aria-live="polite">
      {items.map(item => {
        const person = personFromAuthor(item.author);
        const favourite = Boolean(item._microblog?.is_favourite);
        const bookmarked = Boolean(item._microblog?.is_bookmark);
        const boosted = Boolean(item._microblog?.is_reblogged);
        return <article className="post-card" key={item.id}>
          <div className="author-button">
            {item.author?.avatar ? <img className="avatar" src={item.author.avatar} alt=""/> : <span className="avatar fallback"/>}
            <span><strong>{authorLabel(item)}</strong><span className="meta">{item.author?.username && <span>@{item.author.username}</span>}{item._microblog?.reblogged_by && <span>Boosted by {String(item._microblog.reblogged_by)}</span>}</span></span>
          </div>
          <RichContent item={item}/>
          <div className="actions">
            <span hidden aria-hidden="true" />
            <button onClick={() => setReplyingTo(item)}>Reply</button>
            <button onClick={() => void runToggle(item, 'favourite')} disabled={acting === `favourite:${item.id}`}>{favourite ? 'Favourited' : 'Favourite'}</button>
            <button onClick={() => void runToggle(item, 'bookmark')} disabled={acting === `bookmark:${item.id}`}>{bookmarked ? 'Bookmarked' : 'Bookmark'}</button>
            <button onClick={() => void runToggle(item, 'boost')} disabled={acting === `boost:${item.id}`}>{boosted ? 'Boosted' : 'Boost'}</button>
            {person && <button onClick={() => toggleCircle(person)}>{circleSet.has(person.id) ? '★ In Circle' : '☆ Add to Circle'}</button>}
            {item.url && <a href={item.url} target="_blank" rel="noreferrer">Original ↗</a>}
          </div>
        </article>;
      })}
      {!busy && items.length === 0 && <div className="notice">No dents here yet.</div>}
    </main>

    {view === 'timeline' && hasMore && feed.items.length > 0 && <div className="load-older-wrap"><button onClick={() => void loadOlder()} disabled={loadingOlder}>{loadingOlder ? 'Loading…' : 'Load older dents'}</button></div>}

    {replyingTo && <div className="reply-drawer" role="dialog" aria-modal="true" aria-label="Reply"><form onSubmit={submitReply}><div className="reply-head"><div><span className="eyebrow">Reply to</span><strong>{authorLabel(replyingTo)}</strong></div><button type="button" className="text-button" onClick={() => { setReplyingTo(null); setReplyText(''); }}>Close</button></div><blockquote>{displayText(replyingTo)}<footer>{replyingTo.author?.username && `@${replyingTo.author.username}`}</footer></blockquote><textarea value={replyText} onChange={event => setReplyText(event.target.value)} placeholder="Write a reply…" autoFocus/><button className="primary" type="submit" disabled={publishing || !replyText.trim()}>{publishing ? 'Posting…' : 'Reply'}</button></form></div>}

    {composing && <div className="reply-drawer composer-drawer" role="dialog" aria-modal="true" aria-label="New dent"><form onSubmit={submitMicropost}><div className="reply-head"><div><span className="eyebrow">New dent</span><strong>Post to Mastodon</strong></div><button type="button" className="text-button" onClick={() => setComposing(false)}>Close</button></div><p className="composer-note">Post from @{account?.username || 'your Fediverse account'}.</p><textarea value={micropostText} onChange={event => setMicropostText(event.target.value)} placeholder="What’s happening?" autoFocus/><div className="composer-footer"><span>{micropostText.length.toLocaleString()} characters</span><button className="primary" type="submit" disabled={publishing || !micropostText.trim()}>{publishing ? 'Publishing…' : 'Publish dent'}</button></div></form></div>}

    <footer className="social-footer">Dent Hand is using your server’s Mastodon-compatible client API. Your access token remains encrypted on the server.</footer>
  </div>;
}

createRoot(document.getElementById('social-root')!).render(<App />);
