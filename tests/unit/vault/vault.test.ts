// S04 vault: non-extractable device key, AES-GCM with fresh IVs, key display masking (DESIGN 4.2).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../../../src/core/store/db';
import { decrypt, decryptText, encrypt, IV_BYTES, VaultError } from '../../../src/core/vault/cipher';
import { getOrCreateDeviceKey, resetDeviceKeyCache } from '../../../src/core/vault/crypto-key';
import { last4, maskKey } from '../../../src/core/vault/mask-display';

let n = 0;
const opened: IDBDatabase[] = [];
async function fresh() {
  const db = await openDb(`vault-${++n}-${Date.now()}`);
  opened.push(db);
  return db;
}
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  resetDeviceKeyCache();
});

describe('device key', () => {
  it('is AES-GCM 256, non-extractable, and cannot be exported', async () => {
    const db = await fresh();
    const key = await getOrCreateDeviceKey(db);
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect(key.usages.sort()).toEqual(['decrypt', 'encrypt']);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    await expect(crypto.subtle.exportKey('jwk', key)).rejects.toThrow();
  });

  it('is stored once and reused (also after reopening, and under concurrent first use)', async () => {
    const db = await fresh();
    const [a, b] = await Promise.all([getOrCreateDeviceKey(db), getOrCreateDeviceKey(db)]);
    const { ciphertext, iv } = await encrypt('같은 키', a);
    expect(await decryptText(ciphertext, iv, b)).toBe('같은 키');
    const again = await openDb(db.name);
    opened.push(again);
    const c = await getOrCreateDeviceKey(again);
    expect(await decryptText(ciphertext, iv, c)).toBe('같은 키');
    const rows = await new Promise<unknown[]>((resolve) => {
      const r = again.transaction('crypto_key').objectStore('crypto_key').getAll();
      r.onsuccess = () => resolve(r.result);
    });
    expect(rows).toHaveLength(1);
    // What is stored is a CryptoKey object, never raw key bytes.
    expect((rows[0] as { key: unknown }).key).toBeInstanceOf(CryptoKey);
  });
});

describe('cipher', () => {
  it('round-trips text and bytes', async () => {
    const key = await getOrCreateDeviceKey(await fresh());
    const text = '포도나무와 가지 — ZQX 🌿';
    const e = await encrypt(text, key);
    expect(e.iv).toHaveLength(IV_BYTES);
    expect(await decryptText(e.ciphertext, e.iv, key)).toBe(text);
    const bytes = new Uint8Array([0, 1, 2, 255]);
    const eb = await encrypt(bytes, key);
    expect(await decrypt(eb.ciphertext, eb.iv, key)).toEqual(bytes);
  });

  it('uses a fresh IV every time: the same plaintext never gives the same ciphertext', async () => {
    const key = await getOrCreateDeviceKey(await fresh());
    const ivs = new Set<string>();
    const cts = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const e = await encrypt('같은 평문', key);
      ivs.add(Array.from(e.iv).join(','));
      cts.add(Array.from(new Uint8Array(e.ciphertext)).join(','));
    }
    expect(ivs.size).toBe(100);
    expect(cts.size).toBe(100);
  });

  it('ciphertext does not contain the plaintext', async () => {
    const key = await getOrCreateDeviceKey(await fresh());
    const e = await encrypt('ZQX-plain-marker', key);
    expect(new TextDecoder().decode(e.ciphertext)).not.toContain('ZQX');
  });

  it('tampered data or a wrong key fails with a content-free VaultError', async () => {
    const key = await getOrCreateDeviceKey(await fresh());
    const other = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const e = await encrypt('비밀 원고 ZQX', key);
    const tampered = new Uint8Array(e.ciphertext.slice(0));
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    for (const attempt of [() => decrypt(tampered.buffer, e.iv, key), () => decrypt(e.ciphertext, e.iv, other), () => decrypt(e.ciphertext, new Uint8Array(12), key)]) {
      const err = await attempt().catch((x: unknown) => x);
      expect(err).toBeInstanceOf(VaultError);
      expect(String((err as Error).message)).not.toContain('ZQX');
      expect((err as VaultError).code).toBe('decrypt_failed');
    }
  });

  it('uses the shared device key when none is passed', async () => {
    const e = await encrypt('기본 키');
    expect(await decryptText(e.ciphertext, e.iv)).toBe('기본 키');
  });
});

describe('key display masking', () => {
  it('shows only the last 4 characters', () => {
    expect(last4('  AIzaSyExampleKey1234  ')).toBe('1234');
    expect(maskKey('1234')).toBe('••••1234');
    expect(maskKey(last4('sk-ant-abcdef9876'))).toBe('••••9876');
    expect(maskKey('sk-ant-abcdef9876')).not.toContain('sk-');
  });
});
