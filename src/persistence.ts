import type { HandwrittenDocument } from './model';
import { importedPage, type ImportedPage } from './importPng';

const DB_NAME = 'handwritten-publish';
const DB_VERSION = 1;
const STORE = 'drafts';
const CURRENT_KEY = 'current';

type StoredPage = {
  page: HandwrittenDocument['pages'][number];
  file: File;
};

type StoredDraft = {
  key: typeof CURRENT_KEY;
  document: HandwrittenDocument;
  pages: StoredPage[];
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local draft storage.'));
  });
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Local draft storage failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Local draft storage was aborted.'));
  });
}

export async function saveDraft(document: HandwrittenDocument, pages: ImportedPage[]): Promise<void> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE, 'readwrite');
    const done = complete(transaction);
    const store = transaction.objectStore(STORE);
    const stored: StoredDraft = {
      key: CURRENT_KEY,
      document,
      pages: pages.map(({ file, previewUrl: _previewUrl, ...page }) => ({ page, file })),
    };
    store.put(stored);
    await done;
  } finally {
    db.close();
  }
}

export async function loadDraft(): Promise<{ document: HandwrittenDocument; pages: ImportedPage[] } | null> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE, 'readonly');
    const done = complete(transaction);
    const request = transaction.objectStore(STORE).get(CURRENT_KEY);
    const stored = await new Promise<StoredDraft | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredDraft | undefined);
      request.onerror = () => reject(request.error ?? new Error('Could not read local draft.'));
    });
    await done;
    if (!stored) return null;
    return {
      document: stored.document,
      pages: stored.pages.map(({ page, file }) => importedPage(page, file)),
    };
  } finally {
    db.close();
  }
}

export async function clearDraft(): Promise<void> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE, 'readwrite');
    const done = complete(transaction);
    transaction.objectStore(STORE).delete(CURRENT_KEY);
    await done;
  } finally {
    db.close();
  }
}
