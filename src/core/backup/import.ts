// Backup import (DESIGN 3.11, S06): parse → derive key → decrypt → resolve conflicts →
// re-encrypt with THIS device's key (fresh IVs) → write everything in one transaction.
// Any failure before or during the write leaves the existing data untouched.
import { validatePersona } from '../persona/validate';
import { encrypt } from '../vault/cipher';
import { getOrCreateDeviceKey } from '../vault/crypto-key';
import { getDb, req, withTransaction, type StoreName } from '../store/db';
import { importedVerseRange } from '../store/importedBible';
import type { OutlineRecord } from '../store/outline';
import type { SermonBodyRecord, SermonChunkRecord } from '../store/sermon';
import { computeSourceHash } from '../sermon/styleProfile';
import { BackupError, decodeFileText, parseEnvelope, parsePayload, type BackupPayload, type ParsedEnvelope } from './format';
import { deriveBackupKey } from './kdf';

export type ConflictPolicy = 'skip' | 'overwrite';

export interface ImportOptions {
  /** What to do when a record with the same id already exists. Default: skip. */
  onConflict?: ConflictPolicy;
  db?: IDBDatabase;
  deviceKey?: CryptoKey;
}

export type ReportedStore = 'sermon_meta' | 'persona' | 'library_item' | 'outline' | 'style_profile' | 'settings' | 'provider_key' | 'imported_bible';

export interface ImportReport {
  /** Records added or replaced, per store. */
  written: Record<ReportedStore, number>;
  /** Records left alone because the same id existed (policy skip) or the row was invalid. */
  skipped: number;
  /** Sermons skipped because a sermon with the same source_hash already exists. */
  duplicateSermons: number;
  /** Style profiles dropped or cleared because the sermon set no longer matches them. */
  profilesInvalidated: boolean;
}

export interface BackupInfo {
  createdAt: string;
  schemaVersion: number;
}

async function readBytes(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(new BackupError('CORRUPTED'));
    r.readAsArrayBuffer(file);
  });
}

async function readEnvelope(file: Blob, conn: IDBDatabase): Promise<ParsedEnvelope> {
  return parseEnvelope(decodeFileText(await readBytes(file)), conn.version);
}

/** Check the plain envelope only (no password). Throws BackupError. */
export async function inspectBackup(file: Blob, db?: IDBDatabase): Promise<BackupInfo> {
  const env = await readEnvelope(file, db ?? (await getDb()));
  return { createdAt: env.createdAt, schemaVersion: env.schemaVersion };
}

/** Decrypt a backup file into its payload. Throws BackupError (WRONG_PASSWORD on AES-GCM failure). */
export async function openBackup(file: Blob, password: string, db?: IDBDatabase): Promise<BackupPayload> {
  const env = await readEnvelope(file, db ?? (await getDb()));
  const key = await deriveBackupKey(password, env.salt, env.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: env.iv }, key, env.ciphertext);
  } catch {
    // Wrong password and a tampered ciphertext look the same to AES-GCM; do not guess.
    throw new BackupError('WRONG_PASSWORD');
  }
  return parsePayload(new TextDecoder().decode(plain));
}

const KEYED_STORES = ['persona', 'library_item', 'outline', 'style_profile', 'settings', 'consent_log', 'provider_key', 'imported_bible'] as const;
type KeyedStore = (typeof KEYED_STORES)[number];

interface Existing {
  sermons: Map<string, string>; // id → source_hash
  keys: Record<KeyedStore, Set<string>>;
  profiles: number;
}

async function readExisting(conn: IDBDatabase, present: Set<string>): Promise<Existing> {
  const keyed = KEYED_STORES.filter((s) => present.has(s));
  return withTransaction(
    ['sermon_meta', ...keyed] as StoreName[],
    'readonly',
    async (tx) => {
      const metas = (await req(tx.objectStore('sermon_meta').getAll())) as {
        id: string;
        source_hash: string;
      }[];
      const keys = Object.fromEntries(KEYED_STORES.map((s) => [s, new Set<string>()])) as Record<KeyedStore, Set<string>>;
      for (const s of keyed) {
        const ks = await req(tx.objectStore(s).getAllKeys());
        keys[s] = new Set(ks.map(String));
      }
      return {
        sermons: new Map(metas.map((m) => [m.id, m.source_hash])),
        keys,
        profiles: keys.style_profile.size,
      };
    },
    conn,
  );
}

const emptyWritten = (): Record<ReportedStore, number> => ({
  sermon_meta: 0,
  persona: 0,
  library_item: 0,
  outline: 0,
  style_profile: 0,
  settings: 0,
  provider_key: 0,
  imported_bible: 0,
});

/**
 * Restore a backup into this device. Conflicts (same id) follow `onConflict` (default skip);
 * sermons whose source_hash already exists are skipped as duplicates. Outlines keep their
 * excerpt quotes even when the cited sermon is not restored (DESIGN 3.11).
 */
export async function importBackup(file: Blob, password: string, opts: ImportOptions = {}): Promise<ImportReport> {
  const conn = opts.db ?? (await getDb());
  const policy: ConflictPolicy = opts.onConflict ?? 'skip';
  const payload = await openBackup(file, password, conn);
  const deviceKey = opts.deviceKey ?? (await getOrCreateDeviceKey(opts.db));
  const s = payload.stores;
  const present = new Set(Array.from(conn.objectStoreNames));
  const existing = await readExisting(conn, present);
  const report: ImportReport = {
    written: emptyWritten(),
    skipped: 0,
    duplicateSermons: 0,
    profilesInvalidated: false,
  };

  /** Generic id-keyed decision. */
  const take = (store: KeyedStore, id: string): boolean => {
    if (!existing.keys[store].has(id)) return true;
    if (policy === 'overwrite') return true;
    // Settings always exist after first run; keeping them is not worth reporting.
    if (store !== 'settings') report.skipped++;
    return false;
  };

  // --- sermons -------------------------------------------------------------------------------
  const hashes = new Set(existing.sermons.values());
  const writeSermons = new Set<string>();
  const replaced = new Set<string>();
  const finalHashes = new Map(existing.sermons); // id → hash after import
  for (const m of s.sermon_meta) {
    if (existing.sermons.has(m.id)) {
      if (policy === 'skip') {
        report.skipped++;
        continue;
      }
      replaced.add(m.id);
    } else if (hashes.has(m.source_hash)) {
      report.duplicateSermons++;
      continue;
    }
    writeSermons.add(m.id);
    hashes.add(m.source_hash);
    finalHashes.set(m.id, m.source_hash);
  }
  const metas = s.sermon_meta.filter((m) => writeSermons.has(m.id));
  report.written.sermon_meta = metas.length;

  // Style profiles are built from the whole sermon set (S10 computeSourceHash): a backup profile is
  // restored only when its source_hash equals the hash of the sermon set after the import.
  const sermonsChanged = writeSermons.size > 0;
  const finalSetHash = await computeSourceHash([...new Set(finalHashes.values())].map((h) => ({ source_hash: h })));
  const fitting = s.style_profile.filter((p) => p.source_hash === finalSetHash && typeof p.profile_json === 'string');
  const clearProfiles = sermonsChanged && existing.profiles > 0;
  const profiles = fitting.filter((p) => clearProfiles || take('style_profile', p.id as string));
  report.profilesInvalidated = clearProfiles || fitting.length < s.style_profile.length;
  report.written.style_profile = profiles.length;

  // --- other stores ---------------------------------------------------------------------------
  const personas = s.persona.filter((p) => {
    if (!validatePersona(p).ok) {
      report.skipped++;
      return false;
    }
    return take('persona', p.id as string);
  });
  const library = s.library_item.filter((i) => take('library_item', i.id as string));
  const outlines = s.outline.filter((o) => take('outline', o.id));
  const settings = s.settings.filter((r) => take('settings', r.key));
  const consents = s.consent_log.filter((c) => {
    if (existing.keys.consent_log.has(c.id)) return false; // a log: never rewritten
    if (c.kind === 'sermon_rights') return c.target_id !== null && writeSermons.has(c.target_id);
    return true;
  });
  const keys = present.has('provider_key') ? (s.provider_key ?? []).filter((k) => take('provider_key', k.provider)) : [];
  const bibles = present.has('imported_bible') ? (s.imported_bible ?? []).filter((b) => take('imported_bible', b.id as string)) : [];
  const bibleIds = new Set(bibles.map((b) => b.id as string));
  const verses = present.has('imported_verse') ? (s.imported_verse ?? []).filter((v) => bibleIds.has(v.bible_id as string)) : [];
  report.written.persona = personas.length;
  report.written.library_item = library.length;
  report.written.outline = outlines.length;
  report.written.settings = settings.length;
  report.written.provider_key = keys.length;
  report.written.imported_bible = bibles.length;

  // --- re-encrypt with this device's key (before the write transaction) -----------------------
  const bodies: SermonBodyRecord[] = await Promise.all(
    s.sermon_body
      .filter((b) => writeSermons.has(b.sermon_id))
      .map(async (b) => ({
        sermon_id: b.sermon_id,
        ...(await encrypt(b.text, deviceKey)),
      })),
  );
  const chunks: SermonChunkRecord[] = await Promise.all(
    s.sermon_chunk
      .filter((c) => writeSermons.has(c.sermon_id))
      .map(async (c) => ({
        id: c.id,
        sermon_id: c.sermon_id,
        seq: c.seq,
        keywords: c.keywords,
        verse_refs: c.verse_refs,
        ...(await encrypt(c.text, deviceKey)),
      })),
  );
  const outlineRecords: OutlineRecord[] = await Promise.all(
    outlines.map(async (o) => ({
      id: o.id,
      title: o.title,
      ref: o.ref,
      bible_id: o.bible_id,
      excerpt_sermon_ids: o.excerpt_sermon_ids,
      created_at: o.created_at,
      updated_at: o.updated_at,
      ...(await encrypt(o.body, deviceKey)),
    })),
  );
  const keyRecords = await Promise.all(
    keys.map(async (k) => {
      const e = await encrypt(k.key, deviceKey);
      return {
        provider: k.provider,
        key_ciphertext: e.ciphertext,
        iv: e.iv,
        key_last4: k.key_last4,
        created_at: k.created_at,
      };
    }),
  );

  // --- one transaction --------------------------------------------------------------------------
  const stores: StoreName[] = ['sermon_meta', 'sermon_body', 'sermon_chunk', 'style_profile', 'persona', 'library_item', 'outline', 'settings', 'consent_log'];
  for (const opt of ['provider_key', 'imported_bible', 'imported_verse']) if (present.has(opt)) stores.push(opt as StoreName);
  await withTransaction(
    stores,
    'readwrite',
    async (tx) => {
      // Replaced sermons: drop their old chunks first (chunk ids may differ).
      const oldChunkKeys = await Promise.all([...replaced].map((id) => req(tx.objectStore('sermon_chunk').index('by_sermon').getAllKeys(IDBKeyRange.only(id)))));
      const ops: Promise<unknown>[] = [];
      try {
        queue();
      } catch (err) {
        // A synchronous put failure aborts the transaction; keep the issued requests' rejections handled.
        void Promise.allSettled(ops);
        throw err;
      }
      await Promise.all(ops);

      function queue() {
        for (const k of oldChunkKeys.flat()) ops.push(req(tx.objectStore('sermon_chunk').delete(k)));
        if (clearProfiles) ops.push(req(tx.objectStore('style_profile').clear()));
        // A replaced imported bible: drop all its old verses first (the new copy may have fewer).
        if (present.has('imported_verse')) for (const id of bibleIds) ops.push(req(tx.objectStore('imported_verse').delete(importedVerseRange(id))));
        const put = (store: string, rows: readonly unknown[]) => {
          for (const r of rows) ops.push(req(tx.objectStore(store).put(r)));
        };
        put('sermon_meta', metas);
        put('sermon_body', bodies);
        put('sermon_chunk', chunks);
        put('style_profile', profiles);
        put('persona', personas);
        put('library_item', library);
        put('outline', outlineRecords);
        put('settings', settings);
        put('consent_log', consents);
        if (present.has('provider_key')) put('provider_key', keyRecords);
        if (present.has('imported_bible')) put('imported_bible', bibles);
        if (present.has('imported_verse')) put('imported_verse', verses);
      }
    },
    conn,
  );
  return report;
}
