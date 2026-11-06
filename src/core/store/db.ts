// Thin Promise wrapper over IndexedDB (DESIGN 4.1, CLAUDE.md 4.4). Screens never touch
// IndexedDB directly; they call the typed helpers of this module (e.g. settings.ts).
//
// Versioning rule (DESIGN 4.1): MIGRATIONS[i] upgrades version i → i + 1, the DB version is
// MIGRATIONS.length. A step that needs a new store APPENDS one entry; existing entries never change.

export const DB_NAME = 'open_sermon';

export type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

export const MIGRATIONS: readonly Migration[] = [
  // v1 (S02): settings { key, value }
  (db) => {
    db.createObjectStore('settings', { keyPath: 'key' });
  },
  // v2 (S03): local_stats { date: 'YYYY-MM-DD', ...counters } — device-only metrics, never sent
  (db) => {
    db.createObjectStore('local_stats', { keyPath: 'date' });
  },
  // v3 (S04): device key, consent log, sermons (body and chunk text encrypted), style profiles
  (db) => {
    db.createObjectStore('crypto_key', { keyPath: 'id' });
    db.createObjectStore('consent_log', { keyPath: 'id' });
    db.createObjectStore('sermon_meta', { keyPath: 'id' });
    db.createObjectStore('sermon_body', { keyPath: 'sermon_id' });
    const chunks = db.createObjectStore('sermon_chunk', { keyPath: 'id' });
    chunks.createIndex('by_sermon', 'sermon_id');
    // Filled in S10; created now so sermon deletion can clear it in the same transaction.
    db.createObjectStore('style_profile', { keyPath: 'id' });
  },
  // v4 (S05): library items (plain), personas (plain codes), outlines (sections encrypted)
  (db) => {
    db.createObjectStore('library_item', { keyPath: 'id' });
    db.createObjectStore('persona', { keyPath: 'id' });
    const outlines = db.createObjectStore('outline', { keyPath: 'id' });
    outlines.createIndex('by_sermon', 'excerpt_sermon_ids', { multiEntry: true });
  },
  // v5 (S08): provider API keys { provider, key_ciphertext, iv, key_last4, created_at } (encrypted)
  (db) => {
    db.createObjectStore('provider_key', { keyPath: 'provider' });
  },
  // v6 (S09): generation cache { key, ciphertext, iv, prompt_version, provider, model, created_at }
  // (result encrypted; key = SHA-256 of prompt version, provider, model and prompt)
  (db) => {
    db.createObjectStore('gen_cache', { keyPath: 'key' });
  },
  // v7 (S11): user-imported bibles. imported_bible { id, name, language, encoding, verse_count,
  // partial, rights_consent_at, no_redistribute, created_at }; imported_verse { bible_id, book,
  // chapter, verse, text } (plain: the user's own file, kept on the device, excluded from backup by default)
  (db) => {
    db.createObjectStore('imported_bible', { keyPath: 'id' });
    const verses = db.createObjectStore('imported_verse', { keyPath: ['bible_id', 'book', 'chapter', 'verse'] });
    verses.createIndex('by_bible', 'bible_id');
  },
];

export type StoreName =
  | 'settings'
  | 'local_stats'
  | 'crypto_key'
  | 'consent_log'
  | 'sermon_meta'
  | 'sermon_body'
  | 'sermon_chunk'
  | 'style_profile'
  | 'library_item'
  | 'persona'
  | 'outline'
  | 'provider_key'
  | 'gen_cache'
  | 'imported_bible'
  | 'imported_verse';

/** Wrap an IDBRequest in a Promise. */
export function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}

/**
 * Open a database and run the pending migrations.
 * @param migrations defaults to MIGRATIONS; tests pass a prefix to simulate older app versions.
 */
export function openDb(name = DB_NAME, migrations: readonly Migration[] = MIGRATIONS): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, migrations.length);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      if (!tx) return;
      for (let v = event.oldVersion; v < migrations.length; v++) migrations[v]?.(db, tx);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading the schema: close so it can proceed.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB open blocked by another tab'));
  });
}

let shared: Promise<IDBDatabase> | null = null;

/** The app's shared connection (opened once). */
export function getDb(): Promise<IDBDatabase> {
  shared ??= openDb().catch((err: unknown) => {
    shared = null;
    throw err;
  });
  return shared;
}

/** Test helper: forget the shared connection (after closing it). */
export async function resetDbForTests(): Promise<void> {
  if (shared) (await shared.catch(() => null))?.close();
  shared = null;
}

/**
 * Run `fn` inside one transaction and resolve with its result after the transaction commits.
 * All requests made inside `fn` must be issued synchronously or chained via `req` without
 * awaiting unrelated promises (IndexedDB auto-commits idle transactions).
 */
export async function withTransaction<T>(
  stores: StoreName | StoreName[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T> | T,
  db?: IDBDatabase,
): Promise<T> {
  const conn = db ?? (await getDb());
  const tx = conn.transaction(stores, mode);
  const done = txDone(tx);
  let result: T;
  try {
    result = await fn(tx);
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // already finished
    }
    await done.catch(() => undefined);
    throw err;
  }
  await done;
  return result;
}
