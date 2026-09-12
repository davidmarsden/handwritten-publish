import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MicroblogDestination, MicroblogFeed, MicroblogItem, MicroblogSocialClient } from '../src/microblogSocial';
import './social.css';

type View = 'timeline' | 'circle' | 'bookmarks' | 'replies';
type PublishNotice = { message: string; url?: string | null } | null;
type ProfileState = { username: string; feed: MicroblogFeed; hasMore: boolean } | null;

const PAGE_SIZE = 40;
const CIRCLE_KEY = 'dent-hand-circle';

function readCircle(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(CIRCLE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function displayText(item: MicroblogItem): string {
  if (item.content_text?.trim()) return item.content_text.trim();
  const html = item.content_html || '';
  if (!html) return '';
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() || '';
}

function authorLabel(item: MicroblogItem): string {
  return item.author?.name || (item.author?.username ? `@${item.author.username}` : 'Micro.blog');
}

function destinationLabel(destination: MicroblogDestination): string {
  return destination.name === destination.uid ? destination.name : `${destination.name} · ${destination.uid}`;
}

function quoteMarkdown(item: MicroblogItem): string {
  const quote = displayText(item).replace(/\r\n/g, '\n').split('\n').map(line => `> ${line}`).join('\n');
  const author = authorLabel(item);
  return `${quote}\n\n— ${item.url ? `[${author}](${item.url})` : author}`;
}

function App() {
  const storedToken = sessionStorage.getItem('microblog-social-token') || '';
  const [token, setToken] = useState(storedToken);
  const [connectedToken, setConnectedToken] = useState(storedToken);
  const [view, setView] = useState<View>('timeline');
  const [feed, setFeed] = useState<MicroblogFeed>({ items: [] });
  const [conversation, setConversation] = useState<MicroblogFeed | null>(null);
  const [conversationTitle, setConversationTitle] = useState('Conversation');
  const [profile, setProfile] = useState<ProfileState>(null);
  const [circle, setCircle] = useState<string[]>(readCircle);
  const [busy, setBusy] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const [replyingTo, setReplyingTo] = useState<MicroblogItem | null>(null);
  const [replyText, setReplyText] = useState('');
  const [destinations, setDestinations] = useState<MicroblogDestination[]>([]);
  const [selectedDestination, setSelectedDestination] = useState('');
  const [composing, setComposing] = useState(false);
  const [quotedItem, setQuotedItem] = useState<MicroblogItem | null>(null);
  const [micropostText, setMicropostText] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [publishNotice, setPublishNotice] = useState<PublishNotice>(null);
  const generationRef = useRef(0);

  const client = useMemo(() => connectedToken ? new MicroblogSocialClient({ token: connectedToken }) : null, [connectedToken]);
  const circleSet = useMemo(() => new Set(circle.map(username => username.toLowerCase())), [circle]);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/dent-hand-sw.js', { scope: '/social/' }).catch(() => undefined);
  }, []);

  function saveCircle(next: string[]) {
    const clean = [...new Set(next.map(name => name.trim().replace(/^@/, '').toLowerCase()).filter(Boolean))].sort();
    setCircle(clean);
    localStorage.setItem(CIRCLE_KEY, JSON.stringify(clean));
  }

  async function feedFor(requestClient: MicroblogSocialClient, nextView: View, beforeId?: string) {
    const paging = { count: PAGE_SIZE, ...(beforeId ? { beforeId } : {}) };
    if (nextView === 'bookmarks') return requestClient.bookmarks(paging);
    if (nextView === 'replies') return requestClient.replies(paging);
    return requestClient.timeline(paging);
  }

  async function refreshDestinations(requestClient: MicroblogSocialClient, generation: number) {
    try {
      const targets = await requestClient.destinations();
      if (generation !== generationRef.current) return;
      setDestinations(targets);
      setSelectedDestination(targets.length === 1 ? targets[0].uid : '');
      setComposerError('');
    } catch (err) {
      if (generation !== generationRef.current) return;
      setDestinations([]);
      setSelectedDestination('');
      setComposerError(err instanceof Error ? err.message : 'Could not load destinations.');
    }
  }

  async function load(nextView: View = view, tokenOverride?: string) {
    const credential = (tokenOverride ?? connectedToken).trim();
    if (!credential) {
      setError('Add your Micro.blog app token first.');
      return;
    }
    const generation = ++generationRef.current;
    const requestClient = new MicroblogSocialClient({ token: credential });
    setBusy(true); setError(''); setConversation(null); setProfile(null); setPublishNotice(null);
    try {
      const result = await feedFor(requestClient, nextView);
      if (generation !== generationRef.current) return;
      setFeed(result); setHasMore(result.items.length >= PAGE_SIZE); setView(nextView);
      if (tokenOverride !== undefined) {
        setConnectedToken(credential);
        sessionStorage.setItem('microblog-social-token', credential);
      }
      if (tokenOverride !== undefined || destinations.length === 0) await refreshDestinations(requestClient, generation);
    } catch (err) {
      if (generation === generationRef.current) setError(err instanceof Error ? err.message : 'Could not load Micro.blog.');
    } finally {
      if (generation === generationRef.current) setBusy(false);
    }
  }

  async function openProfileUsername(username: string) {
    if (!client) return;
    const clean = username.trim().replace(/^@/, '');
    if (!clean) return;
    const generation = ++generationRef.current;
    setBusy(true); setError(''); setConversation(null);
    try {
      const result = await client.profile(clean, { count: PAGE_SIZE });
      if (generation !== generationRef.current) return;
      setProfile({ username: clean, feed: result, hasMore: result.items.length >= PAGE_SIZE });
    } catch (err) {
      if (generation === generationRef.current) setError(err instanceof Error ? err.message : 'Could not load profile.');
    } finally {
      if (generation === generationRef.current) setBusy(false);
    }
  }

  async function loadOlder() {
    if (!client || conversation || loadingOlder) return;
    const sourceItems = profile?.feed.items || feed.items;
    const lastId = sourceItems[sourceItems.length - 1]?.id;
    const canLoad = profile ? profile.hasMore : hasMore;
    if (!lastId || !canLoad) return;
    const generation = generationRef.current;
    setLoadingOlder(true); setError('');
    try {
      const result = profile ? await client.profile(profile.username, { count: PAGE_SIZE, beforeId: lastId }) : await feedFor(client, view, lastId);
      if (generation !== generationRef.current) return;
      if (profile) {
        setProfile(current => current ? { ...current, feed: { ...current.feed, items: [...current.feed.items, ...result.items.filter(item => !current.feed.items.some(existing => existing.id === item.id))] }, hasMore: result.items.length >= PAGE_SIZE } : current);
      } else {
        setFeed(current => ({ ...current, items: [...current.items, ...result.items.filter(item => !current.items.some(existing => existing.id === item.id))] }));
        setHasMore(result.items.length >= PAGE_SIZE);
      }
    } catch (err) {
      if (generation === generationRef.current) setError(err instanceof Error ? err.message : 'Could not load older dents.');
    } finally {
      if (generation === generationRef.current) setLoadingOlder(false);
    }
  }

  async function openConversation(item: MicroblogItem) {
    if (!client) return;
    const generation = ++generationRef.current;
    setBusy(true); setError('');
    try {
      const result = await client.conversation(item.id);
      if (generation !== generationRef.current) return;
      setConversation(result); setConversationTitle(`Conversation with ${authorLabel(item)}`);
    } catch (err) {
      if (generation === generationRef.current) setError(err instanceof Error ? err.message : 'Could not load conversation.');
    } finally {
      if (generation === generationRef.current) setBusy(false);
    }
  }

  async function toggleBookmark(item: MicroblogItem) {
    if (!client) return;
    try {
      if (item._microblog?.is_bookmark) await client.unbookmark(item.id); else await client.bookmark(item.id);
      const update = (existing: MicroblogItem) => existing.id === item.id ? { ...existing, _microblog: { ...(existing._microblog || {}), is_bookmark: !item._microblog?.is_bookmark } } : existing;
      setFeed(current => ({ ...current, items: current.items.map(update) }));
      setConversation(current => current ? { ...current, items: current.items.map(update) } : current);
      setProfile(current => current ? { ...current, feed: { ...current.feed, items: current.feed.items.map(update) } } : current);
    } catch (err) { setError(err instanceof Error ? err.message : 'Bookmark action failed.'); }
  }

  async function submitReply(event: FormEvent) {
    event.preventDefault();
    if (!client || !replyingTo || !replyText.trim()) return;
    setBusy(true); setError('');
    try {
      await client.reply(replyingTo.id, replyText.trim());
      const repliedTo = replyingTo; setReplyText(''); setReplyingTo(null);
      if (conversation) await openConversation(repliedTo);
    } catch (err) { setError(err instanceof Error ? err.message : 'Reply failed.'); }
    finally { setBusy(false); }
  }

  function openComposer(item?: MicroblogItem) {
    if (!client) return;
    setComposerError(''); setPublishNotice(null); setQuotedItem(item || null); setMicropostText('');
    setSelectedDestination(destinations.length === 1 ? destinations[0].uid : ''); setComposing(true);
  }

  async function submitMicropost(event: FormEvent) {
    event.preventDefault();
    if (!client || !selectedDestination) return;
    const body = quotedItem ? [micropostText.trim(), quoteMarkdown(quotedItem)].filter(Boolean).join('\n\n') : micropostText.trim();
    if (!body) return;
    setPublishing(true); setComposerError('');
    try {
      const result = await client.micropost(body, selectedDestination);
      const target = destinations.find(destination => destination.uid === selectedDestination);
      setComposing(false); setQuotedItem(null); setMicropostText(''); setSelectedDestination(destinations.length === 1 ? destinations[0].uid : '');
      setPublishNotice({ message: `Published to ${target?.name || selectedDestination}.`, url: result.preview || result.url });
    } catch (err) { setComposerError(err instanceof Error ? err.message : 'Could not publish dent.'); }
    finally { setPublishing(false); }
  }

  function toggleCircle(username: string) {
    const clean = username.trim().replace(/^@/, '').toLowerCase();
    saveCircle(circleSet.has(clean) ? circle.filter(item => item.toLowerCase() !== clean) : [...circle, clean]);
  }

  function forgetToken() {
    generationRef.current += 1;
    sessionStorage.removeItem('microblog-social-token');
    setToken(''); setConnectedToken(''); setFeed({ items: [] }); setConversation(null); setProfile(null);
    setReplyingTo(null); setReplyText(''); setDestinations([]); setSelectedDestination(''); setComposing(false);
    setQuotedItem(null); setMicropostText(''); setComposerError(''); setPublishNotice(null);
    setBusy(false); setLoadingOlder(false); setPublishing(false); setError('');
  }

  const sourceItems = conversation?.items || profile?.feed.items || feed.items || [];
  const items = !conversation && !profile && view === 'circle' ? sourceItems.filter(item => item.author?.username && circleSet.has(item.author.username.toLowerCase())) : sourceItems;
  const profileAuthor = profile?.feed.items[0]?.author;
  const headerTitle = conversation ? conversationTitle : profile ? (profileAuthor?.name || `@${profile.username}`) : view === 'circle' ? 'Circle' : view === 'bookmarks' ? 'Bookmarks' : view === 'replies' ? 'Replies' : 'Timeline';

  return <div className="social-shell">
    <header className="social-header"><div><a className="back-link" href="/">Helping Hand</a><p className="eyebrow">Dent Hand · Micro.blog</p><h1>{headerTitle}</h1><p className="lede">Chronological dents from people you chose. Read, reply, bookmark and quote. No algorithm required.</p></div><div className="token-card"><label htmlFor="token">Micro.blog app token</label><div className="token-row"><input id="token" type="password" value={token} onChange={event => setToken(event.target.value)} placeholder="Paste token" autoComplete="off"/><button onClick={() => load(view, token)} disabled={busy || !token.trim()}>{busy ? 'Loading…' : 'Connect'}</button></div><div className="token-note">Kept in this browser session only. <button className="text-button" onClick={forgetToken}>Forget token</button></div></div></header>
    <nav className="tabs" aria-label="Dent Hand views"><button className={!conversation && !profile && view === 'timeline' ? 'active' : ''} onClick={() => load('timeline')} disabled={!client}>Timeline</button><button className={!conversation && !profile && view === 'circle' ? 'active' : ''} onClick={() => load('circle')} disabled={!client}>Circle</button><button className={!conversation && !profile && view === 'bookmarks' ? 'active' : ''} onClick={() => load('bookmarks')} disabled={!client}>Bookmarks</button><button className={!conversation && !profile && view === 'replies' ? 'active' : ''} onClick={() => load('replies')} disabled={!client}>Replies</button>{(conversation || profile) && <button className="active" onClick={() => conversation ? setConversation(null) : setProfile(null)}>← Back</button>}<button className="compose-launch" onClick={() => openComposer()} disabled={!client}>+ New dent</button></nav>
    {error && <div className="notice error" role="alert">{error}</div>}{publishNotice && <div className="notice success" role="status">{publishNotice.message} {publishNotice.url && <a href={publishNotice.url} target="_blank" rel="noreferrer">View dent ↗</a>}</div>}{!client && !error && <div className="notice">Add your Micro.blog app token to load the timeline.</div>}
    {profile && <section className="profile-card"><div className="profile-main">{profileAuthor?.avatar && <img className="profile-avatar" src={profileAuthor.avatar} alt=""/>}<div><p className="eyebrow">Profile</p><h2>{profileAuthor?.name || `@${profile.username}`}</h2><p>@{profile.username}</p></div></div><button className="circle-toggle" onClick={() => toggleCircle(profile.username)}>{circleSet.has(profile.username.toLowerCase()) ? '★ In Circle' : '☆ Add to Circle'}</button></section>}
    {!conversation && !profile && view === 'circle' && <section className="circle-bar"><strong>Circle</strong>{circle.length ? circle.map(username => <button key={username} onClick={() => openProfileUsername(username)}>@{username}</button>) : <span>Add people from their profiles. Your Circle stays on this device.</span>}</section>}
    <main className="feed" aria-live="polite">{items.map(item => <article className="post-card" key={`${conversation ? 'c' : profile ? 'p' : view}-${item.id}`}><button className="author-button" onClick={() => item.author?.username && openProfileUsername(item.author.username)} disabled={!item.author?.username}>{item.author?.avatar ? <img className="avatar" src={item.author.avatar} alt=""/> : <span className="avatar fallback"/>}<span><strong>{authorLabel(item)}</strong><span className="meta">{item.author?.username && <span>@{item.author.username}</span>}{item._microblog?.date_relative && <span>{item._microblog.date_relative}</span>}</span></span></button><p className="post-text">{displayText(item)}</p><div className="actions"><button onClick={() => openConversation(item)}>Conversation</button><button onClick={() => setReplyingTo(item)}>Reply</button><button onClick={() => toggleBookmark(item)}>{item._microblog?.is_bookmark ? 'Bookmarked' : 'Bookmark'}</button>{item.url && <a href={item.url} target="_blank" rel="noreferrer">Original ↗</a>}<button onClick={() => openComposer(item)}>Quote</button></div></article>)}{client && items.length === 0 && !busy && <div className="notice inline">{view === 'circle' ? (circle.length ? 'No Circle dents in this slice of the timeline yet.' : 'Your Circle is empty. Open a profile and add someone.') : 'Nothing here yet.'}</div>}{!conversation && sourceItems.length > 0 && ((profile?.hasMore ?? hasMore) ? <div className="load-more-wrap"><button className="load-more" onClick={loadOlder} disabled={loadingOlder || busy}>{loadingOlder ? 'Loading older dents…' : 'Load older dents'}</button></div> : <div className="load-more-wrap"><span>You’ve reached the end.</span></div>)}</main>
    {replyingTo && <div className="reply-drawer" role="dialog" aria-modal="true" aria-label={`Reply to ${authorLabel(replyingTo)}`}><form onSubmit={submitReply}><div className="reply-head"><div><span className="eyebrow">Replying to</span><strong>{authorLabel(replyingTo)}</strong></div><button type="button" className="text-button" onClick={() => setReplyingTo(null)}>Close</button></div><blockquote>{displayText(replyingTo)}</blockquote><textarea value={replyText} onChange={event => setReplyText(event.target.value)} placeholder="Write a reply…" autoFocus/><button className="primary" type="submit" disabled={busy || !replyText.trim()}>{busy ? 'Sending…' : 'Send reply'}</button></form></div>}
    {composing && <div className="reply-drawer composer-drawer" role="dialog" aria-modal="true" aria-label={quotedItem ? 'Quote dent' : 'New dent'}><form onSubmit={submitMicropost}><div className="reply-head"><div><span className="eyebrow">Dent Hand</span><strong>{quotedItem ? 'Quote dent' : 'New dent'}</strong></div><button type="button" className="text-button" onClick={() => setComposing(false)}>Close</button></div>{quotedItem && <blockquote>{displayText(quotedItem)}<footer>— {authorLabel(quotedItem)}</footer></blockquote>}<p className="composer-note">Choose the destination explicitly. Dent Hand never falls back to Micro.blog’s current site.</p><label className="field-label" htmlFor="destination">Post to</label><select id="destination" value={selectedDestination} onChange={event => setSelectedDestination(event.target.value)} disabled={publishing}><option value="">Choose a blog…</option>{destinations.map(destination => <option key={destination.uid} value={destination.uid}>{destinationLabel(destination)}</option>)}</select><label className="field-label" htmlFor="micropost">{quotedItem ? 'Your comment (optional)' : 'Dent'}</label><textarea id="micropost" value={micropostText} onChange={event => setMicropostText(event.target.value)} placeholder={quotedItem ? 'Add a comment…' : 'What’s happening?'} autoFocus/><div className="composer-footer"><span>{micropostText.length.toLocaleString()} characters</span><button className="primary" type="submit" disabled={publishing || !selectedDestination || (!quotedItem && !micropostText.trim())}>{publishing ? 'Publishing…' : 'Publish dent'}</button></div>{composerError && <div className="composer-warning error" role="alert">{composerError}</div>}</form></div>}
  </div>;
}

createRoot(document.getElementById('social-root')!).render(<App />);
