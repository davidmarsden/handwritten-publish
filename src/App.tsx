import { ChangeEvent, useMemo, useState } from 'react';
import { buildBundle, downloadBlob } from './bundle';
import { documentPages, importPngFiles, type ImportedPage } from './importPng';
import { createDocument } from './model';
import './styles.css';

export default function App() {
  const [title, setTitle] = useState('Untitled handwritten post');
  const [pages, setPages] = useState<ImportedPage[]>([]);
  const [transcript, setTranscript] = useState('');
  const [busy, setBusy] = useState(false);
  const [baseDocument] = useState(() => createDocument('Untitled handwritten post'));

  const document = useMemo(() => ({
    ...baseDocument,
    title,
    transcript: transcript || undefined,
    pages: documentPages(pages),
  }), [baseDocument, title, transcript, pages]);

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    if (!selected.length) return;
    setBusy(true);
    try {
      pages.forEach(page => URL.revokeObjectURL(page.previewUrl));
      setPages(await importPngFiles(selected));
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
  }

  async function exportBundle() {
    const blob = await buildBundle(document, pages);
    const safeTitle = title.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'handwritten-post';
    downloadBlob(blob, `${safeTitle}.hwpublish`);
  }

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
          <input value={title} onChange={event => setTitle(event.target.value)} />
        </label>
        <label className="fileButton">
          {busy ? 'Reading pages…' : pages.length ? 'Replace PNG pages' : 'Choose PNG pages'}
          <input type="file" accept="image/png,.png" multiple onChange={onFiles} disabled={busy} />
        </label>
        <button onClick={exportBundle} disabled={!pages.length}>Export .hwpublish</button>
      </section>

      {pages.length > 0 && (
        <section className="workspace">
          <div className="sectionHeading">
            <div><p className="eyebrow">Document</p><h2>{pages.length} page{pages.length === 1 ? '' : 's'}</h2></div>
            <p>Natural filename order is applied on import. Nudge anything that landed in the wrong place.</p>
          </div>
          <div className="pageGrid">
            {pages.map((page, index) => (
              <article className="pageCard" key={page.id}>
                <img src={page.previewUrl} alt={`Handwritten page ${index + 1}`} />
                <div className="pageMeta">
                  <div><strong>Page {index + 1}</strong><small>{page.filename}</small></div>
                  <div className="orderButtons">
                    <button aria-label={`Move page ${index + 1} earlier`} onClick={() => move(index, -1)} disabled={index === 0}>↑</button>
                    <button aria-label={`Move page ${index + 1} later`} onClick={() => move(index, 1)} disabled={index === pages.length - 1}>↓</button>
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
          <textarea value={transcript} onChange={event => setTranscript(event.target.value)} placeholder="Add or paste a transcript. AI-assisted transcription comes later; the page images remain canonical." />
        </label>
      </section>
    </main>
  );
}
