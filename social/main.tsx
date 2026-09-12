import React, { FormEvent, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MicroblogFeed, MicroblogItem, MicroblogSocialClient } from '../src/microblogSocial';
import './social.css';

type View = 'timeline' | 'bookmarks' | 'replies';

function displayText(item: MicroblogItem): string {
  if (item.content_text?.trim()) return item.content_text.trim();
  const html = item.content_html || '';
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent?.trim() || '';
}

function authorLabel(item: MicroblogItem): string {
  return item.author?.name || (item.author?.username ? `@${item.author.username}` : 'Micro.blog');
}

function App() {
  const storedToken = sessionStorage.getItem('microblog-social-token') || '';
  const [token, setToken] = useState(storedToken);
  const [connectedToken, setConnectedToken] = useState(storedToken);
  const [view, setView] = useState<View>('timeline');
  const [feed, setFeed] = useState<MicroblogFeed>({ items: [] });
  const [conversation, setConversation] = useState<MicroblogFeed | null>(null);
  const [conversationTitle, setConversationTitle] = useState('Conversation');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [replyingTo, setReplyingTo] = useState<MicroblogItem | null>(null);
  const [replyText, setReplyText] = useState('');
  const generationRef = useRef(0);

  const client = useMemo(
    () => connectedToken ? new MicroblogSocialClient({ token: connectedToken }) : null,
    [connectedToken],
  );

  async function load(nextView: View = view, tokenOverride?: string) {
    const credential = (tokenOverride ?? connectedToken).trim();
    if (!credential) {
      setError('Add your Micro.blog app token first.');
      return;
    }

    const requestGeneration = ++generationRef.current;
    const requestClient = new MicroblogSocialClient({ token: credential });
    setBusy(true);
    setError('');
    setConversation(null);
    try {
      const result = nextView === 'timeline'
        ? await requestClient.timeline({ count: 40 })
        : nextView === 'bookmarks'
          ? await requestClient.bookmarks({ count: 40 })
          : await requestClient.replies({ count: 40 });

      if (requestGeneration !== generationRef.current) return;
      setFeed(result);
      setView(nextView);

      if (tokenOverride !== undefined) {
        setConnectedToken(credential);
        sessionStorage.setItem('microblog-social-token', credential);
      }
    } catch (err) {
      if (requestGeneration !== generationRef.current) return;
      setError(err instanceof Error ? err.message : 'Could not load Micro.blog.');
    } finally {
      if (requestGeneration === generationRef.current) setBusy(false);
    }
  }

  async function openConversation(item: MicroblogItem) {
    if (!client) return;
    const requestGeneration = generationRef.current;
    setBusy(true);
    setError('');
    try {
      const result = await client.conversation(item.id);
      if (requestGeneration !== generationRef.current) return;
      setConversation(result);
      setConversationTitle(`Conversation with ${authorLabel(item)}`);
    } catch (err) {
      if (requestGeneration !== generationRef.current) return;
      setError(err instanceof Error ? err.message : 'Could not load the conversation.');
    } finally {
      if (requestGeneration === generationRef.current) setBusy(false);
    }
  }

  async function toggleBookmark(item: MicroblogItem) {
    if (!client) return;
    const requestGeneration = generationRef.current;
    setError('');
    try {
      if (item._microblog?.is_bookmark) {
        await client.unbookmark(item.id);
      } else {
        await client.bookmark(item.id);
      }
      if (requestGeneration !== generationRef.current) return;

      const updateItem = (existing: MicroblogItem): MicroblogItem => existing.id === item.id
        ? { ...existing, _microblog: { ...(existing._microblog || {}), is_bookmark: !item._microblog?.is_bookmark } }
        : existing;

      setFeed(current => ({ ...current, items: current.items.map(updateItem) }));
      setConversation(current => current ? ({ ...current, items: current.items.map(updateItem) }) : current);
    } catch (err) {
      if (requestGeneration !== generationRef.current) return;
      setError(err instanceof Error ? err.message : 'Bookmark action failed.');
    }
  }

  async function submitReply(event: FormEvent) {
    event.preventDefault();
    if (!client || !replyingTo || !replyText.trim()) return;
    const requestGeneration = generationRef.current;
    setBusy(true);
    setError('');
    try {
      await client.reply(replyingTo.id, replyText.trim());
      if (requestGeneration !== generationRef.current) return;
      const repliedTo = replyingTo;
      setReplyText('');
      setReplyingTo(null);
      if (conversation) await openConversation(repliedTo);
    } catch (err) {
      if (requestGeneration !== generationRef.current) return;
      setError(err instanceof Error ? err.message : 'Reply failed.');
    } finally {
      if (requestGeneration === generationRef.current) setBusy(false);
    }
  }

  function forgetToken() {
    generationRef.current += 1;
    sessionStorage.removeItem('microblog-social-token');
    setToken('');
    setConnectedToken('');
    setFeed({ items: [] });
    setConversation(null);
    setReplyingTo(null);
    setReplyText('');
    setBusy(false);
    setError('');
  }

  const items = conversation?.items || feed.items || [];

  return (
    <div className="social-shell">
      <header className="social-header">
        <div>
          <a className="back-link" href="/">Helping Hand</a>
          <p className="eyebrow">Micro.blog social preview</p>
          <h1>{conversation ? conversationTitle : 'Timeline'}</h1>
          <p className="lede">Read, follow conversations, bookmark and reply. Longform publishing stays elsewhere.</p>
        </div>
        <div className="token-card">
          <label htmlFor="token">Micro.blog app token</label>
          <div className="token-row">
            <input
              id="token"
              type="password"
              value={token}
              onChange={event => setToken(event.target.value)}
              placeholder="Paste token"
              autoComplete="off"
            />
            <button onClick={() => load(view, token)} disabled={busy || !token.trim()}>{busy ? 'Loading…' : 'Connect'}</button>
          </div>
          <div className="token-note">Kept in this browser session only. <button className="text-button" onClick={forgetToken}>Forget token</button></div>
        </div>
      </header>

      <nav className="tabs" aria-label="Social views">
        <button className={!conversation && view === 'timeline' ? 'active' : ''} onClick={() => load('timeline')} disabled={!client}>Timeline</button>
        <button className={!conversation && view === 'bookmarks' ? 'active' : ''} onClick={() => load('bookmarks')} disabled={!client}>Bookmarks</button>
        <button className={!conversation && view === 'replies' ? 'active' : ''} onClick={() => load('replies')} disabled={!client}>Replies</button>
        {conversation && <button className="active" onClick={() => setConversation(null)}>← Back to {view}</button>}
      </nav>

      {error && <div className="notice error" role="alert">{error}</div>}
      {!client && !error && <div className="notice">Add your Micro.blog app token to load the timeline.</div>}
      {client && items.length === 0 && !busy && !error && <div className="notice">Connected. Choose a view above.</div>}

      <main className="feed" aria-live="polite">
        {items.map(item => (
          <article className="post-card" key={`${conversation ? 'c' : view}-${item.id}`}>
            <div className="post-head">
              {item.author?.avatar ? <img className="avatar" src={item.author.avatar} alt="" /> : <div className="avatar fallback" aria-hidden="true" />}
              <div>
                <strong>{authorLabel(item)}</strong>
                <div className="meta">
                  {item.author?.username && <span>@{item.author.username}</span>}
                  {item._microblog?.date_relative && <span>{item._microblog.date_relative}</span>}
                </div>
              </div>
            </div>
            <p className="post-text">{displayText(item)}</p>
            <div className="actions">
              <button onClick={() => openConversation(item)}>Conversation</button>
              <button onClick={() => setReplyingTo(item)}>Reply</button>
              <button onClick={() => toggleBookmark(item)}>{item._microblog?.is_bookmark ? 'Bookmarked' : 'Bookmark'}</button>
              {item.url && <a href={item.url} target="_blank" rel="noreferrer">Original ↗</a>}
              <button disabled title="Safe quote-post publishing is the next plumbing layer">Quote</button>
            </div>
          </article>
        ))}
      </main>

      {replyingTo && (
        <div className="reply-drawer" role="dialog" aria-modal="true" aria-label={`Reply to ${authorLabel(replyingTo)}`}>
          <form onSubmit={submitReply}>
            <div className="reply-head">
              <div><span className="eyebrow">Replying to</span><strong>{authorLabel(replyingTo)}</strong></div>
              <button type="button" className="text-button" onClick={() => setReplyingTo(null)}>Close</button>
            </div>
            <blockquote>{displayText(replyingTo)}</blockquote>
            <textarea value={replyText} onChange={event => setReplyText(event.target.value)} placeholder="Write a reply…" autoFocus />
            <button className="primary" type="submit" disabled={busy || !replyText.trim()}>{busy ? 'Sending…' : 'Send reply'}</button>
          </form>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('social-root')!).render(<App />);
