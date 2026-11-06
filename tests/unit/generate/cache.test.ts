// S09: gen_cache is encrypted and keyed by a hash (DESIGN 4.1).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { CACHE_MAX, cacheKey, clearGenCache, getCached, putCached } from '../../../src/core/generate/cache';
import { parseOutput } from '../../../src/core/generate/parseOutput';
import { openDb, req, withTransaction } from '../../../src/core/store/db';
import { resetDeviceKeyCache } from '../../../src/core/vault/crypto-key';
import type { GenerationOutput } from '../../../src/core/validate';
import { fixture } from '../../fixtures/llm-responses';

const opened: IDBDatabase[] = [];
let n = 0;
async function fresh() {
  const db = await openDb(`gen-cache-${++n}-${Date.now()}`);
  opened.push(db);
  return db;
}
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  resetDeviceKeyCache();
});
const output = fixture('ok-ko') as unknown as GenerationOutput;
const meta = (created_at: number) => ({ prompt_version: 'ko-1', provider: 'anthropic', model: 'm', created_at });
const dump = (db: IDBDatabase) => withTransaction('gen_cache', 'readonly', (tx) => req(tx.objectStore('gen_cache').getAll()), db);

describe('gen_cache', () => {
  it('round-trips; the stored record holds no plaintext', async () => {
    const db = await fresh();
    const key = await cacheKey({ version: 'ko-1', provider: 'anthropic', model: 'm', system: 's', user: 'u' });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    await putCached(key, { output, humorDropped: false }, meta(1), db);
    expect(await getCached(key, db)).toEqual({ output, humorDropped: false, meta: meta(1) });
    const rows = await dump(db);
    const text = new TextDecoder().decode(new Uint8Array((rows[0] as { ciphertext: ArrayBuffer }).ciphertext));
    expect(JSON.stringify(rows) + text).not.toContain(output.sermon.title);
    expect(JSON.stringify(rows) + text).not.toContain('포도나무');
  });

  it('the key changes with version, provider, model and prompt', async () => {
    const parts = { version: 'v', provider: 'p', model: 'm', system: 's', user: 'u' };
    const k = await cacheKey(parts);
    for (const field of Object.keys(parts)) expect(await cacheKey({ ...parts, [field]: 'other' })).not.toBe(k);
  });

  it('keeps the newest entries only; clear empties it; misses are null', async () => {
    const db = await fresh();
    for (let i = 0; i < CACHE_MAX + 2; i++) await putCached(`k${i}`, { output, humorDropped: false }, meta(i), db);
    expect(await dump(db)).toHaveLength(CACHE_MAX);
    expect(await getCached('k0', db)).toBeNull();
    expect(await getCached(`k${CACHE_MAX + 1}`, db)).not.toBeNull();
    await clearGenCache(db);
    expect(await dump(db)).toHaveLength(0);
  });

  it('an unreadable entry (device key replaced) is a miss', async () => {
    const db = await fresh();
    await putCached('k', { output, humorDropped: false }, meta(1), db);
    await withTransaction('crypto_key', 'readwrite', (tx) => req(tx.objectStore('crypto_key').clear()), db);
    resetDeviceKeyCache();
    expect(await getCached('k', db)).toBeNull();
  });
});

describe('parseOutput', () => {
  it('accepts fenced and wrapped JSON, rejects the rest', () => {
    expect(parseOutput('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseOutput('Here you go: {"a":{"b":2}} thanks')).toEqual({ a: { b: 2 } });
    expect(parseOutput('no json')).toBeUndefined();
    expect(parseOutput('{broken')).toBeUndefined();
    expect(parseOutput('{"a": }')).toBeUndefined();
  });
});
