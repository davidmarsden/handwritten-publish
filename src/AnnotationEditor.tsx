import { Fragment, PointerEvent, useMemo, useState } from 'react';
import { annotationStyle, constrainRect, rectFromPoints, replaceAnnotation } from './annotations';
import type { ImportedAsset } from './assets';
import type { Annotation } from './model';
import type { ImportedPage } from './importPng';

type Tool = 'link' | 'photo';
type Point = { x: number; y: number };

type Props = {
  page: ImportedPage;
  assets: ImportedAsset[];
  disabled?: boolean;
  onChange: (annotations: Annotation[]) => void;
  onAddAsset: (file: File) => Promise<string>;
  onClose: () => void;
};

function pointerPoint(event: PointerEvent<HTMLDivElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
}

export default function AnnotationEditor({ page, assets, disabled = false, onChange, onAddAsset, onClose }: Props) {
  const [tool, setTool] = useState<Tool>('link');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragEnd, setDragEnd] = useState<Point | null>(null);
  const [addingAsset, setAddingAsset] = useState(false);

  const draftRect = useMemo(() => dragStart && dragEnd ? rectFromPoints(dragStart, dragEnd) : null, [dragStart, dragEnd]);
  const selected = selectedIndex === null ? null : page.annotations[selectedIndex] ?? null;

  function begin(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('.annotationRegion')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerPoint(event);
    setSelectedIndex(null);
    setDragStart(point);
    setDragEnd(point);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart || disabled) return;
    setDragEnd(pointerPoint(event));
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart || disabled) return;
    const rect = rectFromPoints(dragStart, pointerPoint(event));
    setDragStart(null);
    setDragEnd(null);
    if (!rect) return;
    const annotation: Annotation = tool === 'link'
      ? { type: 'link', ...rect, href: '', label: '' }
      : { type: 'photo', ...rect, assetId: '', alt: '' };
    const next = [...page.annotations, annotation];
    onChange(next);
    setSelectedIndex(next.length - 1);
  }

  function updateSelected(next: Annotation) {
    if (selectedIndex === null) return;
    onChange(replaceAnnotation(page.annotations, selectedIndex, next));
  }

  function updateGeometry(field: 'x' | 'y' | 'width' | 'height', rawValue: string) {
    if (!selected) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    const rect = constrainRect({ x: selected.x, y: selected.y, width: selected.width, height: selected.height, [field]: value });
    updateSelected({ ...selected, ...rect });
  }

  async function addAsset(file: File) {
    if (!selected || selected.type !== 'photo') return;
    setAddingAsset(true);
    try {
      const assetId = await onAddAsset(file);
      updateSelected({ ...selected, assetId });
    } finally {
      setAddingAsset(false);
    }
  }

  function removeSelected() {
    if (selectedIndex === null) return;
    onChange(page.annotations.filter((_, index) => index !== selectedIndex));
    setSelectedIndex(null);
  }

  return (
    <section className="annotationEditor panel" aria-label={`Annotations for ${page.filename}`}>
      <div className="annotationHeader">
        <div><p className="eyebrow">Annotations</p><h2>{page.filename}</h2><p>Choose a region type, then drag a box over the handwritten page. Regions are stored as responsive 0–1 coordinates.</p></div>
        <button type="button" onClick={onClose}>Close editor</button>
      </div>

      <div className="annotationToolbar" role="toolbar" aria-label="Annotation tools">
        <button type="button" className={tool === 'link' ? 'active' : ''} onClick={() => setTool('link')} disabled={disabled}>Link region</button>
        <button type="button" className={tool === 'photo' ? 'active' : ''} onClick={() => setTool('photo')} disabled={disabled}>Photo placeholder</button>
        <span>{page.annotations.length} region{page.annotations.length === 1 ? '' : 's'}</span>
      </div>

      <div className="annotationLayout">
        <div className="annotationCanvas" onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { setDragStart(null); setDragEnd(null); }}>
          <img src={page.previewUrl} alt="Handwritten page being annotated" draggable={false} />
          {page.annotations.map((annotation, index) => {
            const photoAsset = annotation.type === 'photo' ? assets.find(asset => asset.id === annotation.assetId) : undefined;
            return (
              <Fragment key={`${annotation.type}-${index}`}>
                {annotation.type === 'photo' && photoAsset && (
                  <img
                    className="annotationPhotoAsset"
                    style={annotationStyle(annotation)}
                    src={photoAsset.previewUrl}
                    alt={annotation.alt || photoAsset.filename}
                  />
                )}
                <button
                  type="button"
                  className={`annotationRegion ${annotation.type} ${selectedIndex === index ? 'selected' : ''} ${photoAsset ? 'hasAsset' : ''}`}
                  style={annotationStyle(annotation)}
                  onPointerDown={event => event.stopPropagation()}
                  onClick={() => setSelectedIndex(index)}
                  aria-label={`${annotation.type === 'link' ? 'Link' : 'Photo'} region ${index + 1}`}
                ><span>{annotation.type === 'link' ? '↗' : '▧'}</span></button>
              </Fragment>
            );
          })}
          {draftRect && <div className={`annotationRegion draft ${tool}`} style={annotationStyle({ type: tool, ...draftRect, ...(tool === 'link' ? { href: '' } : { assetId: '' }) } as Annotation)} />}
        </div>

        <aside className="annotationInspector">
          {selected ? (
            <>
              <p className="eyebrow">Selected region</p>
              <h3>{selected.type === 'link' ? 'Link' : 'Photo'}</h3>
              {selected.type === 'link' ? (
                <>
                  <label><span>URL</span><input type="url" value={selected.href} placeholder="https://example.com" disabled={disabled} onChange={event => updateSelected({ ...selected, href: event.target.value })} /></label>
                  <label><span>Label <em>optional</em></span><input value={selected.label ?? ''} placeholder="What this link is" disabled={disabled} onChange={event => updateSelected({ ...selected, label: event.target.value || undefined })} /></label>
                </>
              ) : (
                <>
                  <label>
                    <span>Document photo</span>
                    <select value={selected.assetId} disabled={disabled || addingAsset} onChange={event => updateSelected({ ...selected, assetId: event.target.value })}>
                      <option value="">No photo selected</option>
                      {assets.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}
                    </select>
                  </label>
                  <label className="fileButton assetFileButton">
                    {addingAsset ? 'Adding photo…' : 'Add new photo'}
                    <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={disabled || addingAsset} onChange={event => { const file = event.target.files?.[0]; if (file) void addAsset(file); event.target.value = ''; }} />
                  </label>
                  {selected.assetId && assets.find(asset => asset.id === selected.assetId) && (
                    <img className="assetInspectorPreview" src={assets.find(asset => asset.id === selected.assetId)!.previewUrl} alt="Selected photo asset preview" />
                  )}
                  <label><span>Alt text <em>recommended</em></span><textarea value={selected.alt ?? ''} placeholder="Describe this photo" disabled={disabled} onChange={event => updateSelected({ ...selected, alt: event.target.value || undefined })} /></label>
                </>
              )}
              <div className="annotationCoords" aria-label="Normalized region coordinates">
                <label><span>x</span><input type="number" min="0" max="1" step="0.001" value={selected.x} disabled={disabled} onChange={event => updateGeometry('x', event.target.value)} /></label>
                <label><span>y</span><input type="number" min="0" max="1" step="0.001" value={selected.y} disabled={disabled} onChange={event => updateGeometry('y', event.target.value)} /></label>
                <label><span>w</span><input type="number" min="0.01" max="1" step="0.001" value={selected.width} disabled={disabled} onChange={event => updateGeometry('width', event.target.value)} /></label>
                <label><span>h</span><input type="number" min="0.01" max="1" step="0.001" value={selected.height} disabled={disabled} onChange={event => updateGeometry('height', event.target.value)} /></label>
              </div>
              <button type="button" className="dangerButton" onClick={removeSelected} disabled={disabled}>Delete region</button>
            </>
          ) : <p>Drag a new region over the page or select an existing one to edit its metadata and geometry.</p>}
        </aside>
      </div>
    </section>
  );
}
