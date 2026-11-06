// Device key (DESIGN 4.2, CLAUDE.md rule 4): AES-GCM 256, non-extractable, kept as a CryptoKey
// object in the crypto_key store. JavaScript can use it but can never read its bytes.
import { req, withTransaction } from '../store/db';

const DEVICE_KEY_ID = 'device';

interface KeyRecord {
  id: string;
  key: CryptoKey;
}

async function readKey(db?: IDBDatabase): Promise<CryptoKey | null> {
  const rec = await withTransaction('crypto_key', 'readonly', (tx) => req(tx.objectStore('crypto_key').get(DEVICE_KEY_ID)) as Promise<KeyRecord | undefined>, db);
  return rec?.key ?? null;
}

function generate(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function create(db?: IDBDatabase): Promise<CryptoKey> {
  const existing = await readKey(db);
  if (existing) return existing;
  const fresh = await generate();
  // Another tab may have stored a key meanwhile: `add` fails then, and we use the stored one.
  try {
    await withTransaction('crypto_key', 'readwrite', (tx) => req(tx.objectStore('crypto_key').add({ id: DEVICE_KEY_ID, key: fresh } satisfies KeyRecord)), db);
    return fresh;
  } catch {
    const stored = await readKey(db);
    if (stored) return stored;
    throw new Error('device key unavailable');
  }
}

let shared: Promise<CryptoKey> | null = null;

/** The device key; created and stored on first use. Pass `db` to use a specific database (tests). */
export function getOrCreateDeviceKey(db?: IDBDatabase): Promise<CryptoKey> {
  if (db) return create(db);
  shared ??= create().catch((err: unknown) => {
    shared = null;
    throw err;
  });
  return shared;
}

/** Test helper: forget the cached key promise. */
export function resetDeviceKeyCache(): void {
  shared = null;
}
