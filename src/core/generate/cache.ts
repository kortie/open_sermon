// gen_cache (DESIGN 4.1, S09): validated results only, encrypted with the device key (AES-GCM, fresh
// IV). The key is a SHA-256 of prompt version, provider, model and the full prompt, so a cache hit
// sends nothing. Only the newest CACHE_MAX entries are kept.
import { req, withTransaction } from '../store/db';
import { decryptText, encrypt } from '../vault/cipher';
import { getOrCreateDeviceKey } from '../vault/crypto-key';
import type { GenerationOutput } from '../validate';

export const CACHE_MAX = 50;

export interface CacheMeta {
  prompt_version: string;
  provider: string;
  model: string;
  created_at: number;
}

export interface CachedResult {
  output: GenerationOutput;
  humorDropped: boolean;
  meta: CacheMeta;
}

interface CacheRecord extends CacheMeta {
  key: string;
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function cacheKey(parts: { version: string; provider: string; model: string; system: string; user: string }): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify([parts.version, parts.provider, parts.model, parts.system, parts.user]));
  return hex(await crypto.subtle.digest('SHA-256', data));
}

export async function getCached(key: string, db?: IDBDatabase): Promise<CachedResult | null> {
  const rec = await withTransaction('gen_cache', 'readonly', (tx) => req(tx.objectStore('gen_cache').get(key)) as Promise<CacheRecord | undefined>, db);
  if (!rec) return null;
  try {
    const body = JSON.parse(await decryptText(rec.ciphertext, rec.iv, await getOrCreateDeviceKey(db))) as { output: GenerationOutput; humorDropped: boolean };
    return { output: body.output, humorDropped: body.humorDropped, meta: { prompt_version: rec.prompt_version, provider: rec.provider, model: rec.model, created_at: rec.created_at } };
  } catch {
    // Unreadable entry (device key replaced): treat as a miss.
    return null;
  }
}

export async function putCached(key: string, value: { output: GenerationOutput; humorDropped: boolean }, meta: CacheMeta, db?: IDBDatabase): Promise<void> {
  const { ciphertext, iv } = await encrypt(JSON.stringify(value), await getOrCreateDeviceKey(db));
  const rec: CacheRecord = { key, ciphertext, iv, ...meta };
  await withTransaction(
    'gen_cache',
    'readwrite',
    async (tx) => {
      const store = tx.objectStore('gen_cache');
      await req(store.put(rec));
      const all = (await req(store.getAll())) as CacheRecord[];
      const old = all.sort((a, b) => b.created_at - a.created_at).slice(CACHE_MAX);
      await Promise.all(old.map((r) => req(store.delete(r.key))));
    },
    db,
  );
}

export async function clearGenCache(db?: IDBDatabase): Promise<void> {
  await withTransaction('gen_cache', 'readwrite', (tx) => req(tx.objectStore('gen_cache').clear()), db);
}
