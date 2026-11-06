// S04 ingest: consent gate, size/type limits, each input kind, and the storage dump check
// (no marker string or masked PII anywhere in IndexedDB after saving).
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { IngestError } from '../../../src/core/sermon/errors';
import { ingestSermon, MAX_UPLOAD_BYTES, prepareSermon, saveSermon, type SermonInput } from '../../../src/core/sermon/ingest';
import { readSermonText } from '../../../src/core/sermon/read';
import { listConsents } from '../../../src/core/store/consent';
import { openDb, type StoreName } from '../../../src/core/store/db';
import { getSermonChunks, listSermons } from '../../../src/core/store/sermon';
import { decryptText } from '../../../src/core/vault/cipher';
import { getOrCreateDeviceKey } from '../../../src/core/vault/crypto-key';
import { nodePdfLoader } from '../../helpers/pdf-node';

const MARKER = 'ZQX-표지-문장';
const SECRETS = ['010-1234-5678', 'sample.person@example.com', '02-123-4567', '김철수', '이영희', '예시가상교회', '예시로 123'];
const deps = { loadPdf: async () => nodePdfLoader };
const yes = { granted: true, at: 1_700_000_000_000 };
const no = { granted: false, at: 0 };

let n = 0;
const opened: IDBDatabase[] = [];
async function fresh() {
  const db = await openDb(`ingest-${++n}-${Date.now()}`);
  opened.push(db);
  return { db, key: await getOrCreateDeviceKey(db) };
}
afterEach(() => opened.splice(0).forEach((db) => db.close()));

function file(name: string, bytes: Uint8Array, size = bytes.byteLength): SermonInput & { reads: number } {
  const input = {
    kind: 'file' as const,
    name,
    size,
    reads: 0,
    read: async () => {
      input.reads++;
      return bytes;
    },
  };
  return input;
}
const fixture = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/sermons/${n}`));
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof IngestError ? e.code : String(e)));

async function countAll(db: IDBDatabase): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const s of Array.from(db.objectStoreNames)) {
    out[s] = await new Promise<number>((resolve) => {
      const r = db.transaction(s).objectStore(s).count();
      r.onsuccess = () => resolve(r.result);
    });
  }
  return out;
}

/** Every value in every store, as text: JSON for structure plus UTF-8/UTF-16 decodes of all bytes. */
async function dump(db: IDBDatabase): Promise<string> {
  const parts: string[] = [];
  const visit = (v: unknown): void => {
    if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
      const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      parts.push(new TextDecoder('utf-8').decode(bytes), new TextDecoder('utf-16le').decode(bytes), Buffer.from(bytes).toString('latin1'));
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object' && !(v instanceof CryptoKey)) Object.values(v).forEach(visit);
    else parts.push(String(v));
  };
  for (const s of Array.from(db.objectStoreNames)) {
    const rows = await new Promise<unknown[]>((resolve) => {
      const r = db.transaction(s).objectStore(s).getAll();
      r.onsuccess = () => resolve(r.result);
    });
    parts.push(JSON.stringify(rows));
    rows.forEach(visit);
  }
  return parts.join('\n');
}

describe('consent gate', () => {
  it('without consent: CONSENT_REQUIRED, the file is not read, nothing is stored', async () => {
    const { db, key } = await fresh();
    const f = file('sermon.txt', fixture('sermon.txt'));
    expect(await code(prepareSermon(f, no, deps))).toBe('CONSENT_REQUIRED');
    expect(f.reads).toBe(0);
    expect(await code(saveSermon({ title: 't', text: '본문' }, no, { db, key }))).toBe('CONSENT_REQUIRED');
    expect(await code(ingestSermon(f, no, deps, { db, key }))).toBe('CONSENT_REQUIRED');
    const counts = await countAll(db);
    for (const s of ['sermon_meta', 'sermon_body', 'sermon_chunk', 'consent_log'] as StoreName[]) expect(counts[s]).toBe(0);
  });
});

describe('limits and types', () => {
  it('5MB + 1 byte is rejected before reading; exactly 5MB passes the size check', async () => {
    const big = file('big.txt', new Uint8Array(0), MAX_UPLOAD_BYTES + 1);
    expect(await code(prepareSermon(big, yes, deps))).toBe('TOO_LARGE');
    expect(big.reads).toBe(0);
    const exact = file('exact.txt', new Uint8Array(MAX_UPLOAD_BYTES).fill(0x41));
    expect(await code(prepareSermon(exact, yes, deps))).toBe('ok');
    // A reported size that lies is caught after reading.
    expect(await code(prepareSermon(file('lie.txt', new Uint8Array(MAX_UPLOAD_BYTES + 1), 10), yes, deps))).toBe('TOO_LARGE');
    expect(await code(prepareSermon({ kind: 'paste', text: 'a'.repeat(MAX_UPLOAD_BYTES + 1) }, yes, deps))).toBe('TOO_LARGE');
  });

  it('only txt, docx and pdf; content must match the extension', async () => {
    expect(await code(prepareSermon(file('photo.png', fixture('not-a-sermon.png')), yes, deps))).toBe('UNSUPPORTED_TYPE');
    expect(await code(prepareSermon(file('old.hwp', fixture('sermon.txt')), yes, deps))).toBe('UNSUPPORTED_TYPE');
    expect(await code(prepareSermon(file('fake.docx', fixture('sermon.txt')), yes, deps))).toBe('UNSUPPORTED_TYPE');
    expect(await code(prepareSermon(file('fake.pdf', fixture('sermon.txt')), yes, deps))).toBe('UNSUPPORTED_TYPE');
    expect(await code(prepareSermon(file('binary.txt', new Uint8Array([0x89, 0x50, 0x00, 0x00, 0x41])), yes, deps))).toBe('UNSUPPORTED_TYPE');
    expect(await code(prepareSermon(file('renamed.txt', fixture('not-a-sermon.png')), yes, deps))).toBe('ENCODING');
  });

  it('image PDF and empty input are rejected', async () => {
    expect(await code(prepareSermon(file('scan.pdf', fixture('image-only.pdf')), yes, deps))).toBe('IMAGE_PDF');
    expect(await code(prepareSermon({ kind: 'paste', text: ' \n\t ' }, yes, deps))).toBe('EMPTY');
    expect(await code(prepareSermon(file('empty.txt', new Uint8Array()), yes, deps))).toBe('EMPTY');
  }, 20_000);
});

describe('each input kind succeeds and is masked', () => {
  it.each([
    ['sermon.txt', 'sermon'],
    ['sermon.docx', 'sermon'],
    ['SERMON.PDF', 'SERMON'],
  ])('%s', async (name, title) => {
    const bytes = fixture(name.toLowerCase());
    const draft = await prepareSermon(file(name, bytes), yes, deps);
    expect(draft.title).toBe(title);
    expect(draft.text).toContain(MARKER);
    for (const s of SECRETS) expect(draft.text).not.toContain(s);
    expect(draft.counts).toEqual({ name: 2, church: 1, contact: 3, address: 1 });
  }, 20_000);

  it('paste: title from input or first line, masked as well', async () => {
    const d1 = await prepareSermon({ kind: 'paste', text: '첫 줄 제목\n\n본문입니다.', title: '' }, yes, deps);
    expect(d1.title).toBe('첫 줄 제목');
    const d2 = await prepareSermon({ kind: 'paste', text: '본문', title: '김철수 집사님 이야기' }, yes, deps);
    expect(d2.title).toBe('[이름] 집사님 이야기');
    expect(d2.counts.name).toBe(1);
  });
});

describe('saving', () => {
  it('stores meta, encrypted body and chunks, and the consent record in one go; reads back', async () => {
    const { db, key } = await fresh();
    const draft = await prepareSermon(file('sermon.txt', fixture('sermon.txt')), yes, deps);
    const meta = await saveSermon(draft, yes, { db, key, now: 42 });
    expect(meta).toMatchObject({ title: 'sermon', consent_at: yes.at, created_at: 42 });
    expect(meta.source_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await listSermons(db)).toEqual([meta]);
    expect(await readSermonText(meta.id, { db, key })).toBe(draft.text);
    expect(await readSermonText('missing', { db, key })).toBeNull();

    const chunks = await getSermonChunks(meta.id, db);
    expect(chunks.map((c) => c.seq)).toEqual(chunks.map((_, i) => i));
    const plain = await Promise.all(chunks.map((c) => decryptText(c.ciphertext, c.iv, key)));
    expect(plain.join('')).toBe(draft.text);
    expect(chunks.flatMap((c) => c.verse_refs)).toContain('JHN 15:1-8');
    expect(chunks.every((c) => c.keywords.length > 0 && c.keywords.length <= 10)).toBe(true);

    const consents = await listConsents(db);
    expect(consents).toEqual([expect.objectContaining({ kind: 'sermon_rights', target_id: meta.id, granted: true, at: yes.at })]);
  });

  it('text edited in the preview is masked again on save', async () => {
    const { db, key } = await fresh();
    const meta = await saveSermon({ title: '이영희 권사님', text: '추가로 쓴 010-9999-8888 번호와 박민수 장로' }, yes, { db, key });
    expect(meta.title).toBe('[이름] 권사님');
    expect(await readSermonText(meta.id, { db, key })).toBe('추가로 쓴 [연락처] 번호와 [이름] 장로');
    expect(await code(saveSermon({ title: 'x', text: '   ' }, yes, { db, key }))).toBe('EMPTY');
  });

  it('storage dump: no marker string and no masked PII in any store (txt, docx, pdf, paste)', async () => {
    const { db, key } = await fresh();
    for (const name of ['sermon.txt', 'sermon.docx', 'sermon.pdf']) await ingestSermon(file(name, fixture(name)), yes, deps, { db, key });
    await ingestSermon({ kind: 'paste', text: readFileSync('tests/fixtures/sermons/sermon.txt', 'utf8'), title: '붙여넣기' }, yes, deps, { db, key });
    expect((await listSermons(db)).length).toBe(4);
    const text = await dump(db);
    expect(text.length).toBeGreaterThan(1000);
    for (const s of [MARKER, 'ZQX', ...SECRETS, '포도나무요 내 아버지는', '가지가 나무에 붙어']) expect(text, s).not.toContain(s);
  }, 30_000);
});
