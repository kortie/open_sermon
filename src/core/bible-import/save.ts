// Saving an imported bible (DESIGN 3.14 step 5). Without the rights check nothing is read from or
// written to the DB. The bible, all its verses and the bible_rights consent go in one transaction;
// a failure stores nothing. Above the warning limit the bible cannot be saved.
import { IMPORTED_PREFIX, putImportedBible, type ImportedBibleRecord } from '../store/importedBible';
import { ImportError } from './errors';
import type { Inspection } from './inspect';

export const MAX_NAME_CHARS = 40;

export interface RightsConsent {
  granted: boolean;
  /** Epoch ms of the check. */
  at: number;
}

export interface SaveInput {
  name: string;
  language: 'ko' | 'en';
  inspection: Inspection;
}

export function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

export async function saveImportedBible(input: SaveInput, consent: RightsConsent, opts: { db?: IDBDatabase; now?: number } = {}): Promise<ImportedBibleRecord> {
  if (!consent.granted) throw new ImportError('CONSENT_REQUIRED');
  const name = normalizeName(input.name);
  if (name.length === 0 || [...name].length > MAX_NAME_CHARS) throw new ImportError('BAD_NAME');
  const { report, verses } = input.inspection;
  if (!report.canSave) throw new ImportError(report.verses === 0 ? 'EMPTY' : 'TOO_MANY_WARNINGS');

  const id = `${IMPORTED_PREFIX}${crypto.randomUUID()}`;
  const meta: ImportedBibleRecord = {
    id,
    name,
    language: input.language,
    encoding: report.encoding,
    verse_count: verses.length,
    partial: report.partial,
    rights_consent_at: consent.at,
    no_redistribute: true,
    created_at: opts.now ?? Date.now(),
  };
  await putImportedBible(
    meta,
    verses.map((v) => ({ bible_id: id, book: v.book, chapter: v.chapter, verse: v.verse, text: v.text })),
    { id: crypto.randomUUID(), kind: 'bible_rights', target_id: id, granted: true, at: consent.at },
    opts.db,
  );
  return meta;
}
