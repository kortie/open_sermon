// S08: provider keys are stored encrypted; only last4 in the clear (CLAUDE.md rule 4, skill key-vault-security).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, req } from '../../../src/core/store/db';
import { resetDeviceKeyCache } from '../../../src/core/vault/crypto-key';
import { deleteProviderKey, getProviderKeyInfo, listProviderKeys, readProviderKey, saveProviderKey, type ProviderKeyRecord } from '../../../src/core/vault/providerKey';

const KEY = 'sk-ant-api03-PLAINTEXT-must-not-leak-9z8Q';

let n = 0;
const opened: IDBDatabase[] = [];
async function fresh() {
  const db = await openDb(`pk-${++n}-${Date.now()}`);
  opened.push(db);
  return db;
}
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  resetDeviceKeyCache();
});

/** Every value in every store, serialized (ArrayBuffers and typed arrays decoded as text too). */
async function dump(db: IDBDatabase): Promise<string> {
  const names = Array.from(db.objectStoreNames);
  const tx = db.transaction(names, 'readonly');
  const out: string[] = [];
  const dec = new TextDecoder('utf-8', { fatal: false });
  const walk = (v: unknown): void => {
    if (v instanceof ArrayBuffer) out.push(dec.decode(new Uint8Array(v)));
    else if (ArrayBuffer.isView(v)) out.push(dec.decode(new Uint8Array(v.buffer)));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object' && !(v instanceof CryptoKey)) Object.values(v).forEach(walk);
    else out.push(String(v));
  };
  for (const name of names) walk(await req(tx.objectStore(name).getAll()));
  return out.join('\n');
}

describe('provider key vault', () => {
  it('stores no plaintext anywhere in IndexedDB; only last4 is readable', async () => {
    const db = await fresh();
    const info = await saveProviderKey('anthropic', `  ${KEY}\n`, 1000, db);
    expect(info).toEqual({ provider: 'anthropic', key_last4: '9z8Q', created_at: 1000 });
    const all = await dump(db);
    expect(all).not.toContain(KEY);
    expect(all).not.toContain('PLAINTEXT');
    expect(all).toContain('9z8Q');
    expect(await readProviderKey('anthropic', db)).toBe(KEY);
    expect(await getProviderKeyInfo('anthropic', db)).toEqual(info);
    expect(await listProviderKeys(db)).toEqual([info]);
  });

  it('record has the DESIGN 4.1 fields that core/backup expects', async () => {
    const db = await fresh();
    await saveProviderKey('anthropic', KEY, 5, db);
    const rec = (await req(db.transaction('provider_key').objectStore('provider_key').get('anthropic'))) as ProviderKeyRecord;
    expect(Object.keys(rec).sort()).toEqual(['created_at', 'iv', 'key_ciphertext', 'key_last4', 'provider']);
    expect(rec.iv).toHaveLength(12);
  });

  it('saving the same key twice yields a different IV and ciphertext', async () => {
    const db = await fresh();
    const get = async () => (await req(db.transaction('provider_key').objectStore('provider_key').get('anthropic'))) as ProviderKeyRecord;
    await saveProviderKey('anthropic', KEY, 1, db);
    const a = await get();
    await saveProviderKey('anthropic', KEY, 2, db);
    const b = await get();
    expect(Buffer.from(a.iv).equals(Buffer.from(b.iv))).toBe(false);
    expect(Buffer.from(a.key_ciphertext).equals(Buffer.from(b.key_ciphertext))).toBe(false);
    expect(await listProviderKeys(db)).toHaveLength(1);
  });

  it('delete removes the record', async () => {
    const db = await fresh();
    await saveProviderKey('anthropic', KEY, 1, db);
    await deleteProviderKey('anthropic', db);
    expect(await getProviderKeyInfo('anthropic', db)).toBeNull();
    expect(await readProviderKey('anthropic', db)).toBeNull();
    const count = await req(db.transaction('provider_key').objectStore('provider_key').count());
    expect(count).toBe(0);
  });
});
