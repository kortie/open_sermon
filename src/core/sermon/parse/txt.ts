// txt: UTF-8 only (DESIGN 3.9). Invalid UTF-8 (e.g. EUC-KR files) is reported, not guessed.
import { IngestError } from '../errors';
import { normalizeText } from '../text';

export function parseTxt(bytes: Uint8Array): string {
  try {
    return normalizeText(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new IngestError('ENCODING');
  }
}
