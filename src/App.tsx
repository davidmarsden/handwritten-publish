import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import AnnotationEditor from './AnnotationEditor';
import { annotationStyle } from './annotations';
import { documentAssets, importPhotoAsset, type ImportedAsset } from './assets';
import { buildBundle, downloadBlob, readBundle } from './bundle';
import { documentPages, importPhotoPageFiles, importPngFiles, type ImportedPage } from './importPng';
import {
  canReuseMicroblogMedia,
  createMicroblogDraft,
  fetchMicroblogConfig,
  isMicroblogDraftStale,
  microblogAnnotationError,
  microblogPhotoAssetIds,
  reusableMicroblogPhotoUrl,
  type MicroblogConfig,
  updateMicroblogDraft,
  uploadMicroblogPage,
  uploadMicroblogPhoto,
  verifyMicroblogDraft,
} from './microblog';
import { createDocument, type Annotation, type HandwrittenDocument, type MicroblogPhotoMedia } from './model';
import { clearDraft, loadDraft, saveDraft } from './persistence';
import './styles.css';

function revokePages(pages: ImportedPage[]) {
  pages.forEach(page => URL.revokeObjectURL(page.previewUrl));
}

function revokeAssets(assets: ImportedAsset[]) {
  assets.forEach(asset => URL.revokeObjectURL(asset.previewUrl));
}

export default function App() {
  const [title, setTitle] = useState('Untitled handwritten post');
  const [pages, setPages] = useState<ImportedPage[]>([]);
  const [assets, setAssets] = useState<ImportedAsset[]>([]);
  const [transcript, setTranscript] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Loading local draft…');
  const [hydrated, setHydrated] = useState(false);
  const [baseDocument, setBaseDocument] = useState<HandwrittenDocument>(() => createDocument('Untitled handwritten post'));
  const [annotationPageId, setAnnotationPageId] = useState<string | null>(null);
  const [microblogToken, setMicroblogToken] = useState('');
  const [microblogConfig, setMicroblogConfig] = useState<MicroblogConfig | null>(null);
  const [microblogDestination, setMicroblogDestination] = useState('');
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const dragMoved = useRef(false);
  const lastDragTargetId = useRef<string | null>(null);

  const document = useMemo(() => ({
    ...baseDocument,
    title,
    transcript: transcript || undefined,
    pages: documentPages(pages),
    assets: documentAssets(assets),
  }), [baseDocument, title, transcript, pages, assets]);

  const annotationPageCandidate = annotationPageId
    ? pages.find(page => page.id === annotationPageId) ?? null
    : null;
  const annotationPage = annotationPageCandidate?.kind === 'photo' ? null : annotationPageCandidate;

  function markEdited() {
    setBaseDocument(current => ({ ...current, updatedAt: new Date().toISOString() }));
  }

  useEffect(() => {
    let cancelled = false;
    loadDraft()
      .then(saved => {
        if (cancelled) {
          if (saved) {
            revokePages(saved.pages);
            revokeAssets(saved.assets);
          }
          return;
        }
        if (saved) {
          setBaseDocument(saved.document);
          setTitle(saved.document.title);
          setTranscript(saved.document.transcript ?? '');
          setPages(saved.pages);
          setAssets(saved.assets);
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
      saveDraft(document, pages, assets)
        .then(() => setStatus('Saved locally.'))
        .catch(error => setStatus(error instanceof Error ? error.message : 'Could not save locally.'));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [hydrated, document, pages, assets]);

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    if (!selected.length) return;
    setBusy(true);
    try {
      const imported = await importPngFiles(selected);
      revokePages(pages);
      setPages(imported);
      setAnnotationPageId(null);
      markEdited();
      setStatus(`${imported.length} PNG page${imported.length === 1 ? '' : 's'} imported.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import PNG pages.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  async function onPhotoPages(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    if (!selected.length) return;
    setBusy(true);
    try {
      const imported = await importPhotoPageFiles(selected);
      setPages(current => [...current, ...imported]);
      markEdited();
      setStatus(`${imported.length} standalone photo page${imported.length === 1 ? '' : 's'} added.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not add photo pages.');
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
      revokeAssets(assets);
      setBaseDocument(imported.document);
      setTitle(imported.document.title);
      setTranscript(imported.document.transcript ?? '');
      setPages(imported.pages);
      setAssets(imported.assets);
      setAnnotationPageId(null);
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
    setStatus('Page order updated.');
  }

  function reorderPage(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    setPages(current => {
      const from = current.findIndex(page => page.id === draggedId);
      const to = current.findIndex(page => page.id === targetId);
      if (from < 0 || to < 0 || from === to) return current;
      const next = [...current];
      const [dragged] = next.splice(from, 1);
      next.splice(to, 0, dragged);
      dragMoved.current = true;
      return next;
    });
  }

  function beginPageDrag(event: ReactPointerEvent<HTMLButtonElement>, pageId: string) {
    if (busy || !hydrated) return;
    dragMoved.current = false;
    lastDragTargetId.current = pageId;
    setDraggingPageId(pageId);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continuePageDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingPageId) return;
    const target = documentElementAt(event.clientX, event.clientY);
    const targetId = target?.dataset.pageId;
    if (targetId && targetId !== lastDragTargetId.current) {
      lastDragTargetId.current = targetId;
      reorderPage(draggingPageId, targetId);
    }
  }

  function endPageDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (dragMoved.current) {
      markEdited();
      setStatus('Page order updated.');
    }
    dragMoved.current = false;
    lastDragTargetId.current = null;
    setDraggingPageId(null);
  }

  function documentElementAt(x: number, y: number): HTMLElement | null {
    const element = window.document.elementFromPoint(x, y);
    return element instanceof HTMLElement ? element.closest<HTMLElement>('[data-page-id]') : null;
  }

  function updatePageAnnotations(pageId: string, annotations: Annotation[]) {
    setPages(current => current.map(page => page.id === pageId && page.kind !== 'photo'
      ? { ...page, annotations }
      : page));
    markEdited();
    setStatus('Annotation changes saved locally.');
  }

  function updatePhotoPageAlt(pageId: string, alt: string) {
    setPages(current => current.map(page => page.id === pageId && page.kind === 'photo'
      ? { ...page, alt: alt || undefined }
      : page));
    markEdited();
  }

  function removePhotoPage(pageId: string) {
    const page = pages.find(candidate => candidate.id === pageId);
    if (!page || page.kind !== 'photo') return;
    URL.revokeObjectURL(page.previewUrl);
    setPages(current => current.filter(candidate => candidate.id !== pageId));
    markEdited();
    setStatus(`Photo page ${page.filename} removed.`);
  }

  async function addPhotoAsset(file: File): Promise<string> {
    const asset = await importPhotoAsset(file);
    setAssets(current => [...current, asset]);
    markEdited();
    setStatus(`Photo asset ${file.name} added.`);
    return asset.id;
  }

  async function exportBundle() {
    const blob = await buildBundle(document, pages, assets);
    const safeTitle = title.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'handwritten-post';
    downloadBlob(blob, `${safeTitle}.hwpublish`);
    setStatus('Portable bundle exported.');
  }

  async function newDocument() {
    revokePages(pages);
    revokeAssets(assets);
    const fresh = createDocument('Untitled handwritten post');
    setBaseDocument(fresh);
    setTitle(fresh.title);
    setTranscript('');
    setPages([]);
    setAssets([]);
    setAnnotationPageId(null);
    if (microblogConfig) {
      setMicroblogDestination(current => microblogConfig.destinations.some(destination => destination.uid === current)
        ? current : microblogConfig.destinations[0]?.uid ?? '');
    }
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
      setMicroblogDestination(remembered && config.destinations.some(destination => destination.uid === remembered)
        ? remembered : config.destinations[0]?.uid ?? '');
      setStatus(`Micro.blog connected${config.destinations.length ? ` — ${config.destinations.length} blog${config.destinations.length === 1 ? '' : 's'} available.` : '.'}`);
    } catch (error) {
      setMicroblogConfig(null);
      setStatus(error instanceof Error ? error.message : 'Could not connect to Micro.blog.');
    } finally {
      setBusy(false);
    }
  }

  async function syncMicroblogDraft() {
    const normalizedTitle = title.trim();
    if (!microblogConfig || !microblogToken.trim() || !pages.length) return;
    if (!normalizedTitle) {
      setStatus('Add a post title before syncing a Micro.blog draft.');
      return;
    }
    const annotationError = microblogAnnotationError(document);
    if (annotationError) {
      setStatus(annotationError);
      return;
    }
    const existingDraft = baseDocument.publishing?.microblog;
    if (existingDraft && !isMicroblogDraftStale(document, existingDraft)) {
      setStatus('Micro.blog draft is already up to date.');
      return;
    }
    setBusy(true);
    try {
      if (existingDraft) {
        setStatus('Verifying the tracked Micro.blog post is still a draft…');
        await verifyMicroblogDraft(microblogToken, existingDraft);
      }

      let mediaUrls: string[];
      if (existingDraft && canReuseMicroblogMedia(document, existingDraft)) {
        mediaUrls = existingDraft.mediaUrls ?? [];
        setStatus('Page media is unchanged; reusing existing Micro.blog media…');
      } else {
        mediaUrls = [];
        for (let index = 0; index < pages.length; index += 1) {
          setStatus(`Uploading page ${index + 1} of ${pages.length} to Micro.blog…`);
          mediaUrls.push(await uploadMicroblogPage(microblogConfig.mediaEndpoint, microblogToken, pages[index]));
        }
      }

      const normalizedDocument = { ...document, title: normalizedTitle };
      const photoAssetIds = microblogPhotoAssetIds(normalizedDocument);
      const photoMedia: MicroblogPhotoMedia[] = [];
      for (let index = 0; index < photoAssetIds.length; index += 1) {
        const assetId = photoAssetIds[index];
        const asset = assets.find(candidate => candidate.id === assetId);
        if (!asset) throw new Error('A referenced photo file is missing from local storage. Rebind the photo before syncing Micro.blog.');
        const reusableUrl = existingDraft ? reusableMicroblogPhotoUrl(existingDraft, asset) : null;
        if (reusableUrl) {
          photoMedia.push({ assetId, sha256: asset.sha256, url: reusableUrl });
          continue;
        }
        setStatus(`Uploading overlay photo ${index + 1} of ${photoAssetIds.length} to Micro.blog…`);
        const url = await uploadMicroblogPhoto(microblogConfig.mediaEndpoint, microblogToken, asset);
        photoMedia.push({ assetId, sha256: asset.sha256, url });
      }

      const draft = existingDraft
        ? await updateMicroblogDraft(microblogToken, normalizedDocument, existingDraft, mediaUrls, photoMedia)
        : await createMicroblogDraft(microblogToken, microblogDestination, normalizedDocument, mediaUrls, photoMedia);
      setBaseDocument(current => ({ ...current, publishing: { ...current.publishing, microblog: draft } }));
      setStatus(existingDraft
        ? 'Micro.blog draft updated. Open the private preview to review it.'
        : 'Micro.blog draft created. Open the preview to review and publish it.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not sync the Micro.blog draft.');
    } finally {
      setBusy(false);
    }
  }

  const controlsDisabled = busy || !hydrated;
  const existingMicroblogDraft = baseDocument.publishing?.microblog;
  const hasValidTitle = Boolean(title.trim());
  const microblogAnnotationIssue = microblogAnnotationError(document);
  const microblogDraftStale = existingMicroblogDraft ? isMicroblogDraftStale(document, existingMicroblogDraft) : false;

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Handwritten Publish</p>
        <h1>Your handwriting, still handwriting.</h1>
        <p>Turn reMarkable PNG exports and photos into one portable, web-ready document without flattening away what makes them yours.</p>
      </header>

      <section className="panel controls">
        <label><span>Post title</span><input value={title} disabled={controlsDisabled} onChange={event => { setTitle(event.target.value); markEdited(); }} /></label>
        <label className="fileButton">{busy ? 'Reading…' : !hydrated ? 'Restoring local draft…' : pages.length ? 'Replace with PNG pages' : 'Choose PNG pages'}<input type="file" accept="image/png,.png" multiple onChange={onFiles} disabled={controlsDisabled} /></label>
        <label className="fileButton">Add photo pages<input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={onPhotoPages} disabled={controlsDisabled} /></label>
        <label className="fileButton">Open .hwpublish<input type="file" accept=".hwpublish,application/zip" onChange={onBundle} disabled={controlsDisabled} /></label>
        <button onClick={exportBundle} disabled={!pages.length || controlsDisabled}>Export .hwpublish</button>
        <button onClick={newDocument} disabled={controlsDisabled}>New document</button>
        <small aria-live="polite">{status}</small>
      </section>

      {pages.length > 0 && (
        <section className="workspace">
          <div className="sectionHeading">
            <div><p className="eyebrow">Document</p><h2>{pages.length} page{pages.length === 1 ? '' : 's'} · {assets.length} overlay photo asset{assets.length === 1 ? '' : 's'}</h2></div>
            <p>Drag pages into position. The arrow buttons remain available as a keyboard-friendly fallback.</p>
          </div>
          <div className={`pageGrid${draggingPageId ? ' isDragging' : ''}`}>
            {pages.map((page, index) => {
              const standalonePhoto = page.kind === 'photo';
              return (
                <article className={`pageCard${draggingPageId === page.id ? ' dragging' : ''}`} key={page.id} data-page-id={page.id}>
                  <div className="pageCardPreview">
                    <img src={page.previewUrl} alt={standalonePhoto ? page.alt || `Photo page ${index + 1}` : `Handwritten page ${index + 1}`} />
                    {!standalonePhoto && page.annotations.map((annotation, annotationIndex) => {
                      if (annotation.type === 'link' && annotation.href.trim()) return (
                        <a key={`annotation-${annotationIndex}`} className="previewAnnotation link" style={annotationStyle(annotation)} href={annotation.href} target="_blank" rel="noreferrer" aria-label={annotation.label || `Link region ${annotationIndex + 1}`} />
                      );
                      if (annotation.type === 'photo') {
                        const asset = assets.find(candidate => candidate.id === annotation.assetId);
                        if (asset) return <img key={`annotation-${annotationIndex}`} className="embeddedPhotoPreview" style={annotationStyle(annotation)} src={asset.previewUrl} alt={annotation.alt || asset.filename} />;
                      }
                      return <span key={`annotation-${annotationIndex}`} className={`previewAnnotation ${annotation.type}`} style={annotationStyle(annotation)} title={annotation.type === 'photo' ? annotation.alt || 'Unbound photo placeholder' : 'Incomplete link region'} />;
                    })}
                  </div>
                  <button
                    type="button"
                    className="dragHandle"
                    aria-label={`Drag page ${index + 1} to reorder`}
                    disabled={controlsDisabled}
                    onPointerDown={event => beginPageDrag(event, page.id)}
                    onPointerMove={continuePageDrag}
                    onPointerUp={endPageDrag}
                    onPointerCancel={endPageDrag}
                  ><span aria-hidden="true">↕</span> Drag to reorder</button>
                  <div className="pageMeta">
                    <div className="pageIdentity">
                      <strong>{standalonePhoto ? `Photo page ${index + 1}` : `Page ${index + 1}`}</strong>
                      <small>{page.filename}</small>
                      <small>{standalonePhoto ? `${page.width} × ${page.height}` : `${page.annotations.length} annotation${page.annotations.length === 1 ? '' : 's'}`}</small>
                    </div>
                    <div className="pageActions">
                      {standalonePhoto ? (
                        <button type="button" className="dangerButton" onClick={() => removePhotoPage(page.id)} disabled={controlsDisabled}>Remove photo</button>
                      ) : (
                        <button type="button" onClick={() => setAnnotationPageId(page.id)} disabled={controlsDisabled}>Annotate</button>
                      )}
                      <div className="orderButtons" aria-label="Page order fallback controls">
                        <button aria-label={`Move page ${index + 1} earlier`} onClick={() => move(index, -1)} disabled={controlsDisabled || index === 0}>↑</button>
                        <button aria-label={`Move page ${index + 1} later`} onClick={() => move(index, 1)} disabled={controlsDisabled || index === pages.length - 1}>↓</button>
                      </div>
                    </div>
                  </div>
                  {standalonePhoto && (
                    <label className="photoAltField"><span>Photo alt text <em>recommended</em></span><textarea value={page.alt ?? ''} placeholder="Describe this standalone photo" disabled={controlsDisabled} onChange={event => updatePhotoPageAlt(page.id, event.target.value)} /></label>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {annotationPage && (
        <AnnotationEditor page={annotationPage} assets={assets} disabled={controlsDisabled} onAddAsset={addPhotoAsset} onImportStateChange={setBusy} onError={setStatus} onChange={annotations => updatePageAnnotations(annotationPage.id, annotations)} onClose={() => setAnnotationPageId(null)} />
      )}

      <section className="panel transcript">
        <label><span>Transcript <em>optional for now</em></span><textarea value={transcript} disabled={controlsDisabled} onChange={event => { setTranscript(event.target.value); markEdited(); }} placeholder="Add or paste a transcript. AI-assisted transcription comes later; the page images remain canonical." /></label>
      </section>

      <section className="panel microblogPublisher">
        <div><p className="eyebrow">Publisher</p><h2>Micro.blog</h2><p>Create and revise a private server-side draft. Handwritten pages, standalone photo pages, clickable link regions and positioned overlay photos all publish in the document sequence.</p></div>
        <label><span>App token</span><input type="password" value={microblogToken} disabled={controlsDisabled} onChange={event => { setMicroblogToken(event.target.value); setMicroblogConfig(null); }} autoComplete="off" placeholder="Paste a Micro.blog app token" /></label>
        <button onClick={connectMicroblog} disabled={controlsDisabled || !microblogToken.trim()}>{microblogConfig ? 'Reconnect Micro.blog' : 'Connect Micro.blog'}</button>
        {microblogConfig && microblogConfig.destinations.length > 0 && (
          <label><span>Destination blog</span><select value={microblogDestination} onChange={event => setMicroblogDestination(event.target.value)} disabled={controlsDisabled || Boolean(existingMicroblogDraft)}>{microblogConfig.destinations.map(destination => <option key={destination.uid} value={destination.uid}>{destination.name}</option>)}</select></label>
        )}
        <button onClick={syncMicroblogDraft} disabled={controlsDisabled || !microblogConfig || !pages.length || !hasValidTitle || Boolean(microblogAnnotationIssue) || Boolean(existingMicroblogDraft && !microblogDraftStale)}>
          {!existingMicroblogDraft ? 'Create Micro.blog draft' : microblogDraftStale ? 'Update Micro.blog draft' : 'Micro.blog draft is up to date'}
        </button>
        {!hasValidTitle && microblogConfig && pages.length > 0 && <small>Add a post title before syncing a Micro.blog draft.</small>}
        {microblogAnnotationIssue && microblogConfig && pages.length > 0 && <small>{microblogAnnotationIssue}</small>}
        {existingMicroblogDraft && <p>{microblogDraftStale ? 'Micro.blog-visible content changed since the last sync. ' : 'Draft is in sync with current Micro.blog-visible content. '}<a href={existingMicroblogDraft.preview} target="_blank" rel="noreferrer">Open private preview ↗</a></p>}
      </section>
    </main>
  );
}
