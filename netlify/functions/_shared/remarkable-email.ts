export type ReceivedEmailContent = {
  text?: string | null;
  html?: string | null;
};

export type RemarkablePostStatus = 'draft' | 'published';

export type RemarkablePostMetadata = {
  title: string | null;
  requestedCategories: string[];
  status: RemarkablePostStatus;
  body: string;
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function textFromHtmlFragment(fragment: string): string {
  return decodeHtmlEntities(
    fragment
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  ).trim();
}

export function stripRemarkablePlainTextFooter(body: string): string {
  return body.replace(
    /\s*--\s*\r?\nSent from my reMarkable paper tablet\r?\nGet yours at www\.remarkable\.com\r?\n\r?\nPS: You cannot reply to this email\s*$/i,
    '',
  ).trimEnd();
}

export function transcriptionFromRemarkableEmail(email: ReceivedEmailContent): string {
  if (typeof email.html === 'string' && email.html.trim()) {
    const bodyMatch = email.html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      const paragraphs = [...bodyMatch[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
        .map(match => textFromHtmlFragment(match[1]))
        .filter(Boolean);
      if (paragraphs.length) return paragraphs.join('\n\n');

      const bodyText = textFromHtmlFragment(bodyMatch[1]);
      if (bodyText) return bodyText;
    }
  }

  return typeof email.text === 'string' ? stripRemarkablePlainTextFooter(email.text).trim() : '';
}

function addCategories(target: string[], raw: string): void {
  for (const category of raw.split(',').map(value => value.trim()).filter(Boolean)) {
    if (!target.some(existing => existing.toLowerCase() === category.toLowerCase())) target.push(category);
  }
}

function hashtagCategories(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('#')) return null;
  const tokens = trimmed.split(/\s+/);
  if (!tokens.length || tokens.some(token => !/^#[^#\s]+$/.test(token))) return null;
  return tokens.map(token => token.slice(1)).filter(Boolean);
}

export function parseRemarkablePostMetadata(transcription: string): RemarkablePostMetadata {
  const lines = transcription.replace(/\r\n?/g, '\n').split('\n');
  const requestedCategories: string[] = [];
  let title: string | null = null;
  let status: RemarkablePostStatus = 'draft';
  let index = 0;
  let consumedMetadata = false;

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index += 1;
      if (consumedMetadata) continue;
      continue;
    }

    const titleMatch = trimmed.match(/^Title:\s*(.*)$/i);
    if (titleMatch) {
      title = titleMatch[1].trim() || null;
      consumedMetadata = true;
      index += 1;
      continue;
    }

    const categoriesMatch = trimmed.match(/^Categories?:\s*(.*)$/i);
    if (categoriesMatch) {
      addCategories(requestedCategories, categoriesMatch[1]);
      consumedMetadata = true;
      index += 1;
      continue;
    }

    const statusMatch = trimmed.match(/^Status:\s*(.*)$/i);
    if (statusMatch) {
      const requestedStatus = statusMatch[1].trim().toLowerCase();
      if (requestedStatus === 'published') status = 'published';
      else if (requestedStatus === 'draft') status = 'draft';
      else {
        status = 'draft';
        break;
      }
      consumedMetadata = true;
      index += 1;
      continue;
    }

    const hashtags = hashtagCategories(trimmed);
    if (hashtags) {
      addCategories(requestedCategories, hashtags.join(','));
      consumedMetadata = true;
      index += 1;
      continue;
    }

    break;
  }

  return {
    title,
    requestedCategories,
    status,
    body: lines.slice(index).join('\n').trim(),
  };
}

export function matchExistingCategories(requested: string[], available: string[]): string[] {
  const byLowerName = new Map(available.map(category => [category.trim().toLowerCase(), category.trim()]));
  const matched: string[] = [];
  for (const requestedCategory of requested) {
    const match = byLowerName.get(requestedCategory.trim().toLowerCase());
    if (match && !matched.includes(match)) matched.push(match);
  }
  return matched;
}
