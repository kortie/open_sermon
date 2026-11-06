// Backup export (DESIGN 3.11, S06): read the stores → decrypt device-encrypted fields →
// re-encrypt the whole payload with a password-derived key → Blob. No network, no storage of
// the password or the derived key. Saving the file is the user's own action (download link).
import { decryptText } from '../vault/cipher';
import { getOrCreateDeviceKey } from '../vault/crypto-key';
import { putConsentTx, type ConsentRecord } from '../store/consent';
import { getDb, req, withTransaction, type StoreName } from '../store/db';
import type { OutlineRecord } from '../store/outline';
import type { SermonBodyRecord, SermonChunkRecord, SermonMeta } from '../store/sermon';
import { BACKUP_EXTENSION, BACKUP_SETTING_KEYS, BACKUP_VERSION, buildEnvelope, serializeEnvelope, type BackupPayload, type BackupStores } from './format';
import { deriveBackupKey, MIN_PASSWORD_LENGTH, PBKDF2_ITERATIONS, passwordLength, randomSalt } from './kdf';

export type PasswordProblem = 'too_short' | 'mismatch';

/** Export password rule: at least 8 characters, typed twice the same (DESIGN 3.11). */
export function checkBackupPassword(password: string, confirm: string): PasswordProblem | null {
  if (passwordLength(password) < MIN_PASSWORD_LENGTH) return 'too_short';
  if (password.normalize('NFC') !== confirm.normalize('NFC')) return 'mismatch';
  return null;
}

export interface ExportOptions {
  password: string;
  /** Include provider keys (plain inside the ciphertext). The caller has shown the separate confirmation. */
  includeKeys?: boolean;
  /** Include user-imported bibles (off by default; the screen asks once more, DESIGN 3.14). */
  includeImportedBibles?: boolean;
  db?: IDBDatabase;
  deviceKey?: CryptoKey;
  /** Tests only: a lower count keeps unit tests fast. Real exports use config. */
  iterations?: number;
  now?: () => number;
}

/** Stores that may be missing in this app version (created by later steps). */
const OPTIONAL_STORES = ['provider_key', 'imported_bible', 'imported_verse'] as const;
const BASE_STORES: StoreName[] = ['sermon_meta', 'sermon_body', 'sermon_chunk', 'style_profile', 'persona', 'library_item', 'outline', 'settings', 'consent_log'];
const KEY_CONSENTS = new Set(['backup_include_key']);
const BIBLE_CONSENTS = new Set(['bible_rights', 'backup_include_bible']);

interface ProviderKeyRecord {
  provider: string;
  key_ciphertext: ArrayBuffer;
  iv: Uint8Array;
  key_last4: string;
  created_at: number;
}

interface RawStores {
  sermon_meta: SermonMeta[];
  sermon_body: SermonBodyRecord[];
  sermon_chunk: SermonChunkRecord[];
  style_profile: Record<string, unknown>[];
  persona: Record<string, unknown>[];
  library_item: Record<string, unknown>[];
  outline: OutlineRecord[];
  settings: { key: string; value: unknown }[];
  consent_log: ConsentRecord[];
  provider_key?: ProviderKeyRecord[];
  imported_bible?: Record<string, unknown>[];
  imported_verse?: Record<string, unknown>[];
}

/** File name suggested for the download, e.g. open-sermon-20261105-1430.osbackup. */
export function backupFileName(at: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `open-sermon-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${BACKUP_EXTENSION}`;
}

/** Number of provider keys stored on this device (0 before S08 adds the store). */
export async function countProviderKeys(db?: IDBDatabase): Promise<number> {
  const conn = db ?? (await getDb());
  if (!conn.objectStoreNames.contains('provider_key')) return 0;
  return withTransaction('provider_key' as StoreName, 'readonly', (tx) => req(tx.objectStore('provider_key').count()), conn);
}

async function readStores(conn: IDBDatabase, includeKeys: boolean, includeBibles: boolean): Promise<RawStores> {
  const optional = OPTIONAL_STORES.filter((s) => conn.objectStoreNames.contains(s) && (s === 'provider_key' ? includeKeys : includeBibles));
  const names = [...BASE_STORES, ...(optional as unknown as StoreName[])];
  return withTransaction(
    names,
    'readonly',
    async (tx) => {
      const entries = await Promise.all(names.map(async (n) => [n, await req(tx.objectStore(n).getAll())] as const));
      return Object.fromEntries(entries) as unknown as RawStores;
    },
    conn,
  );
}

/** Decrypted payload (exported for tests; never log or persist the result). */
export async function collectPayload(opts: Omit<ExportOptions, 'password' | 'iterations'>): Promise<BackupPayload> {
  const conn = opts.db ?? (await getDb());
  const key = opts.deviceKey ?? (await getOrCreateDeviceKey(opts.db));
  const includeKeys = opts.includeKeys === true;
  const includeBibles = opts.includeImportedBibles === true;
  const now = opts.now ?? Date.now;

  // The key-inclusion confirmation is recorded before anything is read (S06: record, then include).
  const consents: ConsentRecord[] = [];
  if (includeKeys)
    consents.push({
      id: crypto.randomUUID(),
      kind: 'backup_include_key',
      target_id: null,
      granted: true,
      at: now(),
    });
  if (includeBibles)
    consents.push({
      id: crypto.randomUUID(),
      kind: 'backup_include_bible',
      target_id: null,
      granted: true,
      at: now(),
    });
  if (consents.length > 0) {
    await withTransaction('consent_log', 'readwrite', (tx) => Promise.all(consents.map((c) => putConsentTx(tx, c))), conn);
  }

  const raw = await readStores(conn, includeKeys, includeBibles);

  const stores: BackupStores = {
    sermon_meta: raw.sermon_meta.map((m) => ({
      id: m.id,
      title: m.title,
      source_hash: m.source_hash,
      consent_at: m.consent_at,
      created_at: m.created_at,
    })),
    sermon_body: await Promise.all(
      raw.sermon_body.map(async (b) => ({
        sermon_id: b.sermon_id,
        text: await decryptText(b.ciphertext, b.iv, key),
      })),
    ),
    sermon_chunk: await Promise.all(
      raw.sermon_chunk.map(async (c) => ({
        id: c.id,
        sermon_id: c.sermon_id,
        seq: c.seq,
        text: await decryptText(c.ciphertext, c.iv, key),
        keywords: c.keywords,
        verse_refs: c.verse_refs,
      })),
    ),
    style_profile: raw.style_profile,
    persona: raw.persona,
    library_item: raw.library_item,
    outline: await Promise.all(
      raw.outline.map(async (o) => ({
        id: o.id,
        title: o.title,
        ref: o.ref,
        bible_id: o.bible_id,
        excerpt_sermon_ids: o.excerpt_sermon_ids,
        created_at: o.created_at,
        updated_at: o.updated_at,
        body: await decryptText(o.ciphertext, o.iv, key),
      })),
    ),
    settings: raw.settings.filter((s) => (BACKUP_SETTING_KEYS as readonly string[]).includes(s.key)).map((s) => ({ key: s.key, value: s.value })),
    // Consent records travel only with the data they belong to.
    consent_log: raw.consent_log.filter((c) => (includeKeys || !KEY_CONSENTS.has(c.kind)) && (includeBibles || !BIBLE_CONSENTS.has(c.kind))),
  };
  if (raw.provider_key) {
    stores.provider_key = await Promise.all(
      raw.provider_key.map(async (k) => ({
        provider: k.provider,
        key: await decryptText(k.key_ciphertext, k.iv, key),
        key_last4: k.key_last4,
        created_at: k.created_at,
      })),
    );
  }
  if (raw.imported_bible) stores.imported_bible = raw.imported_bible;
  if (raw.imported_verse) stores.imported_verse = raw.imported_verse;
  return { version: BACKUP_VERSION, stores };
}

/**
 * Build the encrypted backup file. The caller checks the password with checkBackupPassword
 * first; a password that breaks the rule is rejected here too.
 */
export async function exportBackup(opts: ExportOptions): Promise<Blob> {
  if (passwordLength(opts.password) < MIN_PASSWORD_LENGTH) throw new RangeError('backup password too short');
  const conn = opts.db ?? (await getDb());
  const payload = await collectPayload({ ...opts, db: conn });
  const iterations = opts.iterations ?? PBKDF2_ITERATIONS;
  const salt = randomSalt();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const backupKey = await deriveBackupKey(opts.password, salt, iterations);
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, backupKey, plain));
  plain.fill(0);
  const now = opts.now ?? Date.now;
  const envelope = buildEnvelope({
    schemaVersion: conn.version,
    iterations,
    salt,
    iv,
    ciphertext,
    createdAt: new Date(now()),
  });
  return new Blob([serializeEnvelope(envelope)], {
    type: 'application/octet-stream',
  });
}
