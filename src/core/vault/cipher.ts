// AES-GCM helpers (DESIGN 4.2). A fresh random 12-byte IV for every encryption; never reused.
// Errors never carry plaintext, ciphertext or key material.
import { getOrCreateDeviceKey } from './crypto-key';

export interface Encrypted {
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
}

export const IV_BYTES = 12;

export class VaultError extends Error {
  constructor(readonly code: 'decrypt_failed') {
    super(`vault: ${code}`);
    this.name = 'VaultError';
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function encrypt(plain: string | Uint8Array, key?: CryptoKey): Promise<Encrypted> {
  const k = key ?? (await getOrCreateDeviceKey());
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = typeof plain === 'string' ? encoder.encode(plain) : plain;
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, data as Uint8Array<ArrayBuffer>);
  return { ciphertext, iv };
}

export async function decrypt(ciphertext: ArrayBuffer, iv: Uint8Array, key?: CryptoKey): Promise<Uint8Array> {
  const k = key ?? (await getOrCreateDeviceKey());
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> }, k, ciphertext));
  } catch {
    throw new VaultError('decrypt_failed');
  }
}

export async function decryptText(ciphertext: ArrayBuffer, iv: Uint8Array, key?: CryptoKey): Promise<string> {
  return decoder.decode(await decrypt(ciphertext, iv, key));
}
