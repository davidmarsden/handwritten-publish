import type { HandwrittenDocument } from './model';

const STORAGE_KEY = 'handwritten-publish:last-document';

export type PersistedDocumentDraft = Pick<HandwrittenDocument, 'id' | 'title' | 'createdAt' | 'updatedAt' | 'transcript'>;

export function loadDraft(): PersistedDocumentDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as PersistedDocumentDraft : null;
  } catch {
    return null;
  }
}

export function saveDraft(document: HandwrittenDocument) {
  const draft: PersistedDocumentDraft = {
    id: document.id,
    title: document.title,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    transcript: document.transcript,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}
