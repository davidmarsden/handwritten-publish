import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MicroblogAuthor, MicroblogDestination, MicroblogFeed, MicroblogItem, MicroblogSocialClient } from '../src/microblogSocial';
import './social.css';

type View = 'timeline' | 'circle' | 'bookmarks' | 'replies';
type PublishNotice = { message: string; url?: string | null } | null;
type CirclePerson = { id: string; name: string; username?: string; url?: string; avatar?: string };
type ProfileState = {
  person: CirclePerson;
  feed: MicroblogFeed;
  hasMore: boolean;
  loading: boolean;
  isMicroblog: boolean;
  loadError?: string;
} | null;

const PAGE_SIZE = 40;
const CIRCLE_KEY = 'dent-hand-circle';

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

function isMicroblogUrl(value?: string): boolean {
  if (!value) return false;
  try {
    return new URL(value).hostname.toLowerCase() === 'micro.blog';
  } catch {
    return false;
  }
}

function personFromAuthor(author?: MicroblogAuthor): CirclePerson | null {
  if (!author) return null;
  const username = author.username?.trim().replace(/^@/, '');
  const url = canonicalUrl(author.url);
  const id = url ? `url:${url.toLowerCase()}` : username ? `microblog:${username.toLowerCase()}` : '';
  if (!id) return null;
  return {
    id,
    name: author.name || (username ? `@${username}` : 'Fediverse account'),
    ...(username ? { username } : {}),
    ...(url ? { url } : {}),
    ...(author.avatar ? { avatar: author.avatar } : {}),
  };
}

function personFromItem(item: MicroblogItem): CirclePerson | null {
  return personFromAuthor(item.author);
}

function readCircle(): CirclePerson[] {
  try {
    const value = JSON.parse(localStorage.getItem(CIRCLE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): CirclePerson[] => {
      if (typeof item === 'string') {
        const username = item.trim().replace(/^@/, '');
        return username ? [{ id: `microblog:${username.toLowerCase()}`, name: `@${username}`, username }] : [];
      }
      if (!item || typeof item !== 'object') return [];
      const candidate = item as Partial<CirclePerson>;
      if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') return [];
      return [{ id: candidate.id, name: candidate.name, username: candidate.username, url: candidate.url, avatar: candidate.avatar }];
    });
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
  const [circle, setCircle] = useState<CirclePerson[]>(readCircle);
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
  const profileCacheRef = useRef(new Map<string, MicroblogFeed>());

  const client = useMemo(() => connectedToken ? new MicroblogSocialClient({ token: connectedToken }) : null, [connectedToken]);
  const circleSet = useMemo(() => new Set(circle.map(person => person.id)), [circle]);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/dent-hand-sw.js', { scope: '/social/', updateViaCache: 'none' }).catch(() => undefined);
  }, []);

  function saveCircle(next: CirclePerson[]) {
    const unique = new Map<string, CirclePerson>();
    next.forEach(person => { if (person.id) unique.set(person.id, person); });
    const clean = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
    setCircle(clean);
    localStorage.setItem(CIRCLE_KEY, JSON.stringify(clean));
  }

  function localPostsFor(person: CirclePerson): MicroblogItem[] {
    return feed.items.filter(item => personFromItem(item)?.id === person.id);
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

  function openProfile(person: CirclePerson) {
    if (!client) return;
    const generation = ++generationRef.current;
    setError(''); setConversation(null);

    const localFeed: MicroblogFeed = { items: localPostsFor(person) };
    const isMicroblog = isMicroblogUrl(person.url) || (!person.url && Boolean(person.username));
    const cached = profileCacheRef.current.get(person.id);
    setProfile({
      person,
      feed: cached || localFeed,
      hasMore: cached ? cached.items.length >= PAGE_SIZE : false,
      loading: Boolean(isMicroblog && person.username && !cached),
      isMicroblog,
    });

    if (!isMicroblog || !person.username || cached) return;

    client.profile(person.username, { count: PAGE_SIZE }).then(result => {
      if (generation !== generationRef.current) return;
      profileCacheRef.current.set(person.id, result);
      setProfile(current => current?.person.id === person.id ? {
        ...current,
        feed: result,
        hasMore: result.items.length >= PAGE_SIZE,
        loading: false,
        loadError: undefined,
      } : current);
    }).catch(err => {
      if (generation !== generationRef.current) return;
      setProfile(current => current?.person.id === person.id ? {
        ...current,
        loading: false,
        loadError: err instanceof Error ? err.message : 'Could not load full Micro.blog history.',
      } : current);
    });
  }

  function openProfileItem(item: MicroblogItem) {
    const person = personFromItem(item);
    if (person) openProfile(person);
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
      const result = profile?.person.username && profile.isMicroblog
        ? await client.profile(profile.person.username, { count: PAGE_SIZE, beforeId: lastId })
        : await feedFor(client, view, lastId);
      if (generation !== generationRef.current) return;
      if (profile) {
        setProfile(current => current ? {
          ...current,
          feed: { ...current.feed, items: [...current.feed.items, ...result.items.filter(item => !current.feed.items.some(existing => existing.id === item.id))] },
          hasMore: result.items.length >= PAGE_SIZE,
        } : current);
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

  function toggleCircle(person: CirclePerson) {
    saveCircle(circleSet.has(person.id) ? circle.filter(item => item.id !== person.id) : [...circle, person]);
  }

  function forgetToken() {
    generationRef.current += 1;
    sessionStorage.removeItem('microblog-social-token');
    setToken(''); setConnectedToken(''); setFeed({ items: [] }); setConversation(null); setProfile(null);
    setReplyingTo(null); setReplyText(''); setDestinations([]); setSelectedDestination(''); setComposing(false);
    setQuotedItem(null); setMicropostText(''); setComposerError(''); setPublishNotice(null);
    setBusy(false); setLoadingOlder(false); setPublishing(false); setError('');
    profileCacheRef.current.clear();
  }

  const sourceItems = conversation?.items || profile?.feed.items || feed.items || [];
  const items = !conversation && !profile && view === 'circle'
    ? sourceItems.filter(item => { const person = personFromItem(item); return person ? circleSet.has(person.id) : false; })
    : sourceItems;
  const headerTitle = conversation ? conversationTitle : profile ? profile.person.name : view === 'circle' ? 'Circle' : view === 'bookmarks' ? 'Bookmarks' : view === 'replies' ? 'Replies' : 'Timeline';

  return <div className="social-shell">
    <header className="social-header"><div><a className="back-link" href="/">Helping Hand</a><p className="eyebrow">Dent Hand · Micro.blog</p><h1>{headerTitle}</h1><p className="lede">Chronological dents from people you chose. Read, reply, bookmark and quote. No algorithm required.</p></div><div className="token-card"><label htmlFor="token">Micro.blog app token</label><div className="token-row"><input id="token" type="password" value={token} onChange={event => setToken(event.target.value)} placeholder="Paste token" autoComplete="off"/><button onClick={() => load(view, token)} disabled={busy || !token.trim()}>{busy ? 'Loading…' : 'Connect'}</button></div><div className="token-note">Kept in this browser session only. <button className="text-button" onClick={forgetToken}>Forget token</button></div></div></header>
    <nav className="tabs" aria-label="Dent Hand views"><button className={!conversation && !profile && view === 'timeline' ? 'active' : ''} onClick={() => load('timeline')} disabled={!client}>Timeline</button><button className={!conversation && !profile && view === 'circle' ? 'active' : ''} onClick={() => load('circle')} disabled={!client}>Circle</button><button className={!conversation && !profile && view === 'bookmarks' ? 'active' : ''} onClick={() => load('bookmarks')} disabled={!client}>Bookmarks</button><button className={!conversation && !profile && view === 'replies' ? 'active' : ''} onClick={() => load('replies')} disabled={!client}>Replies</button>{(conversation || profile) && <button className="active" onClick={() => conversation ? setConversation(null) : setProfile(null)}>← Back</button>}<button className="compose-launch" onClick={() => openComposer()} disabled={!client}>+ New dent</button></nav>
    {error && <div className="notice error" role="alert">{error}</div>}{publishNotice && <div className="notice success" role="status">{publishNotice.message} {publishNotice.url && <a href={publishNotice.url} target="_blank" rel="noreferrer">View dent ↗</a>}</div>}{!client && !error && <div className="notice">Add your Micro.blog app token to load the timeline.</div>}
    {profile && <section className="profile-card"><div className="profile-main">{profile.person.avatar && <img className="profile-avatar" src={profile.person.avatar} alt=""/>}<div><p className="eyebrow">Profile</p><h2>{profile.person.name}</h2>{profile.person.username && <p>@{profile.person.username}</p>}{profile.loading && <p className="profile-status">Loading full Micro.blog history…</p>}{profile.loadError && <p className="profile-status">Showing dents already in your timeline.</p>}</div></div><div className="profile-actions"><button className="circle-toggle" onClick={() => toggleCircle(profile.person)}>{circleSet.has(profile.person.id) ? '★ In Circle' : '☆ Add to Circle'}</button>{profile.person.url && <a className="profile-link" href={profile.person.url} target="_blank" rel="noreferrer">Open profile ↗</a>}</div></section>}
    {!conversation && !profile && view === 'circle' && <section className="circle-bar"><strong>Circle</strong>{circle.length ? circle.map(person => <button key={person.id} onClick={() => openProfile(person)}>{person.name}</button>) : <span>Add people from their profiles. Your Circle stays on this device.</span>}</section>}
    <main className="feed" aria-live="polite">{items.map(item => { const person = personFromItem(item); return <article className="post-card" key={`${conversation ? 'c' : profile ? 'p' : view}-${item.id}`}><button className="author-button" onClick={() => person && openProfileItem(item)} disabled={!person}>{item.author?.avatar ? <img className="avatar" src={item.author.avatar} alt=""/> : <span className="avatar fallback"/>}<span><strong>{authorLabel(item)}</strong><span className="meta">{item.author?.username && <span>@{item.author.username}</span>}{item._microblog?.date_relative && <span>{item._microblog.date_relative}</span>}</span></span></button><p className="post-text">{displayText(item)}</p><div className="actions"><button onClick={() => openConversation(item)}>Conversation</button><button onClick={() => setReplyingTo(item)}>Reply</button><button onClick={() => toggleBookmark(item)}>{item._microblog?.is_bookmark ? 'Bookmarked' : 'Bookmark'}</button>{item.url && <a href={item.url} target="_blank" rel="noreferrer">Original ↗</a>}<button onClick={() => openComposer(item)}>Quote</button></div></article>; })}{client && items.length === 0 && !busy && <div className="notice inline">{view === 'circle' ? (circle.length ? 'No Circle dents in this slice of the timeline yet.' : 'Your Circle is empty. Open a profile and add someone.') : profile ? 'No dents from this account are in the loaded timeline yet.' : 'Nothing here yet.'}</div>}{!conversation && sourceItems.length > 0 && ((profile?.hasMore ?? hasMore) ? <div className="load-more-wrap"><button className="load-more" onClick={loadOlder} disabled={loadingOlder || busy || Boolean(profile?.loading)}>{loadingOlder ? 'Loading older dents…' : 'Load older dents'}</button></div> : !profile?.loading && <div className="load-more-wrap"><span>{profile && !profile.isMicroblog ? 'Showing dents from your loaded timeline.' : 'You’ve reached the end.'}</span></div>)}</main>
    {replyingTo && <div className="reply-drawer" role="dialog" aria-modal="true" aria-label={`Reply to ${authorLabel(replyingTo)}`}><form onSubmit={submitReply}><div className="reply-head"><div><span className="eyebrow">Replying to</span><strong>{authorLabel(replyingTo)}</strong></div><button type="button" className="text-button" onClick={() => setReplyingTo(null)}>Close</button></div><blockquote>{displayText(replyingTo)}</blockquote><textarea value={replyText} onChange={event => setReplyText(event.target.value)} placeholder="Write a reply…" autoFocus/><button className="primary" type="submit" disabled={busy || !replyText.trim()}>{busy ? 'Sending…' : 'Send reply'}</button></form></div>}
    {composing && <div className="reply-drawer composer-drawer" role="dialog" aria-modal="true" aria-label={quotedItem ? 'Quote dent' : 'New dent'}><form onSubmit={submitMicropost}><div className="reply-head"><div><span className="eyebrow">Dent Hand</span><strong>{quotedItem ? 'Quote dent' : 'New dent'}</strong></div><button type="button" className="text-button" onClick={() => setComposing(false)}>Close</button></div>{quotedItem && <blockquote>{displayText(quotedItem)}<footer>— {authorLabel(quotedItem)}</footer></blockquote>}<p className="composer-note">Choose the destination explicitly. Dent Hand never falls back to Micro.blog’s current site.</p><label className="field-label" htmlFor="destination">Post to</label><select id="destination" value={selectedDestination} onChange={event => setSelectedDestination(event.target.value)} disabled={publishing}><option value="">Choose a blog…</option>{destinations.map(destination => <option key={destination.uid} value={destination.uid}>{destinationLabel(destination)}</option>)}</select><label className="field-label" htmlFor="micropost">{quotedItem ? 'Your comment (optional)' : 'Dent'}</label><textarea id="micropost" value={micropostText} onChange={event => setMicropostText(event.target.value)} placeholder={quotedItem ? 'Add a comment…' : 'What’s happening?'} autoFocus/><div className="composer-footer"><span>{micropostText.length.toLocaleString()} characters</span><button className="primary" type="submit" disabled={publishing || !selectedDestination || (!quotedItem && !micropostText.trim())}>{publishing ? 'Publishing…' : 'Publish dent'}</button></div>{composerError && <div className="composer-warning error" role="alert">{composerError}</div>}</form></div>}
  </div>;
}

createRoot(document.getElementById('social-root')!).render(<App />);