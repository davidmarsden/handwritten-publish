import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../src/App.tsx', import.meta.url);
let source = await readFile(path, 'utf8');

const oldFunction = `  function removePhotoPage(pageId: string) {
    const page = pages.find(candidate => candidate.id === pageId);
    if (!page || page.kind !== 'photo') return;
    URL.revokeObjectURL(page.previewUrl);
    setPages(current => current.filter(candidate => candidate.id !== pageId));
    markEdited();
    setStatus(\`Photo page \${page.filename} removed.\`);
  }`;

const newFunction = `  function removePage(pageId: string) {
    const page = pages.find(candidate => candidate.id === pageId);
    if (!page) return;
    if (pages.length === 1) {
      setStatus('A document needs at least one page. Replace the document instead.');
      return;
    }
    URL.revokeObjectURL(page.previewUrl);
    setPages(current => current.filter(candidate => candidate.id !== pageId));
    if (annotationPageId === pageId) setAnnotationPageId(null);
    markEdited();
    const remaining = pages.length - 1;
    setStatus(\`Page \${page.filename} removed. \${remaining} page\${remaining === 1 ? '' : 's'} remaining.\`);
  }`;

if (source.includes(oldFunction)) source = source.replace(oldFunction, newFunction);

source = source.replace(
  '            <p>Drag pages into position. The arrow buttons remain available as a keyboard-friendly fallback.</p>',
  '            <p>Drag pages into position, remove pages you do not want to publish, or use the arrow buttons as a keyboard-friendly fallback.</p>',
);

const oldActions = `                      {standalonePhoto ? (
                        <button type="button" className="dangerButton" onClick={() => removePhotoPage(page.id)} disabled={controlsDisabled}>Remove photo</button>
                      ) : (
                        <button type="button" onClick={() => setAnnotationPageId(page.id)} disabled={controlsDisabled}>Annotate</button>
                      )}`;

const newActions = `                      {!standalonePhoto && (
                        <button type="button" onClick={() => setAnnotationPageId(page.id)} disabled={controlsDisabled}>Annotate</button>
                      )}
                      <button
                        type="button"
                        className="dangerButton"
                        onClick={() => removePage(page.id)}
                        disabled={controlsDisabled || pages.length === 1}
                        aria-label={\`Remove page \${index + 1}\`}
                        title={pages.length === 1 ? 'A document needs at least one page' : 'Remove this page from the document'}
                      >Remove page</button>`;

if (source.includes(oldActions)) source = source.replace(oldActions, newActions);

if (!source.includes('function removePage(pageId: string)') || !source.includes('onClick={() => removePage(page.id)}')) {
  throw new Error('Publish Hand page-removal patch could not be applied cleanly.');
}

await writeFile(path, source);
