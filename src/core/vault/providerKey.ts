// Provider API keys (CLAUDE.md rule 4, DESIGN 3.6, 4.1 `provider_key`, skill key-vault-security).
// The key is encrypted with the non-extractable device key (AES-GCM, fresh IV) before it touches
// IndexedDB. Only `key_last4` is stored in the clear, for the masked display. No function here
// logs, throws or returns the plaintext key except `readProviderKey`, which core/llm calls right
// before a request.
import { req, withTransaction } from '../store/db';
import { decryptText, encrypt } from './cipher';
import { getOrCreateDeviceKey } from './crypto-key';
import { last4 } from './mask-display';

/** Stored record (DESIGN 4.1). core/backup reads and writes the same fields. */
export interface ProviderKeyRecord {
  provider: string;
  key_ciphertext: ArrayBuffer;
  iv: Uint8Array;
  key_last4: string;
  created_at: number;
}

/** What screens may see. */
export interface ProviderKeyInfo {
  provider: string;
  key_last4: string;
  created_at: number;
}

const info = (r: ProviderKeyRecord): ProviderKeyInfo => ({ provider: r.provider, key_last4: r.key_last4, created_at: r.created_at });

/** Encrypt and store (replacing any earlier key for this provider). */
export async function saveProviderKey(provider: string, key: string, now = Date.now(), db?: IDBDatabase): Promise<ProviderKeyInfo> {
  const plain = key.trim();
  const { ciphertext, iv } = await encrypt(plain, await getOrCreateDeviceKey(db));
  const rec: ProviderKeyRecord = { provider, key_ciphertext: ciphertext, iv, key_last4: last4(plain), created_at: now };
  await withTransaction('provider_key', 'readwrite', (tx) => req(tx.objectStore('provider_key').put(rec)), db);
  return info(rec);
}

export async function getProviderKeyInfo(provider: string, db?: IDBDatabase): Promise<ProviderKeyInfo | null> {
  const rec = await withTransaction('provider_key', 'readonly', (tx) => req(tx.objectStore('provider_key').get(provider)) as Promise<ProviderKeyRecord | undefined>, db);
  return rec ? info(rec) : null;
}

export async function listProviderKeys(db?: IDBDatabase): Promise<ProviderKeyInfo[]> {
  const all = await withTransaction('provider_key', 'readonly', (tx) => req(tx.objectStore('provider_key').getAll()) as Promise<ProviderKeyRecord[]>, db);
  return all.map(info);
}

/** Decrypted key for a request, or null when none is stored. Callers keep it only for the call. */
export async function readProviderKey(provider: string, db?: IDBDatabase): Promise<string | null> {
  const rec = await withTransaction('provider_key', 'readonly', (tx) => req(tx.objectStore('provider_key').get(provider)) as Promise<ProviderKeyRecord | undefined>, db);
  if (!rec) return null;
  return decryptText(rec.key_ciphertext, rec.iv, await getOrCreateDeviceKey(db));
}

/** Remove the stored key immediately. */
export async function deleteProviderKey(provider: string, db?: IDBDatabase): Promise<void> {
  await withTransaction('provider_key', 'readwrite', (tx) => req(tx.objectStore('provider_key').delete(provider)), db);
}
