import { createDocument, type HandwrittenDocument } from './model';

export function updateDocument(
  base: HandwrittenDocument,
  changes: Pick<HandwrittenDocument, 'title' | 'pages'> & { transcript?: string },
): HandwrittenDocument {
  return {
    ...base,
    ...changes,
    updatedAt: new Date().toISOString(),
  };
}

export function initialDocument(title?: string) {
  return createDocument(title);
}
