import React, { FormEvent, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MicroblogSocialClient } from '../src/microblogSocial';
import { MastodonSocialClient } from '../src/mastodonSocial';
import './social.css';

type ProviderId = 'microblog' | 'mastodon';

const PROVIDER_KEY = 'dent-hand-provider';

function selectedProvider(): ProviderId | null {
  const query = new URLSearchParams(window.location.search).get('provider');
  if (query === 'microblog' || query === 'mastodon') return query;
  const stored = localStorage.getItem(PROVIDER_KEY);
  return stored === 'microblog' || stored === 'mastodon' ? stored : null;
}

async function hasSession(provider: ProviderId): Promise<boolean> {
  try {
    const client = provider === 'mastodon' ? new MastodonSocialClient() : new MicroblogSocialClient();
    await client.account();
    return true;
  } catch {
    return false;
  }
}

function remember(provider: ProviderId) {
  localStorage.setItem(PROVIDER_KEY, provider);
}

function clearQuery() {
  if (window.location.search) window.history.replaceState({}, '', window.location.pathname + window.location.hash);
}

function Chooser() {
  const [instance, setInstance] = useState('');
  const [error, setError] = useState('');
  const authResult = new URLSearchParams(window.location.search).get('auth');

  useEffect(() => {
    if (authResult === 'error') setError('Sign-in was not completed. Please try again.');
  }, []);

  function connectMicroblog() {
    remember('microblog');
    window.location.assign('/api/microblog/auth?op=start');
  }

  function connectMastodon(event: FormEvent) {
    event.preventDefault();
    const server = instance.trim();
    if (!server) {
      setError('Enter your Mastodon or Fediverse server first.');
      return;
    }
    remember('mastodon');
    window.location.assign(`/api/mastodon/auth?op=start&instance=${encodeURIComponent(server)}`);
  }

  return <div className="social-shell">
    <header className="social-header">
      <div>
        <a className="back-link" href="/">Helping Hand</a>
        <p className="eyebrow">Dent Hand</p>
        <h1>Connect an account</h1>
        <p className="lede">A chronological social-web client. Pick the account that should power your timeline.</p>
      </div>
      <div className="token-card">
        <strong>Micro.blog</strong>
        <div className="token-note">Secure IndieAuth. Your access token stays encrypted on the server.</div>
        <div className="token-row"><button onClick={connectMicroblog}>Connect Micro.blog</button></div>
      </div>
    </header>

    <main className="feed">
      {error && <div className="notice error" role="alert">{error}</div>}
      <section className="profile-card">
        <div className="profile-main">
          <div>
            <p className="eyebrow">Mastodon / compatible server</p>
            <h2>Connect your Fediverse account</h2>
            <p>Enter the server where your account lives, for example <code>mastodon.social</code>.</p>
          </div>
        </div>
        <form className="profile-actions" onSubmit={connectMastodon}>
          <input
            value={instance}
            onChange={event => setInstance(event.target.value)}
            placeholder="mastodon.social"
            aria-label="Mastodon server"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button type="submit">Connect Mastodon / Fediverse</button>
        </form>
      </section>
      <div className="notice">Dent Hand uses the Mastodon-compatible client API here. ActivityPub federation alone does not guarantee client compatibility.</div>
    </main>
  </div>;
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const forceChoose = params.get('choose') === '1';
  const preferred = selectedProvider();

  if (!forceChoose && preferred && await hasSession(preferred)) {
    clearQuery();
    if (preferred === 'mastodon') await import('./mastodon');
    else await import('./main');
    return;
  }

  if (!forceChoose && !preferred) {
    if (await hasSession('microblog')) {
      remember('microblog');
      clearQuery();
      await import('./main');
      return;
    }
    if (await hasSession('mastodon')) {
      remember('mastodon');
      clearQuery();
      await import('./mastodon');
      return;
    }
  }

  document.querySelector<HTMLElement>('.my-posts-shortcut')?.style.setProperty('display', 'none');
  createRoot(document.getElementById('social-root')!).render(<Chooser />);
}

void boot();
