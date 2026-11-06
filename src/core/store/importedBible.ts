// imported_bible / imported_verse stores (DESIGN 3.14, 4.1; S11). A user-imported bible is the
// user's own file kept on this device: saved together with its rights consent in one transaction,
// deleted with all its verses in one transaction, excluded from backup unless the user opts in.
import { putConsentTx, type ConsentRecord } from './consent';
import { req, withTransaction } from './db';

/** Ids of imported bibles start with this prefix, so they never collide with bundled ids. */
export const IMPORTED_PREFIX = 'imp-';

export const isImportedBibleId = (id: string): boolean => id.startsWith(IMPORTED_PREFIX);

export interface ImportedBibleRecord {
  id: string;
  name: string;
  language: 'ko' | 'en';
  encoding: string;
  verse_count: number;
  /** Not all 66 books are present. */
  partial: boolean;
  /** Epoch ms of the rights check. */
  rights_consent_at: number;
  /** Always true: the text is for personal use on this device only. */
  no_redistribute: true;
  created_at: number;
}

export interface ImportedVerseRecord {
  bible_id: string;
  book: number;
  chapter: number;
  verse: number;
  text: string;
}

/** Every verse key of one bible ([id] < [id, book, chapter, verse] < [id, []]). */
export function importedVerseRange(bibleId: string): IDBKeyRange {
  return IDBKeyRange.bound([bibleId], [bibleId, []]);
}

/** Bible, verses and the rights consent in one transaction; any failure stores nothing. */
export async function putImportedBible(
  meta: ImportedBibleRecord,
  verses: readonly ImportedVerseRecord[],
  consent: ConsentRecord,
  db?: IDBDatabase,
): Promise<void> {
  await withTransaction(
    ['imported_bible', 'imported_verse', 'consent_log'],
    'readwrite',
    async (tx) => {
      const ops: Promise<unknown>[] = [req(tx.objectStore('imported_verse').delete(importedVerseRange(meta.id)))];
      try {
        ops.push(req(tx.objectStore('imported_bible').put(meta)));
        const store = tx.objectStore('imported_verse');
        for (const v of verses) ops.push(req(store.put(v)));
        ops.push(putConsentTx(tx, consent));
      } catch (err) {
        void Promise.allSettled(ops);
        throw err;
      }
      await Promise.all(ops);
    },
    db,
  );
}

export function listImportedBibles(db?: IDBDatabase): Promise<ImportedBibleRecord[]> {
  return withTransaction(
    'imported_bible',
    'readonly',
    async (tx) => ((await req(tx.objectStore('imported_bible').getAll())) as ImportedBibleRecord[]).sort((a, b) => a.created_at - b.created_at),
    db,
  );
}

export function getImportedVerses(bibleId: string, db?: IDBDatabase): Promise<ImportedVerseRecord[]> {
  return withTransaction(
    'imported_verse',
    'readonly',
    (tx) => req(tx.objectStore('imported_verse').getAll(importedVerseRange(bibleId))) as Promise<ImportedVerseRecord[]>,
    db,
  );
}

export function countImportedVerses(bibleId: string, db?: IDBDatabase): Promise<number> {
  return withTransaction('imported_verse', 'readonly', (tx) => req(tx.objectStore('imported_verse').count(importedVerseRange(bibleId))), db);
}

/** Delete one imported bible and all its verses (one transaction). Consent records stay (a log). */
export async function deleteImportedBible(bibleId: string, db?: IDBDatabase): Promise<void> {
  await withTransaction(
    ['imported_bible', 'imported_verse'],
    'readwrite',
    (tx) => Promise.all([req(tx.objectStore('imported_verse').delete(importedVerseRange(bibleId))), req(tx.objectStore('imported_bible').delete(bibleId))]),
    db,
  );
}
