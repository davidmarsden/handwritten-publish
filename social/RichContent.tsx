import React from 'react';
import type { MicroblogItem } from '../src/microblogSocial';
import './rich-content.css';

const SAFE_INLINE = new Set(['strong', 'b', 'em', 'i', 'code']);
const SAFE_BLOCK = new Set(['p', 'blockquote', 'pre', 'ul', 'ol', 'li']);

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

function renderChildren(node: ParentNode, keyPrefix: string): React.ReactNode[] {
  return Array.from(node.childNodes).map((child, index) => renderNode(child, `${keyPrefix}-${index}`)).filter(node => node !== null);
}

function renderNode(node: Node, key: string): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (!(node instanceof HTMLElement)) return null;

  const tag = node.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed') return null;

  if (tag === 'br') return <br key={key}/>;

  if (tag === 'a') {
    const href = safeUrl(node.getAttribute('href'));
    const children = renderChildren(node, key);
    return href
      ? <a key={key} href={href} target="_blank" rel="noreferrer">{children}</a>
      : <React.Fragment key={key}>{children}</React.Fragment>;
  }

  if (tag === 'img') {
    const src = safeUrl(node.getAttribute('src'));
    if (!src || src.startsWith('mailto:')) return null;
    return <img key={key} className="post-image" src={src} alt={node.getAttribute('alt') || ''} loading="lazy" decoding="async"/>;
  }

  const children = renderChildren(node, key);
  if (SAFE_INLINE.has(tag)) return React.createElement(tag, { key }, children);
  if (SAFE_BLOCK.has(tag)) return React.createElement(tag, { key }, children);

  return <React.Fragment key={key}>{children}</React.Fragment>;
}

export function RichContent({ item }: { item: MicroblogItem }) {
  const html = item.content_html?.trim();
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return <div className="post-content">{renderChildren(doc.body, `dent-${item.id}`)}</div>;
  }

  const text = item.content_text?.trim() || '';
  return <div className="post-content post-content-plain">{textWithLinks(text, `dent-${item.id}`)}</div>;
}
