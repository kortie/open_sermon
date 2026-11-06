// Encrypted outline storage (DESIGN 3.4, 4.1). Sections are JSON-encoded and encrypted with
// the device key before they reach core/store; only the plain metadata is stored as is.
import { listOutlinesCiting, putOutline, getOutline, type OutlineRecord } from '../store/outline';
import type { OutlineUpdate } from '../store/sermon';
import { decryptText, encrypt } from '../vault/cipher';
import { excerptSermonIds, outlineTitle, removeSermonExcerpts, type Outline, type OutlineSection } from './template';

export interface CryptoOpts {
  db?: IDBDatabase;
  key?: CryptoKey;
}

const TITLE_MAX = 80;

async function toRecord(o: Outline, key?: CryptoKey): Promise<OutlineRecord> {
  const { ciphertext, iv } = await encrypt(JSON.stringify({ v: 1, sections: o.sections }), key);
  return {
    id: o.id,
    title: [...outlineTitle(o)].slice(0, TITLE_MAX).join(''),
    ref: o.ref,
    bible_id: o.bible_id,
    excerpt_sermon_ids: excerptSermonIds(o),
    created_at: o.created_at,
    updated_at: o.updated_at,
    ciphertext,
    iv,
  };
}

async function fromRecord(r: OutlineRecord, key?: CryptoKey): Promise<Outline> {
  const body = JSON.parse(await decryptText(r.ciphertext, r.iv, key)) as { sections: OutlineSection[] };
  return { id: r.id, ref: r.ref, bible_id: r.bible_id, sections: body.sections, created_at: r.created_at, updated_at: r.updated_at };
}

/** Save (create or replace). `updated_at` is set to `now`. Encryption happens before the write. */
export async function saveOutline(o: Outline, opts: CryptoOpts & { now?: number } = {}): Promise<Outline> {
  const saved = { ...o, updated_at: opts.now ?? Date.now() };
  await putOutline(await toRecord(saved, opts.key), opts.db);
  return saved;
}

export async function openOutline(id: string, opts: CryptoOpts = {}): Promise<Outline | null> {
  const r = await getOutline(id, opts.db);
  return r ? fromRecord(r, opts.key) : null;
}

/**
 * Outlines citing `sermonId` with that sermon's excerpts removed and re-encrypted, ready for the
 * single deletion transaction (store/sermon deleteSermon). Their updated_at stays unchanged.
 */
export async function outlineUpdatesForSermonDeletion(sermonId: string, opts: CryptoOpts = {}): Promise<OutlineUpdate[]> {
  const out: OutlineUpdate[] = [];
  for (const r of await listOutlinesCiting(sermonId, opts.db)) {
    const cleaned = removeSermonExcerpts(await fromRecord(r, opts.key), sermonId);
    out.push({ record: await toRecord(cleaned, opts.key), expectedUpdatedAt: r.updated_at });
  }
  return out;
}

export { deleteOutline, listOutlines, type OutlineMeta } from '../store/outline';
