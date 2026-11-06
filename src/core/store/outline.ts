// `outline` store (DESIGN 3.4, 4.1). Plain: title, ref, bible id, cited sermon ids, dates.
// Sections and blocks are one AES-GCM ciphertext made by core/compose before reaching here.
// Index `by_sermon` (multiEntry on excerpt_sermon_ids) finds outlines that cite a sermon.
import { req, withTransaction } from './db';

export interface OutlineRecord {
  id: string;
  title: string;
  /** Canonical reference of the passage ("JHN 15:1-8"). */
  ref: string;
  bible_id: string;
  excerpt_sermon_ids: string[];
  created_at: number;
  updated_at: number;
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
}

export type OutlineMeta = Omit<OutlineRecord, 'ciphertext' | 'iv'>;

export async function putOutline(record: OutlineRecord, db?: IDBDatabase): Promise<void> {
  await withTransaction('outline', 'readwrite', (tx) => req(tx.objectStore('outline').put(record)), db);
}

export async function getOutline(id: string, db?: IDBDatabase): Promise<OutlineRecord | undefined> {
  return withTransaction('outline', 'readonly', (tx) => req(tx.objectStore('outline').get(id)) as Promise<OutlineRecord | undefined>, db);
}

/** Plain metadata only, newest first (ciphertext is not returned). */
export async function listOutlines(db?: IDBDatabase): Promise<OutlineMeta[]> {
  const rows = (await withTransaction('outline', 'readonly', (tx) => req(tx.objectStore('outline').getAll()), db)) as OutlineRecord[];
  return rows
    .map((r): OutlineMeta => ({ id: r.id, title: r.title, ref: r.ref, bible_id: r.bible_id, excerpt_sermon_ids: r.excerpt_sermon_ids, created_at: r.created_at, updated_at: r.updated_at }))
    .sort((a, b) => b.updated_at - a.updated_at);
}

export async function listOutlinesCiting(sermonId: string, db?: IDBDatabase): Promise<OutlineRecord[]> {
  return withTransaction(
    'outline',
    'readonly',
    (tx) => req(tx.objectStore('outline').index('by_sermon').getAll(IDBKeyRange.only(sermonId))) as Promise<OutlineRecord[]>,
    db,
  );
}

export async function deleteOutline(id: string, db?: IDBDatabase): Promise<void> {
  await withTransaction('outline', 'readwrite', (tx) => req(tx.objectStore('outline').delete(id)), db);
}

/** Thrown when an outline changed between reading it and the deletion transaction. */
export class StaleOutlineError extends Error {
  constructor() {
    super('outline changed during sermon deletion');
    this.name = 'StaleOutlineError';
  }
}

/** Replace an outline inside `tx` only if it still has the `updated_at` that was read. */
export async function replaceOutlineTx(tx: IDBTransaction, record: OutlineRecord, expectedUpdatedAt: number): Promise<void> {
  const store = tx.objectStore('outline');
  const current = (await req(store.get(record.id))) as OutlineRecord | undefined;
  if (!current) return; // deleted meanwhile: nothing left to clean
  if (current.updated_at !== expectedUpdatedAt) throw new StaleOutlineError();
  await req(store.put(record));
}
