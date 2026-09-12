import React, { useEffect, useState } from 'react';
import type { MicroblogItem } from '../src/microblogSocial';
import './rich-content.css';

const SAFE_INLINE = new Set(['strong', 'b', 'em', 'i', 'code']);
const SAFE_BLOCK = new Set(['p', 'blockquote', 'pre', 'ul', 'ol', 'li']);
const MEDIA_KEY = 'dent-hand-show-media';
const MEDIA_EVENT = 'dent-hand-media-setting';

type MediaItem = { src: string; alt: string; href: string };

function safeUrl(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed;
  return undefined;
}

function splitLinkSuffix(value: string): { href: string; suffix: string } {
  let href = value;
  let suffix = '';

  while (/[.,!?;:'"]$/.test(href)) {
    suffix = href.slice(-1) + suffix;
    href = href.slice(0, -1);
  }

  const pairs: Array<[string, string]> = [['(', ')'], ['[', ']'], ['{', '}']];
  let changed = true;
  while (changed && href) {
    changed = false;
    for (const [open, close] of pairs) {
      if (!href.endsWith(close)) continue;
      const opens = href.split(open).length - 1;
      const closes = href.split(close).length - 1;
      if (closes > opens) {
        suffix = close + suffix;
        href = href.slice(0, -1);
        changed = true;
        break;
      }
    }
  }

  return { href, suffix };
}

function textWithLinks(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(https?:\/\/[^\s<]+)/g);
  return parts.filter(Boolean).flatMap((part, index) => {
    if (!/^https?:\/\//i.test(part)) {
      return [<React.Fragment key={`${keyPrefix}-${index}`}>{part}</React.Fragment>];
    }

    const { href: candidate, suffix } = splitLinkSuffix(part);
    const href = safeUrl(candidate);
    if (!href) return [<React.Fragment key={`${keyPrefix}-${index}`}>{part}</React.Fragment>];

    return [
      <a key={`${keyPrefix}-${index}-link`} href={href} target="_blank" rel="noreferrer">{candidate}</a>,
      ...(suffix ? [<React.Fragment key={`${keyPrefix}-${index}-suffix`}>{suffix}</React.Fragment>] : []),
    ];
  });
}

function meaningfulChildren(node: ParentNode): ChildNode[] {
  return Array.from(node.childNodes).filter(child => child.nodeType !== Node.TEXT_NODE || Boolean(child.textContent?.trim()));
}

function mediaFromNode(node: Node): MediaItem | null {
  if (!(node instanceof HTMLElement)) return null;
  const tag = node.tagName.toLowerCase();

  if (tag === 'img') {
    const src = safeUrl(node.getAttribute('src'));
    if (!src || src.startsWith('mailto:')) return null;
    return { src, alt: node.getAttribute('alt') || '', href: src };
  }

  if (tag === 'a') {
    const children = meaningfulChildren(node);
    if (children.length !== 1) return null;
    const media = mediaFromNode(children[0]);
    if (!media) return null;
    const href = safeUrl(node.getAttribute('href'));
    return { ...media, href: href && !href.startsWith('mailto:') ? href : media.href };
  }

  if (tag === 'p' || tag === 'div' || tag === 'figure') {
    const children = meaningfulChildren(node);
    return children.length === 1 ? mediaFromNode(children[0]) : null;
  }

  return null;
}

function renderMedia(media: MediaItem, key: string, inGallery = false): React.ReactNode {
  return <a key={key} className={inGallery ? 'media-cell' : 'media-single'} href={media.href} target="_blank" rel="noreferrer">
    <img className="post-image" src={media.src} alt={media.alt} loading="lazy" decoding="async"/>
  </a>;
}

function renderChildren(node: ParentNode, keyPrefix: string, showMedia: boolean): React.ReactNode[] {
  const children = Array.from(node.childNodes);
  const output: React.ReactNode[] = [];

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const firstMedia = mediaFromNode(child);
    if (firstMedia) {
      const media: MediaItem[] = [firstMedia];
      let cursor = index + 1;
      while (cursor < children.length) {
        const candidate = children[cursor];
        if (candidate.nodeType === Node.TEXT_NODE && !candidate.textContent?.trim()) { cursor += 1; continue; }
        const nextMedia = mediaFromNode(candidate);
        if (!nextMedia) break;
        media.push(nextMedia);
        cursor += 1;
      }
      index = cursor - 1;
      if (!showMedia) continue;
      if (media.length === 1) output.push(renderMedia(media[0], `${keyPrefix}-${index}-media`));
      else output.push(<div className={`media-gallery media-count-${Math.min(media.length, 4)}`} key={`${keyPrefix}-${index}-gallery`}>{media.map((item, mediaIndex) => renderMedia(item, `${keyPrefix}-${index}-${mediaIndex}`, true))}</div>);
      continue;
    }

    const rendered = renderNode(child, `${keyPrefix}-${index}`, showMedia);
    if (rendered !== null) output.push(rendered);
  }

  return output;
}

function renderNode(node: Node, key: string, showMedia: boolean): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (!(node instanceof HTMLElement)) return null;

  const tag = node.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed') return null;

  if (tag === 'br') return <br key={key}/>;

  if (tag === 'a') {
    const href = safeUrl(node.getAttribute('href'));
    const children = renderChildren(node, key, showMedia);
    return href
      ? <a key={key} href={href} target="_blank" rel="noreferrer">{children}</a>
      : <React.Fragment key={key}>{children}</React.Fragment>;
  }

  if (tag === 'img') {
    if (!showMedia) return null;
    const src = safeUrl(node.getAttribute('src'));
    if (!src || src.startsWith('mailto:')) return null;
    return <img key={key} className="post-image" src={src} alt={node.getAttribute('alt') || ''} loading="lazy" decoding="async"/>;
  }

  const children = renderChildren(node, key, showMedia);
  if (SAFE_INLINE.has(tag)) return React.createElement(tag, { key }, children);
  if (SAFE_BLOCK.has(tag)) return React.createElement(tag, { key }, children);

  return <React.Fragment key={key}>{children}</React.Fragment>;
}

function initialMediaSetting(): boolean {
  try { return localStorage.getItem(MEDIA_KEY) !== 'false'; } catch { return true; }
}

export function RichContent({ item }: { item: MicroblogItem }) {
  const [showMedia, setShowMedia] = useState(initialMediaSetting);
  const html = item.content_html?.trim();
  const doc = html ? new DOMParser().parseFromString(html, 'text/html') : null;
  const mediaCount = doc?.querySelectorAll('img').length || 0;

  useEffect(() => {
    const sync = (event: Event) => setShowMedia((event as CustomEvent<boolean>).detail);
    window.addEventListener(MEDIA_EVENT, sync);
    return () => window.removeEventListener(MEDIA_EVENT, sync);
  }, []);

  function toggleMedia() {
    const next = !showMedia;
    setShowMedia(next);
    try { localStorage.setItem(MEDIA_KEY, String(next)); } catch { /* preference is best-effort */ }
    window.dispatchEvent(new CustomEvent<boolean>(MEDIA_EVENT, { detail: next }));
  }

  if (doc) {
    return <div className="post-content">
      {renderChildren(doc.body, `dent-${item.id}`, showMedia)}
      {mediaCount > 0 && <button type="button" className="media-toggle" onClick={toggleMedia}>{showMedia ? 'Hide media' : `Show media${mediaCount > 1 ? ` (${mediaCount})` : ''}`}</button>}
    </div>;
  }

  const text = item.content_text?.trim() || '';
  return <div className="post-content post-content-plain">{textWithLinks(text, `dent-${item.id}`)}</div>;
}
