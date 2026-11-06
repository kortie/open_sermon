// Sermon stores (DESIGN 4.1). Only sermon_meta is plain. Body and chunk text are AES-GCM
// ciphertexts made by core/vault before they reach this module; chunk keywords and verse
// references are plain words/references used for search (never sentences).
import { putConsentTx, type ConsentRecord } from './consent';
import { req, withTransaction, type StoreName } from './db';
import { replaceOutlineTx, type OutlineRecord } from './outline';
import { wipeStyleProfilesTx } from './styleProfile';

export interface SermonMeta {
  id: string;
  title: string;
  /** SHA-256 (hex) of the masked text; style profiles compare it (S10). */
  source_hash: string;
  consent_at: number;
  created_at: number;
}

export interface SermonBodyRecord {
  sermon_id: string;
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
}

export interface SermonChunkRecord {
  id: string;
  sermon_id: string;
  seq: number;
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
  keywords: string[];
  verse_refs: string[];
}

const SAVE_STORES: StoreName[] = ['sermon_meta', 'sermon_body', 'sermon_chunk', 'consent_log'];
export const DELETE_STORES: StoreName[] = ['sermon_meta', 'sermon_body', 'sermon_chunk', 'style_profile'];

/** Save one sermon and its consent record in a single transaction. */
export function putSermon(
  meta: SermonMeta,
  body: SermonBodyRecord,
  chunks: readonly SermonChunkRecord[],
  consent: ConsentRecord,
  db?: IDBDatabase,
): Promise<void> {
  return withTransaction(
    SAVE_STORES,
    'readwrite',
    async (tx) => {
      const puts = [
        req(tx.objectStore('sermon_meta').put(meta)),
        req(tx.objectStore('sermon_body').put(body)),
        ...chunks.map((c) => req(tx.objectStore('sermon_chunk').put(c))),
        putConsentTx(tx, consent),
      ];
      await Promise.all(puts);
    },
    db,
  );
}

export async function listSermons(db?: IDBDatabase): Promise<SermonMeta[]> {
  const all = await withTransaction('sermon_meta', 'readonly', (tx) => req(tx.objectStore('sermon_meta').getAll()) as Promise<SermonMeta[]>, db);
  return all.sort((a, b) => b.created_at - a.created_at);
}

export function getSermonBody(id: string, db?: IDBDatabase): Promise<SermonBodyRecord | undefined> {
  return withTransaction('sermon_body', 'readonly', (tx) => req(tx.objectStore('sermon_body').get(id)) as Promise<SermonBodyRecord | undefined>, db);
}

export async function getSermonChunks(id: string, db?: IDBDatabase): Promise<SermonChunkRecord[]> {
  const rows = await withTransaction(
    'sermon_chunk',
    'readonly',
    (tx) => req(tx.objectStore('sermon_chunk').index('by_sermon').getAll(IDBKeyRange.only(id))) as Promise<SermonChunkRecord[]>,
    db,
  );
  return rows.sort((a, b) => a.seq - b.seq);
}

/**
 * Delete requests for one sermon inside a transaction over DELETE_STORES.
 * Style profiles are built from all sermons together, so any deletion invalidates them all: their
 * content is wiped and only a content-free stale marker stays (S10).
 */
export async function deleteSermonTx(tx: IDBTransaction, id: string): Promise<void> {
  const chunkKeys = await req(tx.objectStore('sermon_chunk').index('by_sermon').getAllKeys(IDBKeyRange.only(id)));
  await Promise.all([
    req(tx.objectStore('sermon_meta').delete(id)),
    req(tx.objectStore('sermon_body').delete(id)),
    ...chunkKeys.map((k) => req(tx.objectStore('sermon_chunk').delete(k))),
    wipeStyleProfilesTx(tx),
  ]);
}

export interface OutlineUpdate {
  record: OutlineRecord;
  /** `updated_at` of the record as it was read; a different value aborts the deletion. */
  expectedUpdatedAt: number;
}

/**
 * Hard delete (no soft delete) of meta, body, chunks and style profiles in one transaction,
 * together with the outlines that cited the sermon (their excerpt blocks already removed and
 * re-encrypted by the caller, core/sermon deleteSermon). Throws StaleOutlineError when one of
 * those outlines was saved meanwhile; nothing is deleted then.
 */
export function deleteSermon(id: string, db?: IDBDatabase, outlineUpdates: readonly OutlineUpdate[] = []): Promise<void> {
  return withTransaction(
    [...DELETE_STORES, 'outline'],
    'readwrite',
    async (tx) => {
      await Promise.all(outlineUpdates.map((u) => replaceOutlineTx(tx, u.record, u.expectedUpdatedAt)));
      await deleteSermonTx(tx, id);
    },
    db,
  );
}
