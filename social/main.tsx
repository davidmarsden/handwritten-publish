import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MicroblogAccount, MicroblogAuthor, MicroblogDestination, MicroblogFeed, MicroblogItem, MicroblogSocialClient } from '../src/microblogSocial';
import { fetchMastodonProfile, isMastodonProfileUrl } from '../src/mastodonPublic';
import './social.css';
import { RichContent } from './RichContent';

type View = 'timeline' | 'circle' | 'bookmarks' | 'mentions' | 'replies';
type PublishNotice = { message: string; url?: string | null } | null;
type CirclePerson = { id: string; name: string; username?: string; url?: string; avatar?: string };
type ComposerDraft = { text: string; destination?: string };
type ProfileSource = 'microblog' | 'mastodon' | 'timeline';
type ProfileState = {
  person: CirclePerson;
  feed: MicroblogFeed;
  hasMore: boolean;
  loading: boolean;
  source: ProfileSource;
  loadError?: string;
} | null;

const PAGE_SIZE = 40;
const CIRCLE_KEY = 'dent-hand-circle';
const DRAFT_KEY = 'dent-hand-draft';

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
  try { return new URL(value).hostname.toLowerCase() === 'micro.blog'; } catch { return false; }
}

function isRemoteMastodonItem(item: MicroblogItem): boolean {
  return item._microblog?.source === 'mastodon';
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

function personFromItem(item: MicroblogItem): CirclePerson | null { return personFromAuthor(item.author); }

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
  } catch { return []; }
}

function readDraft(): ComposerDraft {
  try {
    const value = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}') as Partial<ComposerDraft>;
    return {
      text: typeof value.text === 'string' ? value.text : '',
      ...(typeof value.destination === 'string' ? { destination: value.destination } : {}),
    };
  } catch { return { text: '' }; }
}

function saveDraft(text: string, destination?: string) {
  if (!text && !destination) {
    sessionStorage.removeItem(DRAFT_KEY);
    return;
  }
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ text, ...(destination ? { destination } : {}) }));
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
  const [account, setAccount] = useState<MicroblogAccount | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [view, setView] = useState<View>('timeline');
  const [feed, setFeed] = useState<MicroblogFeed>({ items: [] });
  const [conversation, setConversation] = useState<MicroblogFeed | null>(null);
  const [conversationTitle, setConversationTitle] = useState('Conversation');
  const [profile, setProfile] = useState<ProfileState>(null);
  const [circle, setCircle] = useState<CirclePerson[]>(readCircle);
  const [busy, setBusy] = useState(false);
  const [checkingNew, setCheckingNew] = useState(false);
  const [pendingNew, setPendingNew] = useState<MicroblogItem[]>([]);
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
  const refreshRequestRef = useRef(0);
  const profileCacheRef = useRef(new Map<string, MicroblogFeed>());

  const client = useMemo(() => new MicroblogSocialClient(), []);
  const circleSet = useMemo(() => new Set(circle.map(person => person.id)), [circle]);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/dent-hand-sw.js', { scope: '/social/', updateViaCache: 'none' }).catch(() => undefined);
    void restoreSession();
  }, []);

  useEffect(() => {
    if (!authenticated || view !== 'timeline' || conversation || profile || feed.items.length === 0) return;
    const timer = window.setInterval(() => { void checkForNew(); }, 60000);
    return () => window.clearInterval(timer);
  }, [authenticated, view, conversation, profile, feed.items[0]?.id]);

  async function restoreSession() {
    setAuthChecking(true);
    const authResult = new URLSearchParams(window.location.search).get('auth');
    try {
      const identity = await client.account();
      setAccount(identity);
      setAuthenticated(true);
      await load('timeline', true);
    } catch {
      setAccount(null);
      setAuthenticated(false);
      if (authResult === 'error') setError('Micro.blog sign-in was not completed. Please try again.');
    } finally {
      setAuthChecking(false);
      if (authResult) window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
  }

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
    if (nextView === 'mentions') return requestClient.mentions(paging);
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
      setDestinations([]); setSelectedDestination('');
      setComposerError(err instanceof Error ? err.message : 'Could not load destinations.');
    }
  }

  async function load(nextView: View = view, allowBeforeAuthState = false) {
    if (!authenticated && !allowBeforeAuthState) { setError('Connect Dent Hand to Micro.blog first.'); return; }
    const generation = ++generationRef.current;
    setBusy(true); setError(''); setConversation(null); setProfile(null); setPublishNotice(null); setPendingNew([]);
    try {
      const result = await feedFor(client, nextView);
      if (generation !== generationRef.current) return;
      setFeed(result); setHasMore(result.items.length >= PAGE_SIZE); setView(nextView);
      if (destinations.length === 0) await refreshDestinations(client, generation);
    } catch (err) {
      if (generation === generationRef.current) {
        setError(nextView === 'mentions'
          ? 'Mentions are temporarily unavailable from Micro.blog. Timeline, Circle, Bookmarks and Replies still work.'
          : err instanceof Error ? err.message : 'Could not load Micro.blog.');
      }
    } finally { if (generation === generationRef.current) setBusy(false); }
  }

  async function checkForNew() {
    if (!authenticated || checkingNew || conversation || profile || view !== 'timeline') return;
    const firstId = feed.items[0]?.id;
    if (!firstId) { await load('timeline'); return; }
    const generation = generationRef.current;
    const refreshRequest = ++refreshRequestRef.current;
    setCheckingNew(true); setError('');
    try {
      const result = await client.timeline({ count: PAGE_SIZE, sinceId: firstId });
      if (generation !== generationRef.current) return;
      const existing = new Set(feed.items.map(item => item.id));
      setPendingNew(current => {
        const seen = new Set([...existing, ...current.map(item => item.id)]);
        return [...result.items.filter(item => !seen.has(item.id)), ...current];
      });
    } catch (err) {
      if (generation === generationRef.current) setError(err instanceof Error ? err.message : 'Could not check for new dents.');
    } finally {
      if (refreshRequest === refreshRequestRef.current) setCheckingNew(false);
    }
  }

  function revealNew() {
    if (!pendingNew.length) return;
    setFeed(current => {
      const existing = new Set(current.items.map(item => item.id));
      return { ...current, items: [...pendingNew.filter(item => !existing.has(item.id)), ...current.items] };
    });
    setPendingNew([]);
    window.requestAnimationFrame(() => document.querySelector('.feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function openProfile(person: CirclePerson) {
    if (!authenticated) return;
    const generation = ++generationRef.current;
    setError(''); setConversation(null);
    const localFeed: MicroblogFeed = { items: localPostsFor(person) };
    const source: ProfileSource = isMicroblogUrl(person.url) || (!person.url && Boolean(person.username))
      ? 'microblog'
      : isMastodonProfileUrl(person.url)
        ? 'mastodon'
        : 'timeline';
    const cached = profileCacheRef.current.get(person.id);
    setProfile({ person, feed: cached || localFeed, hasMore: cached ? cached.items.length >= PAGE_SIZE : false, loading: Boolean(source !== 'timeline' && !cached), source });
    if (cached || source === 'timeline') return;

    if (source === 'microblog' && person.username) {
      client.profile(person.username, { count: PAGE_SIZE }).then(result => {
        if (generation !== generationRef.current) return;
        profileCacheRef.current.set(person.id, result);
        setProfile(current => current?.person.id === person.id ? { ...current, feed: result, hasMore: result.items.length >= PAGE_SIZE, loading: false, loadError: undefined } : current);
      }).catch(err => {
        if (generation !== generationRef.current) return;
        setProfile(current => current?.person.id === person.id ? { ...current, loading: false, loadError: err instanceof Error ? err.message : 'Could not load full Micro.blog history.' } : current);
      });
      return;
    }

    if (source === 'mastodon' && person.url) {
      fetchMastodonProfile(person.url, { limit: PAGE_SIZE }).then(result => {
        if (generation !== generationRef.current) return;
        const enrichedPerson = { ...person, name: result.account.name || person.name, username: result.account.username || person.username, avatar: result.account.avatar || person.avatar, url: result.account.url || person.url };
        profileCacheRef.current.set(person.id, result.feed);
        setProfile(current => current?.person.id === person.id ? { ...current, person: enrichedPerson, feed: result.feed, hasMore: result.feed.items.length >= PAGE_SIZE, loading: false, loadError: undefined } : current);
      }).catch(err => {
        if (generation !== generationRef.current) return;
        setProfile(current => current?.person.id === person.id ? { ...current, loading: false, loadError: err instanceof Error ? err.message : 'Could not load public Mastodon history.' } : current);
      });
    }
  }

  function openProfileItem(item: MicroblogItem) { const person = personFromItem(item); if (person) openProfile(person); }

  async function loadOlder() {
    if (!authenticated || conversation || loadingOlder) return;
    const sourceItems = profile?.feed.items || feed.items;
    const lastId = sourceItems[sourceItems.length - 1]?.id;
    const canLoad = profile ? profile.hasMore : hasMore;
    if (!lastId || !canLoad) return;
    const generation = generationRef.current;
    setLoadingOlder(true); setError('');
    try {
      let result: MicroblogFeed;
      if (profile?.source === 'microblog' && profile.person.username) result = await client.profile(profile.person.username, { count: PAGE_SIZE, beforeId: lastId });
      else if (profile?.source === 'mastodon' && profile.person.url) result = (await fetchMastodonProfile(profile.person.url, { limit: PAGE_SIZE, maxId: lastId })).feed;
      else result = await feedFor(client, view, lastId);
      if (generation !== generationRef.current) return;
      if (profile) {
        setProfile(current => current ? { ...current, feed: { ...current.feed, items: [...current.feed.items, ...result.items.filter(item => !current.feed.items.some(existing => existing.id === item.id))] }, hasMore: result.items.length >= PAGE_SIZE } : current);
      } else {
        setFeed(current => ({ ...current, items: [...current.items, ...result.items.filter(item => !current.items.some(existing => existing.id === item.id))] }));
        setHasMore(result.items.length >= PAGE_SIZE);
      }
    } catch (err) {
      if (generation === generationRef.current) setError(view === 'mentions'
        ? 'Mentions are temporarily unavailable from Micro.blog. Timeline, Circle, Bookmarks and Replies still work.'
        : err instanceof Error ? err.message : 'Could not load older dents.');
    } finally { if (generation === generationRef.current) setLoadingOlder(false); }
  }

  async function openConversation(item: MicroblogItem) {
    if (!authenticated) return;
    if (isRemoteMastodonItem(item)) {
      setError('This is a public Mastodon status. Open the original to view its remote conversation.');
      return;
    }
    const generation = ++generationRef.current;
    setBusy(true); setError('');
    try {
      const result = await client.conversation(item.id);
      if (generation !== generationRef.current) return;
      setConversation(result); setConversationTitle(`Conversation with ${authorLabel(item)}`);
    } catch (err) { if (generation === generationRef.current) setError(err instanceof Error ? err.message : 'Could not load conversation.'); }
    finally { if (generation === generationRef.current) setBusy(false); }
  }

  async function toggleBookmark(item: MicroblogItem) {
    if (!authenticated) return;
    if (isRemoteMastodonItem(item)) {
      setError('Remote Mastodon statuses are read-only while Dent Hand is connected through Micro.blog.');
      return;
    }
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
    if (!authenticated || !replyingTo || !replyText.trim()) return;
    if (isRemoteMastodonItem(replyingTo)) {
      setError('Remote Mastodon statuses are read-only while Dent Hand is connected through Micro.blog.');
      setReplyingTo(null);
      return;
    }
    setBusy(true); setError('');
    try {
      await client.reply(replyingTo.id, replyText.trim());
      const repliedTo = replyingTo; setReplyText(''); setReplyingTo(null);
      if (conversation) await openConversation(repliedTo);
    } catch (err) { setError(err instanceof Error ? err.message : 'Reply failed.'); }
    finally { setBusy(false); }
  }

  function openComposer(item?: MicroblogItem) {
    if (!authenticated) return;
    setComposerError(''); setPublishNotice(null); setQuotedItem(item || null);
    if (item) {
      setMicropostText('');
      setSelectedDestination(destinations.length === 1 ? destinations[0].uid : '');
    } else {
      const draft = readDraft();
      setMicropostText(draft.text);
      setSelectedDestination(draft.destination && destinations.some(destination => destination.uid === draft.destination)
        ? draft.destination
        : destinations.length === 1 ? destinations[0].uid : '');
    }
    setComposing(true);
  }

  function updateMicropostText(value: string) {
    setMicropostText(value);
    if (!quotedItem) saveDraft(value, selectedDestination);
  }

  function updateDestination(value: string) {
    setSelectedDestination(value);
    if (!quotedItem) saveDraft(micropostText, value);
  }

  async function submitMicropost(event: FormEvent) {
    event.preventDefault();
    if (!authenticated || !selectedDestination) return;
    const wasQuote = Boolean(quotedItem);
    const body = quotedItem ? [micropostText.trim(), quoteMarkdown(quotedItem)].filter(Boolean).join('\n\n') : micropostText.trim();
    if (!body) return;
    setPublishing(true); setComposerError('');
    try {
      const result = await client.micropost(body, selectedDestination);
      const target = destinations.find(destination => destination.uid === selectedDestination);
      if (!wasQuote) sessionStorage.removeItem(DRAFT_KEY);
      setComposing(false); setQuotedItem(null); setMicropostText(''); setSelectedDestination(destinations.length === 1 ? destinations[0].uid : '');
      setPublishNotice({ message: `Published to ${target?.name || selectedDestination}.`, url: result.preview || result.url });
    } catch (err) { setComposerError(err instanceof Error ? err.message : 'Could not publish dent.'); }
    finally { setPublishing(false); }
  }

  function toggleCircle(person: CirclePerson) { saveCircle(circleSet.has(person.id) ? circle.filter(item => item.id !== person.id) : [...circle, person]); }

  async function signOut() {
    generationRef.current += 1;
    refreshRequestRef.current += 1;
    setError('');
    try {
      const response = await fetch('/api/microblog/auth?op=logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Sign out failed (${response.status}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out. Your session is still active; please try again.');
      return;
    }
    setAccount(null); setAuthenticated(false); setFeed({ items: [] }); setConversation(null); setProfile(null); setPendingNew([]);
    setReplyingTo(null); setReplyText(''); setDestinations([]); setSelectedDestination(''); setComposing(false);
    setQuotedItem(null); setMicropostText(''); setComposerError(''); setPublishNotice(null);
    setBusy(false); setCheckingNew(false); setLoadingOlder(false); setPublishing(false); setError('');
    profileCacheRef.current.clear();
  }

  const sourceItems = conversation?.items || profile?.feed.items || feed.items || [];
  const items = !conversation && !profile && view === 'circle'
    ? sourceItems.filter(item => { const person = personFromItem(item); return person ? circleSet.has(person.id) : false; })
    : sourceItems;
  const headerTitle = conversation ? conversationTitle : profile ? profile.person.name : view === 'circle' ? 'Circle' : view === 'bookmarks' ? 'Bookmarks' : view === 'mentions' ? 'Mentions' : view === 'replies' ? 'Replies' : 'Timeline';

  return <div className="social-shell">
    <header className="social-header"><div><a className="back-link" href="/">Helping Hand</a><p className="eyebrow">Dent Hand · Micro.blog</p><h1>{headerTitle}</h1><p className="lede">Chronological dents from people you chose. Read, reply, bookmark and quote. No algorithm required.</p></div><div className="token-card">{authChecking ? <div className="token-note">Checking Micro.blog sign-in…</div> : authenticated ? <><strong>{account?.name || `@${account?.username}`}</strong><div className="token-note">{account?.username && <>@{account.username} · </>}Connected securely. Your Micro.blog access token stays on the server. <button className="text-button" onClick={() => void signOut()}>Sign out</button></div></> : <><strong>Connect Micro.blog</strong><div className="token-note">Sign in on Micro.blog and approve Dent Hand. No app token to copy or store in this browser.</div><div className="token-row"><button onClick={() => window.location.assign('/api/microblog/auth?op=start')}>Connect Micro.blog</button></div></>}</div></header>
    <nav className="tabs" aria-label="Dent Hand views"><button className={!conversation && !profile && view === 'timeline' ? 'active' : ''} onClick={() => load('timeline')} disabled={!authenticated}>Timeline</button><button className={!conversation && !profile && view === 'circle' ? 'active' : ''} onClick={() => load('circle')} disabled={!authenticated}>Circle</button><button className={!conversation && !profile && view === 'bookmarks' ? 'active' : ''} onClick={() => load('bookmarks')} disabled={!authenticated}>Bookmarks</button><button className={!conversation && !profile && view === 'mentions' ? 'active' : ''} onClick={() => load('mentions')} disabled={!authenticated}>Mentions</button><button className={!conversation && !profile && view === 'replies' ? 'active' : ''} onClick={() => load('replies')} disabled={!authenticated}>Replies</button>{!conversation && !profile && view === 'timeline' && <button className="refresh-button" onClick={() => void checkForNew()} disabled={!authenticated || checkingNew}>{checkingNew ? 'Checking…' : 'Refresh'}</button>}{(conversation || profile) && <button className="active" onClick={() => conversation ? setConversation(null) : setProfile(null)}>← Back</button>}<button className="compose-launch" onClick={() => openComposer()} disabled={!authenticated}>+ New dent</button></nav>
    {error && <div className="notice error" role="alert">{error}</div>}{publishNotice && <div className="notice success" role="status">{publishNotice.message} {publishNotice.url && <a href={publishNotice.url} target="_blank" rel="noreferrer">View dent ↗</a>}</div>}{!authenticated && !authChecking && !error && <div className="notice">Connect your Micro.blog account to load your timeline.</div>}
    {!conversation && !profile && view === 'timeline' && pendingNew.length > 0 && <div className="new-dents-wrap"><button className="new-dents-button" onClick={revealNew}>{pendingNew.length.toLocaleString()} new {pendingNew.length === 1 ? 'dent' : 'dents'} ↑</button></div>}
    {profile && <section className="profile-card"><div className="profile-main">{profile.person.avatar && <img className="profile-avatar" src={profile.person.avatar} alt=""/>}<div><p className="eyebrow">Profile</p><h2>{profile.person.name}</h2>{profile.person.username && <p>@{profile.person.username}</p>}{profile.loading && <p className="profile-status">{profile.source === 'mastodon' ? 'Loading public Mastodon history…' : 'Loading full Micro.blog history…'}</p>}{profile.loadError && <p className="profile-status">Showing dents already in your timeline.</p>}</div></div><div className="profile-actions"><button className="circle-toggle" onClick={() => toggleCircle(profile.person)}>{circleSet.has(profile.person.id) ? '★ In Circle' : '☆ Add to Circle'}</button>{profile.person.url && <a className="profile-link" href={profile.person.url} target="_blank" rel="noreferrer">Open profile ↗</a>}</div></section>}
    {!conversation && !profile && view === 'circle' && <section className="circle-bar"><strong>Circle</strong>{circle.length ? circle.map(person => <button key={person.id} onClick={() => openProfile(person)}>{person.name}</button>) : <span>Add people from their profiles. Your Circle stays on this device.</span>}</section>}
    <main className="feed" aria-live="polite">{items.map(item => { const person = personFromItem(item); const remoteMastodon = isRemoteMastodonItem(item); return <article className="post-card" key={`${conversation ? 'c' : profile ? 'p' : view}-${item.id}`}><button className="author-button" onClick={() => person && openProfileItem(item)} disabled={!person}>{item.author?.avatar ? <img className="avatar" src={item.author.avatar} alt=""/> : <span className="avatar fallback"/>}<span><strong>{authorLabel(item)}</strong><span className="meta">{item.author?.username && <span>@{item.author.username}</span>}{item._microblog?.date_relative && <span>{item._microblog.date_relative}</span>}</span></span></button><RichContent item={item}/><div className="actions">{!remoteMastodon && <button onClick={() => openConversation(item)}>Conversation</button>}{!remoteMastodon && <button onClick={() => setReplyingTo(item)}>Reply</button>}{!remoteMastodon && <button onClick={() => toggleBookmark(item)}>{item._microblog?.is_bookmark ? 'Bookmarked' : 'Bookmark'}</button>}{item.url && <a href={item.url} target="_blank" rel="noreferrer">Original ↗</a>}<button onClick={() => openComposer(item)}>Quote</button></div></article>; })}{authenticated && items.length === 0 && !busy && <div className="notice inline">{view === 'circle' ? (circle.length ? 'No Circle dents in this slice of the timeline yet.' : 'Your Circle is empty. Open a profile and add someone.') : profile ? 'No dents from this account are in the loaded timeline yet.' : 'Nothing here yet.'}</div>}{!conversation && sourceItems.length > 0 && ((profile?.hasMore ?? hasMore) ? <div className="load-more-wrap"><button className="load-more" onClick={loadOlder} disabled={loadingOlder || busy || Boolean(profile?.loading)}>{loadingOlder ? 'Loading older dents…' : 'Load older dents'}</button></div> : !profile?.loading && <div className="load-more-wrap"><span>{profile && (profile.source === 'timeline' || profile.loadError) ? 'Showing dents from your loaded timeline.' : 'You’ve reached the end.'}</span></div>)}</main>
    {replyingTo && <div className="reply-drawer" role="dialog" aria-modal="true" aria-label={`Reply to ${authorLabel(replyingTo)}`}><form onSubmit={submitReply}><div className="reply-head"><div><span className="eyebrow">Replying to</span><strong>{authorLabel(replyingTo)}</strong></div><button type="button" className="text-button" onClick={() => setReplyingTo(null)}>Close</button></div><blockquote>{displayText(replyingTo)}</blockquote><textarea value={replyText} onChange={event => setReplyText(event.target.value)} placeholder="Write a reply…" autoFocus/><button className="primary" type="submit" disabled={busy || !replyText.trim()}>{busy ? 'Sending…' : 'Send reply'}</button></form></div>}
    {composing && <div className="reply-drawer composer-drawer" role="dialog" aria-modal="true" aria-label={quotedItem ? 'Quote dent' : 'New dent'}><form onSubmit={submitMicropost}><div className="reply-head"><div><span className="eyebrow">Dent Hand</span><strong>{quotedItem ? 'Quote dent' : 'New dent'}</strong></div><button type="button" className="text-button" onClick={() => setComposing(false)}>Close</button></div>{quotedItem && <blockquote>{displayText(quotedItem)}<footer>— {authorLabel(quotedItem)}</footer></blockquote>}<p className="composer-note">Choose the destination explicitly. Dent Hand never falls back to Micro.blog’s current site.</p><label className="field-label" htmlFor="destination">Post to</label><select id="destination" value={selectedDestination} onChange={event => updateDestination(event.target.value)} disabled={publishing}><option value="">Choose a blog…</option>{destinations.map(destination => <option key={destination.uid} value={destination.uid}>{destinationLabel(destination)}</option>)}</select><label className="field-label" htmlFor="micropost">{quotedItem ? 'Your comment (optional)' : 'Dent'}</label><textarea id="micropost" value={micropostText} onChange={event => updateMicropostText(event.target.value)} placeholder={quotedItem ? 'Add a comment…' : 'What’s happening?'} autoFocus/>{!quotedItem && micropostText && <p className="draft-note">Draft saved for this browser session.</p>}<div className="composer-footer"><span>{micropostText.length.toLocaleString()} characters</span><button className="primary" type="submit" disabled={publishing || !selectedDestination || (!quotedItem && !micropostText.trim())}>{publishing ? 'Publishing…' : 'Publish dent'}</button></div>{composerError && <div className="composer-warning error" role="alert">{composerError}</div>}</form></div>}
  </div>;
}

createRoot(document.getElementById('social-root')!).render(<App />);
