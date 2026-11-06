// Sermon ingest pipeline (DESIGN 3.9, skill sermon-ingest-privacy §4):
//   consent → type/size check → read → parse → normalise → mask → (preview, user edits) →
//   mask again → chunk → keywords/refs → encrypt → one transaction (meta, body, chunks, consent).
// Everything runs on the device. Errors carry a code only, never content.
import { sermon_ingest } from '../../../config/app.config.json';
import { putSermon, type SermonChunkRecord, type SermonMeta } from '../store/sermon';
import { encrypt } from '../vault/cipher';
import { chunkText } from './chunk';
import { IngestError } from './errors';
import { extractKeywords, extractVerseRefs } from './extract';
import { maskText, type MaskCounts } from './mask';
import { parseDocx } from './parse/docx';
import { parsePdf, type PdfLoader } from './parse/pdf';
import { parseTxt } from './parse/txt';
import { normalizeText, visibleLength } from './text';

export const MAX_UPLOAD_BYTES = sermon_ingest.max_upload_mb * 1024 * 1024;
export const MAX_TITLE_CHARS = 100;
export const ACCEPTED_EXTENSIONS = ['txt', 'docx', 'pdf'] as const;
export type SermonFileKind = (typeof ACCEPTED_EXTENSIONS)[number];

export type SermonInput =
  | { kind: 'file'; name: string; size: number; read: () => Promise<Uint8Array> }
  | { kind: 'paste'; text: string; title?: string };

export interface IngestDeps {
  /** Loads pdf.js on demand (browser: dynamic import of pdf-browser.ts). */
  loadPdf: () => Promise<PdfLoader>;
}

export interface SermonDraft {
  title: string;
  /** Masked text. The unmasked text never leaves this module. */
  text: string;
  counts: MaskCounts;
}

export interface ConsentInput {
  granted: boolean;
  /** Epoch ms of the consent check. */
  at: number;
}

export function fileKind(name: string): SermonFileKind | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext) ? (ext as SermonFileKind) : null;
}

function hasMagic(kind: SermonFileKind, bytes: Uint8Array): boolean {
  if (kind === 'docx') return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (kind === 'pdf') return new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-');
  return !bytes.subarray(0, 4096).includes(0); // text files have no NUL bytes
}

function titleFrom(name: string | undefined, text: string): string {
  const fromName = (name ?? '').replace(/\.[^.]*$/, '').replace(/[_]+/g, ' ').trim();
  const firstLine = text.split('\n').find((l) => l.trim())?.trim() ?? '';
  return (fromName || firstLine).slice(0, MAX_TITLE_CHARS);
}

async function parseFile(kind: SermonFileKind, bytes: Uint8Array, deps: IngestDeps): Promise<string> {
  if (kind === 'txt') return parseTxt(bytes);
  if (kind === 'docx') return parseDocx(bytes);
  return parsePdf(bytes, await deps.loadPdf());
}

/** Read, parse and mask. Nothing is stored. Without consent nothing is read. */
export async function prepareSermon(input: SermonInput, consent: ConsentInput, deps: IngestDeps): Promise<SermonDraft> {
  if (!consent.granted) throw new IngestError('CONSENT_REQUIRED');
  let raw: string;
  let name: string | undefined;
  if (input.kind === 'file') {
    const kind = fileKind(input.name);
    if (!kind) throw new IngestError('UNSUPPORTED_TYPE');
    if (input.size > MAX_UPLOAD_BYTES) throw new IngestError('TOO_LARGE');
    const bytes = await input.read();
    if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new IngestError('TOO_LARGE');
    if (!hasMagic(kind, bytes)) throw new IngestError('UNSUPPORTED_TYPE');
    raw = await parseFile(kind, bytes, deps);
    name = input.name;
  } else {
    if (new TextEncoder().encode(input.text).byteLength > MAX_UPLOAD_BYTES) throw new IngestError('TOO_LARGE');
    raw = normalizeText(input.text);
    name = input.title;
  }
  if (visibleLength(raw) === 0) throw new IngestError('EMPTY');
  const body = maskText(raw);
  const title = maskText(titleFrom(name, raw));
  const counts = { ...body.counts };
  for (const k of Object.keys(counts) as (keyof MaskCounts)[]) counts[k] += title.counts[k];
  return { title: title.text, text: body.text, counts };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface SaveOptions {
  db?: IDBDatabase;
  key?: CryptoKey;
  now?: number;
}

/**
 * Save a (possibly user-edited) draft. Masking runs again on the edited text and title, so text
 * typed in the preview is covered too (the patterns leave existing tokens alone).
 */
export async function saveSermon(draft: Pick<SermonDraft, 'title' | 'text'>, consent: ConsentInput, opts: SaveOptions = {}): Promise<SermonMeta> {
  if (!consent.granted) throw new IngestError('CONSENT_REQUIRED');
  const text = maskText(normalizeText(draft.text)).text;
  if (visibleLength(text) === 0) throw new IngestError('EMPTY');
  const title = maskText(draft.title.replace(/\s+/g, ' ').trim()).text.slice(0, MAX_TITLE_CHARS) || titleFrom(undefined, text);
  const now = opts.now ?? Date.now();
  const id = crypto.randomUUID();

  // All encryption happens before the transaction (only IndexedDB awaits may run inside it).
  const body = await encrypt(text, opts.key);
  const chunks: SermonChunkRecord[] = await Promise.all(
    chunkText(text).map(async (chunk, seq) => {
      const enc = await encrypt(chunk, opts.key);
      return {
        id: `${id}:${seq}`,
        sermon_id: id,
        seq,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        keywords: extractKeywords(chunk),
        verse_refs: extractVerseRefs(chunk),
      };
    }),
  );
  const meta: SermonMeta = { id, title, source_hash: await sha256Hex(text), consent_at: consent.at, created_at: now };
  await putSermon(
    meta,
    { sermon_id: id, ciphertext: body.ciphertext, iv: body.iv },
    chunks,
    { id: crypto.randomUUID(), kind: 'sermon_rights', target_id: id, granted: true, at: consent.at },
    opts.db,
  );
  return meta;
}

/** prepare + save without a preview step (tests and future bulk import). */
export async function ingestSermon(input: SermonInput, consent: ConsentInput, deps: IngestDeps, opts: SaveOptions = {}): Promise<SermonMeta> {
  return saveSermon(await prepareSermon(input, consent, deps), consent, opts);
}
