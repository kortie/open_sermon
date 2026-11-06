// Backup key derivation (DESIGN 4.2): PBKDF2-SHA256 → AES-GCM 256.
// The derived key is non-extractable and lives only in memory for one export/import; it is
// never stored. The password is NFC-normalised so the same Korean text typed on different
// keyboards (composed vs decomposed jamo) gives the same key.
import { backup } from '../../../config/app.config.json';
import { SALT_BYTES } from './format';

/** Iteration count for new backups (config, OWASP PBKDF2-HMAC-SHA256 recommendation). */
export const PBKDF2_ITERATIONS: number = backup.pbkdf2_iterations;

export const MIN_PASSWORD_LENGTH = 8;

export function normalizePassword(password: string): string {
  return password.normalize('NFC');
}

/** Length in code points after NFC (a Hangul syllable counts as one). */
export function passwordLength(password: string): number {
  return [...normalizePassword(password)].length;
}

export function randomSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

export async function deriveBackupKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalizePassword(password)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
