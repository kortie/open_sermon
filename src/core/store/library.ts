// `library_item` store (DESIGN 3.5, 4.1): user-written everyday illustrations and light
// remarks, stored in plain text. Validation lives in core/compose/library.ts.
import { req, withTransaction } from './db';

export type LibraryKind = 'example' | 'one_liner';

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  body: string;
  /** Canonical references ("JHN 15:1-8"). */
  verse_refs: string[];
  tags: string[];
  created_at: number;
  updated_at: number;
}

export async function putLibraryItem(item: LibraryItem, db?: IDBDatabase): Promise<void> {
  await withTransaction('library_item', 'readwrite', (tx) => req(tx.objectStore('library_item').put(item)), db);
}

export async function listLibraryItems(db?: IDBDatabase): Promise<LibraryItem[]> {
  const rows = (await withTransaction('library_item', 'readonly', (tx) => req(tx.objectStore('library_item').getAll()), db)) as LibraryItem[];
  return rows.sort((a, b) => b.updated_at - a.updated_at);
}

export async function getLibraryItem(id: string, db?: IDBDatabase): Promise<LibraryItem | undefined> {
  return withTransaction('library_item', 'readonly', (tx) => req(tx.objectStore('library_item').get(id)) as Promise<LibraryItem | undefined>, db);
}

export async function deleteLibraryItem(id: string, db?: IDBDatabase): Promise<void> {
  await withTransaction('library_item', 'readwrite', (tx) => req(tx.objectStore('library_item').delete(id)), db);
}
