// Backup file format (DESIGN 3.11, S06, skill local-backup §4.1).
// The plain envelope carries only format/version/KDF/cipher parameters and a creation time:
// no titles, counts or any other user data. Everything else is inside the AES-GCM ciphertext.

export const BACKUP_FORMAT = 'open-sermon-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_EXTENSION = '.osbackup';
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
/** AES-GCM tag length; a ciphertext shorter than this cannot be valid. */
const TAG_BYTES = 16;
/** Iteration counts above this are rejected (a broken or hostile file could stall the device). */
export const MAX_ITERATIONS = 10_000_000;

export type BackupErrorCode = 'NOT_BACKUP' | 'CORRUPTED' | 'WRONG_PASSWORD' | 'UNSUPPORTED_VERSION';

/** Import/export failure with a cause code only; never carries passwords or file content. */
export class BackupError extends Error {
  constructor(readonly code: BackupErrorCode) {
    super(`backup: ${code}`);
    this.name = 'BackupError';
  }
}

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  /** IndexedDB schema version of the exporting app (DB version = MIGRATIONS.length). */
  schema_version: number;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  ciphertext: string;
  /** ISO 8601. */
  created_at: string;
}

/** Envelope with base64 fields decoded, ready for key derivation and decryption. */
export interface ParsedEnvelope {
  schemaVersion: number;
  iterations: number;
  salt: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
  createdAt: string;
}

const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/** Strict base64 decode; throws BackupError('CORRUPTED') on anything malformed. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  if (text.length % 4 !== 0 || !B64_RE.test(text)) throw new BackupError('CORRUPTED');
  let bin: string;
  try {
    bin = atob(text);
  } catch {
    throw new BackupError('CORRUPTED');
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function buildEnvelope(p: { schemaVersion: number; iterations: number; salt: Uint8Array; iv: Uint8Array; ciphertext: Uint8Array; createdAt: Date }): BackupEnvelope {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    schema_version: p.schemaVersion,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: p.iterations,
      salt: toBase64(p.salt),
    },
    cipher: { name: 'AES-GCM', iv: toBase64(p.iv) },
    ciphertext: toBase64(p.ciphertext),
    created_at: p.createdAt.toISOString(),
  };
}

export function serializeEnvelope(e: BackupEnvelope): string {
  return JSON.stringify(e);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPosInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

/**
 * Decode the file bytes as UTF-8 text. Binary files (images, archives) are not backups.
 */
export function decodeFileText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new BackupError('NOT_BACKUP');
  }
}

/**
 * Parse and check an envelope.
 * - not JSON (e.g. truncated) → CORRUPTED
 * - JSON but not our format → NOT_BACKUP
 * - unknown `version`, or `schema_version` newer than this app → UNSUPPORTED_VERSION
 * - missing/invalid parameters or base64 → CORRUPTED
 */
export function parseEnvelope(text: string, currentSchemaVersion: number): ParsedEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('CORRUPTED');
  }
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT) throw new BackupError('NOT_BACKUP');
  if (raw.version !== BACKUP_VERSION) throw new BackupError('UNSUPPORTED_VERSION');
  if (!isPosInt(raw.schema_version)) throw new BackupError('CORRUPTED');
  if (raw.schema_version > currentSchemaVersion) throw new BackupError('UNSUPPORTED_VERSION');

  const { kdf, cipher } = raw;
  if (!isObject(kdf) || kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256') throw new BackupError('CORRUPTED');
  if (!isPosInt(kdf.iterations) || kdf.iterations > MAX_ITERATIONS) throw new BackupError('CORRUPTED');
  if (!isObject(cipher) || cipher.name !== 'AES-GCM') throw new BackupError('CORRUPTED');
  if (typeof kdf.salt !== 'string' || typeof cipher.iv !== 'string' || typeof raw.ciphertext !== 'string' || typeof raw.created_at !== 'string') {
    throw new BackupError('CORRUPTED');
  }
  const salt = fromBase64(kdf.salt);
  const iv = fromBase64(cipher.iv);
  const ciphertext = fromBase64(raw.ciphertext);
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || ciphertext.length < TAG_BYTES) throw new BackupError('CORRUPTED');
  return {
    schemaVersion: raw.schema_version,
    iterations: kdf.iterations,
    salt,
    iv,
    ciphertext,
    createdAt: raw.created_at,
  };
}

// ---------------------------------------------------------------------------------------------
// Payload (inside the ciphertext). Device-encrypted fields are carried as decrypted plain text,
// because the device key differs on every device (DESIGN 4.2).

export interface PlainSermonBody {
  sermon_id: string;
  text: string;
}

export interface PlainSermonChunk {
  id: string;
  sermon_id: string;
  seq: number;
  text: string;
  keywords: string[];
  verse_refs: string[];
}

export interface PlainOutline {
  id: string;
  title: string;
  ref: string;
  bible_id: string;
  excerpt_sermon_ids: string[];
  created_at: number;
  updated_at: number;
  /** Decrypted outline body (the JSON text made by core/compose). */
  body: string;
}

export interface PlainProviderKey {
  provider: string;
  key: string;
  key_last4: string;
  created_at: number;
}

export interface BackupStores {
  sermon_meta: {
    id: string;
    title: string;
    source_hash: string;
    consent_at: number;
    created_at: number;
  }[];
  sermon_body: PlainSermonBody[];
  sermon_chunk: PlainSermonChunk[];
  style_profile: Record<string, unknown>[];
  persona: Record<string, unknown>[];
  library_item: Record<string, unknown>[];
  outline: PlainOutline[];
  settings: { key: string; value: unknown }[];
  consent_log: {
    id: string;
    kind: string;
    target_id: string | null;
    granted: boolean;
    at: number;
  }[];
  provider_key?: PlainProviderKey[];
  imported_bible?: Record<string, unknown>[];
  imported_verse?: Record<string, unknown>[];
}

export interface BackupPayload {
  version: typeof BACKUP_VERSION;
  stores: BackupStores;
}

/** Settings rows carried in a backup (language, bible, active persona). */
export const BACKUP_SETTING_KEYS = ['ui_language', 'bible_id', 'bible_user_chosen', 'persona_id'] as const;

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

type Check = (row: Record<string, unknown>) => boolean;

const CHECKS: Record<keyof BackupStores, Check> = {
  sermon_meta: (r) => isStr(r.id) && isStr(r.title) && isStr(r.source_hash) && isNum(r.consent_at) && isNum(r.created_at),
  sermon_body: (r) => isStr(r.sermon_id) && isStr(r.text),
  sermon_chunk: (r) => isStr(r.id) && isStr(r.sermon_id) && isNum(r.seq) && isStr(r.text) && isStrArr(r.keywords) && isStrArr(r.verse_refs),
  style_profile: (r) => isStr(r.id),
  persona: (r) => isStr(r.id),
  library_item: (r) => isStr(r.id) && isStr(r.kind) && isStr(r.body) && isStrArr(r.verse_refs) && isStrArr(r.tags) && isNum(r.created_at) && isNum(r.updated_at),
  outline: (r) =>
    isStr(r.id) && isStr(r.title) && isStr(r.ref) && isStr(r.bible_id) && isStrArr(r.excerpt_sermon_ids) && isNum(r.created_at) && isNum(r.updated_at) && isStr(r.body),
  settings: (r) => isStr(r.key) && (BACKUP_SETTING_KEYS as readonly string[]).includes(r.key) && 'value' in r,
  consent_log: (r) => isStr(r.id) && isStr(r.kind) && (r.target_id === null || isStr(r.target_id)) && typeof r.granted === 'boolean' && isNum(r.at),
  provider_key: (r) => isStr(r.provider) && isStr(r.key) && isStr(r.key_last4) && isNum(r.created_at),
  imported_bible: (r) => isStr(r.id),
  imported_verse: (r) => isStr(r.bible_id),
};

const REQUIRED: (keyof BackupStores)[] = ['sermon_meta', 'sermon_body', 'sermon_chunk', 'style_profile', 'persona', 'library_item', 'outline', 'settings', 'consent_log'];
const OPTIONAL: (keyof BackupStores)[] = ['provider_key', 'imported_bible', 'imported_verse'];

/** Check the decrypted payload shape; anything unexpected is CORRUPTED. */
export function parsePayload(text: string): BackupPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('CORRUPTED');
  }
  if (!isObject(raw) || raw.version !== BACKUP_VERSION || !isObject(raw.stores)) throw new BackupError('CORRUPTED');
  const stores = raw.stores;
  for (const name of [...REQUIRED, ...OPTIONAL]) {
    const rows = stores[name];
    if (rows === undefined && OPTIONAL.includes(name)) continue;
    if (!Array.isArray(rows) || !rows.every((r) => isObject(r) && CHECKS[name](r))) throw new BackupError('CORRUPTED');
  }
  return raw as unknown as BackupPayload;
}
