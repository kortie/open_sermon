// File checks and decoding (DESIGN 3.14, skill bible-txt-import §4.2): .txt only, size limit before
// reading, UTF-8 (strict) first, then EUC-KR (the browser reads it as windows-949). The encoding used
// is reported so the preview can show it. Nothing leaves the device.
import { bible_import } from '../../../config/app.config.json';
import { ImportError } from './errors';

export type ImportEncoding = 'utf-8' | 'euc-kr';

export const MAX_FILE_BYTES = bible_import.max_file_mb * 1024 * 1024;
export const ACCEPTED_EXTENSIONS: readonly string[] = bible_import.accepted_extensions;
/** Above this share of U+FFFD characters the EUC-KR reading is treated as garbage. */
export const MAX_REPLACEMENT_RATIO = 0.01;

export function checkFile(name: string, size: number): void {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (!name.includes('.') || !ACCEPTED_EXTENSIONS.includes(ext)) throw new ImportError('UNSUPPORTED_TYPE');
  if (size > MAX_FILE_BYTES) throw new ImportError('TOO_LARGE');
}

const hasBom = (b: Uint8Array) => b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;

export function decodeBytes(bytes: Uint8Array): { text: string; encoding: ImportEncoding } {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new ImportError('TOO_LARGE');
  // Text files have no NUL bytes (rejects renamed binaries such as .docx or .pdf).
  if (bytes.includes(0)) throw new ImportError('UNSUPPORTED_TYPE');
  const body = hasBom(bytes) ? bytes.subarray(3) : bytes;
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8' };
  } catch {
    // not UTF-8: try EUC-KR below
  }
  let text: string;
  try {
    text = new TextDecoder('euc-kr').decode(body);
  } catch {
    throw new ImportError('ENCODING');
  }
  const bad = text.split('�').length - 1;
  if (text.length === 0 || bad / text.length > MAX_REPLACEMENT_RATIO) throw new ImportError('ENCODING');
  return { text, encoding: 'euc-kr' };
}
