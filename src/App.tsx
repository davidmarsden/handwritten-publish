import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { buildBundle, downloadBlob, readBundle } from './bundle';
import { documentPages, importPngFiles, type ImportedPage } from './importPng';
import {
  createMicroblogDraft,
  fetchMicroblogConfig,
  type MicroblogConfig,
  uploadMicroblogPage,
} from './microblog';
import { createDocument, type HandwrittenDocument } from './model';
import { clearDraft, loadDraft, saveDraft } from './persistence';
import './styles.css';

function revokePages(pages: ImportedPage[]) {
  pages.forEach(page => URL.revokeObjectURL(page.previewUrl));
}

export default function App() {
  const [title, setTitle] = useState('Untitled handwritten post');
  const [pages, setPages] = useState<ImportedPage[]>([]);
  const [transcript, setTranscript] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Loading local draft…');
  const [hydrated, setHydrated] = useState(false);
  const [baseDocument, setBaseDocument] = useState<HandwrittenDocument>(() => createDocument('Untitled handwritten post'));
  const [microblogToken, setMicroblogToken] = useState('');
  const [microblogConfig, setMicroblogConfig] = useState<MicroblogConfig | null>(null);
  const [microblogDestination, setMicroblogDestination] = useState('');

  const document = useMemo(() => ({
    ...baseDocument,
    title,
    transcript: transcript || undefined,
    pages: documentPages(pages),
  }), [baseDocument, title, transcript, pages]);

  function markEdited() {
    setBaseDocument(current => ({ ...current, updatedAt: new Date().toISOString() }));
  }

  useEffect(() => {
    let cancelled = false;
    loadDraft()
      .then(saved => {
        if (cancelled) {
          if (saved) revokePages(saved.pages);
          return;
        }
        if (saved) {
          setBaseDocument(saved.document);
          setTitle(saved.document.title);
          setTranscript(saved.document.transcript ?? '');
          setPages(saved.pages);
          setStatus('Local draft restored.');
        } else {
          setStatus('Ready.');
        }
      })
      .catch(error => setStatus(error instanceof Error ? error.message : 'Could not restore local draft.'))
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      saveDraft(document, pages)
        .then(() => setStatus('Saved locally.'))
        .catch(error => setStatus(error instanceof Error ? error.message : 'Could not save locally.'));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [hydrated, document, pages]);

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    if (!selected.length) return;
    setBusy(true);
    try {
      const imported = await importPngFiles(selected);
      revokePages(pages);
      setPages(imported);
      markEdited();
      setStatus(`${imported.length} PNG page${imported.length === 1 ? '' : 's'} imported.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import PNG pages.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  async function onBundle(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const imported = await readBundle(file);
      revokePages(pages);
      setBaseDocument(imported.document);
      setTitle(imported.document.title);
      setTranscript(imported.document.transcript ?? '');
      setPages(imported.pages);
      setStatus(`Opened ${file.name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not open .hwpublish bundle.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= pages.length) return;
    setPages(current => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    markEdited();
  }

  async function exportBundle() {
    const blob = await buildBundle(document, pages);
    const safeTitle = title.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'handwritten-post';
    downloadBlob(blob, `${safeTitle}.hwpublish`);
    setStatus('Portable bundle exported.');
  }

  async function newDocument() {
    revokePages(pages);
    const fresh = createDocument('Untitled handwritten post');
    setBaseDocument(fresh);
    setTitle(fresh.title);
    setTranscript('');
    setPages([]);
    await clearDraft();
    setStatus('New local document started.');
  }

  async function connectMicroblog() {
    if (!microblogToken.trim()) return;
    setBusy(true);
    setStatus('Connecting to Micro.blog…');
    try {
      const config = await fetchMicroblogConfig(microblogToken);
      setMicroblogConfig(config);
      const remembered = baseDocument.publishing?.microblog?.destination;
      const defaultDestination = remembered && config.destinations.some(destination => destination.uid === remembered)
        ? remembered
        : config.destinations[0]?.uid ?? '';
      setMicroblogDestination(defaultDestination);
      setStatus(`Micro.blog connected${config.destinations.length ? ` — ${config.destinations.length} blog${config.destinations.length === 1 ? '' : 's'} available.` : '.'}`);
    } catch (error) {
      setMicroblogConfig(null);
      setStatus(error instanceof Error ? error.message : 'Could not connect to Micro.blog.');
    } finally {
      setBusy(false);
    }
  }

  async function publishMicroblogDraft() {
    const normalizedTitle = title.trim();
    if (!microblogConfig || !microblogToken.trim() || !pages.length) return;
    if (!normalizedTitle) {
      setStatus('Add a post title before creating a Micro.blog draft.');
      return;
    }

    setBusy(true);
    try {
      const mediaUrls: string[] = [];
      for (let index = 0; index < pages.length; index += 1) {
        setStatus(`Uploading handwritten page ${index + 1} of ${pages.length} to Micro.blog…`);
        mediaUrls.push(await uploadMicroblogPage(microblogConfig.mediaEndpoint, microblogToken, pages[index]));
      }
      setStatus('Creating private Micro.blog draft…');
      const draft = await createMicroblogDraft(
        microblogToken,
        microblogDestination,
        { ...document, title: normalizedTitle },
        mediaUrls,
      );
      setBaseDocument(current => ({
        ...current,
        publishing: {
          ...current.publishing,
          microblog: draft,
        },
      }));
      setStatus('Micro.blog draft created. Open the preview to review and publish it.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create the Micro.blog draft.');
    } finally {
      setBusy(false);
    }
  }

  const controlsDisabled = busy || !hydrated;
  const existingMicroblogDraft = baseDocument.publishing?.microblog;
  const hasValidTitle = Boolean(title.trim());

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Handwritten Publish</p>
        <h1>Your handwriting, still handwriting.</h1>
        <p>Turn reMarkable PNG exports into one portable, web-ready document without flattening away what makes them yours.</p>
      </header>

      <section className="panel controls">
        <label>
          <span>Post title</span>
          <input
            value={title}
            disabled={controlsDisabled}
            onChange={event => {
              setTitle(event.target.value);
              markEdited();
            }}
          />
        </label>
        <label className="fileButton">
          {busy ? 'Reading…' : !hydrated ? 'Restoring local draft…' : pages.length ? 'Replace PNG pages' : 'Choose PNG pages'}
          <input type="file" accept="image/png,.png" multiple onChange={onFiles} disabled={controlsDisabled} />
        </label>
        <label className="fileButton">
          Open .hwpublish
          <input type="file" accept=".hwpublish,application/zip" onChange={onBundle} disabled={controlsDisabled} />
        </label>
        <button onClick={exportBundle} disabled={!pages.length || controlsDisabled}>Export .hwpublish</button>
        <button onClick={newDocument} disabled={controlsDisabled}>New document</button>
        <small aria-live="polite">{status}</small>
      </section>

      {pages.length > 0 && (
        <section className="workspace">
          <div className="sectionHeading">
            <div><p className="eyebrow">Document</p><h2>{pages.length} page{pages.length === 1 ? '' : 's'}</h2></div>
            <p>Natural filename order is applied on PNG import. Bundles restore their saved order and document identity.</p>
          </div>
          <div className="pageGrid">
            {pages.map((page, index) => (
              <article className="pageCard" key={page.id}>
                <img src={page.previewUrl} alt={`Handwritten page ${index + 1}`} />
                <div className="pageMeta">
                  <div><strong>Page {index + 1}</strong><small>{page.filename}</small></div>
                  <div className="orderButtons">
                    <button aria-label={`Move page ${index + 1} earlier`} onClick={() => move(index, -1)} disabled={controlsDisabled || index === 0}>↑</button>
                    <button aria-label={`Move page ${index + 1} later`} onClick={() => move(index, 1)} disabled={controlsDisabled || index === pages.length - 1}>↓</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="panel transcript">
        <label>
          <span>Transcript <em>optional for now</em></span>
          <textarea
            value={transcript}
            disabled={controlsDisabled}
            onChange={event => {
              setTranscript(event.target.value);
              markEdited();
            }}
            placeholder="Add or paste a transcript. AI-assisted transcription comes later; the page images remain canonical."
          />
        </label>
      </section>

      <section className="panel microblogPublisher">
        <div>
          <p className="eyebrow">Publisher</p>
          <h2>Micro.blog</h2>
          <p>Create a private server-side draft. Your app token stays only in this page's memory and is never saved into the document or exported bundle.</p>
        </div>
        <label>
          <span>App token</span>
          <input
            type="password"
            value={microblogToken}
            disabled={controlsDisabled}
            onChange={event => {
              setMicroblogToken(event.target.value);
              setMicroblogConfig(null);
            }}
            autoComplete="off"
            placeholder="Paste a Micro.blog app token"
          />
        </label>
        <button onClick={connectMicroblog} disabled={controlsDisabled || !microblogToken.trim()}>
          {microblogConfig ? 'Reconnect Micro.blog' : 'Connect Micro.blog'}
        </button>
        {microblogConfig && microblogConfig.destinations.length > 0 && (
          <label>
            <span>Destination blog</span>
            <select value={microblogDestination} onChange={event => setMicroblogDestination(event.target.value)} disabled={controlsDisabled}>
              {microblogConfig.destinations.map(destination => (
                <option key={destination.uid} value={destination.uid}>{destination.name}</option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={publishMicroblogDraft}
          disabled={controlsDisabled || !microblogConfig || !pages.length || !hasValidTitle || Boolean(existingMicroblogDraft)}
        >
          {existingMicroblogDraft ? 'Micro.blog draft already created' : 'Create Micro.blog draft'}
        </button>
        {!hasValidTitle && microblogConfig && pages.length > 0 && !existingMicroblogDraft && (
          <small>Add a post title before creating a Micro.blog draft.</small>
        )}
        {existingMicroblogDraft && (
          <p>
            Draft tracked for this document. <a href={existingMicroblogDraft.preview} target="_blank" rel="noreferrer">Open private preview ↗</a>
          </p>
        )}
      </section>
    </main>
  );
}
