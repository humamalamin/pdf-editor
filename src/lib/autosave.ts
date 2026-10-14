import type { Annotation } from "@/lib/annotations";
import type { FormValues } from "@/lib/forms";

// Keeps the last edited document in this browser (IndexedDB) so a closed tab or refresh doesn't
// lose work. Nothing leaves the device. The PDF itself is stored separately from the edit state
// so frequent state saves don't rewrite a multi-megabyte file each time.

const DB_NAME = "pdfeditor";
const DB_VERSION = 1;
const STORE = "autosave";
const FILE_KEY = "file";
const STATE_KEY = "state";
const SCHEMA_VERSION = 1;

export type SessionState = {
  version: number;
  fileName: string;
  fileSize: number;
  annotations: Annotation[];
  formValues: FormValues;
  currentPage: number;
  savedAt: number; // epoch ms
};

export type SavedSession = { file: File; state: SessionState };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve((request ? request.result : undefined) as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Stores the PDF being edited. Call once per document, not on every edit. */
export const saveSessionFile = (file: File) => run<void>("readwrite", (store) => store.put(file, FILE_KEY));

export const saveSessionState = (state: Omit<SessionState, "version" | "savedAt">) =>
  run<void>("readwrite", (store) =>
    store.put({ ...state, version: SCHEMA_VERSION, savedAt: Date.now() } satisfies SessionState, STATE_KEY)
  );

export async function loadSession(): Promise<SavedSession | null> {
  try {
    const [file, state] = await Promise.all([
      run<File | undefined>("readonly", (store) => store.get(FILE_KEY)),
      run<SessionState | undefined>("readonly", (store) => store.get(STATE_KEY)),
    ]);
    // Both halves must exist and belong together; anything else is stale
    if (!file || !state || state.version !== SCHEMA_VERSION || state.fileName !== file.name || state.fileSize !== file.size) {
      return null;
    }
    return { file, state };
  } catch {
    return null;
  }
}

export const clearSession = () =>
  run<void>("readwrite", (store) => {
    store.delete(FILE_KEY);
    store.delete(STATE_KEY);
  }).catch(() => undefined);

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "5 minutes ago", "yesterday", … */
export function timeAgo(epochMs: number) {
  const seconds = Math.round((epochMs - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relativeTime.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
