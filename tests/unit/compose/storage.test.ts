// S05 outline storage (encrypted sections, plain meta), library CRUD/search, sermon deletion cascade.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { parseReference, type Reference } from '../../../src/core/bible/reference-parser';
import { deleteLibraryItem, listLibraryItems, saveLibraryItem, searchLibrary, validateLibraryDraft } from '../../../src/core/compose/library';
import { deleteOutline, listOutlines, openOutline, saveOutline } from '../../../src/core/compose/outline';
import { allBlocks, createOutline, excerptSermonIds, setBlockText } from '../../../src/core/compose/template';
import { saveSermon } from '../../../src/core/sermon/ingest';
import { deleteSermon } from '../../../src/core/sermon/read';
import { MIGRATIONS, openDb, req, withTransaction } from '../../../src/core/store/db';
import { getOutline, listOutlinesCiting, StaleOutlineError } from '../../../src/core/store/outline';
import { deleteSermon as deleteSermonStores, listSermons } from '../../../src/core/store/sermon';
import { getOrCreateDeviceKey } from '../../../src/core/vault/crypto-key';

const opened: IDBDatabase[] = [];
afterEach(() => opened.splice(0).forEach((db) => db.close()));
const fresh = async () => {
  const db = await openDb(`compose-${Math.random()}`);
  opened.push(db);
  return { db, key: await getOrCreateDeviceKey(db) };
};
const ref = (s: string): Reference => {
  const p = parseReference(s);
  if (!p.ok) throw new Error(s);
  return p.ref;
};
const SECRET = 'ZQX-구성표-비밀-문장';
const verses = [{ verse: 1, text: '나는 참포도나무요' }];
const ex = (sermonId: string, chunkId: string) => ({ sermonId, chunkId, sermonTitle: 't', text: `${SECRET} ${chunkId}` });

function dump(db: IDBDatabase, store: string): Promise<unknown[]> {
  return withTransaction(store as 'outline', 'readonly', (tx) => req(tx.objectStore(store).getAll()), db);
}
const textOf = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x instanceof ArrayBuffer || ArrayBuffer.isView(x) ? `<${(x as ArrayBuffer).byteLength}>` : x));

describe('migration v4', () => {
  it('adds library_item, persona and outline and keeps older data', async () => {
    const name = `mig-${Math.random()}`;
    const v3 = await openDb(name, MIGRATIONS.slice(0, 3));
    await withTransaction('settings', 'readwrite', (tx) => req(tx.objectStore('settings').put({ key: 'ui_language', value: 'en' })), v3);
    v3.close();
    const v4 = await openDb(name, MIGRATIONS.slice(0, 4));
    opened.push(v4);
    expect(v4.version).toBe(4);
    expect([...v4.objectStoreNames]).toEqual(expect.arrayContaining(['library_item', 'persona', 'outline']));
    expect(await withTransaction('settings', 'readonly', (tx) => req(tx.objectStore('settings').get('ui_language')), v4)).toEqual({ key: 'ui_language', value: 'en' });
  });
});

describe('outline storage', () => {
  it('sections are encrypted; only title, ref, sermon ids and dates are plain', async () => {
    const { db, key } = await fresh();
    let o = createOutline({ ref: 'JHN 15:1', bibleId: 'krv', verses, excerpts: [ex('s1', 'c1')], now: 1 });
    o = setBlockText(o, o.sections[0]!.blocks[0]!.id, '머무는 삶');
    o = setBlockText(o, o.sections[1]!.blocks[0]!.id, `${SECRET} 제 도입`);
    const saved = await saveOutline(o, { db, key, now: 5 });
    expect(saved.updated_at).toBe(5);
    const raw = textOf(await dump(db, 'outline'));
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain('참포도나무');
    expect(await listOutlines(db)).toEqual([
      { id: o.id, title: '머무는 삶', ref: 'JHN 15:1', bible_id: 'krv', excerpt_sermon_ids: ['s1'], created_at: 1, updated_at: 5 },
    ]);
    const back = await openOutline(o.id, { db, key });
    expect(back).toEqual(saved);
    expect(await openOutline('missing', { db, key })).toBeNull();
    // Two saves of the same content produce different ciphertexts (fresh IV).
    const r1 = await getOutline(o.id, db);
    await saveOutline(saved, { db, key, now: 5 });
    const r2 = await getOutline(o.id, db);
    expect(Buffer.from(r1!.iv).equals(Buffer.from(r2!.iv))).toBe(false);
    await deleteOutline(o.id, db);
    expect(await listOutlines(db)).toEqual([]);
  });
  it('lists newest first', async () => {
    const { db, key } = await fresh();
    const a = createOutline({ ref: 'GEN 1:1', bibleId: 'krv', verses, id: 'a' });
    const b = createOutline({ ref: 'GEN 1:2', bibleId: 'krv', verses, id: 'b' });
    await saveOutline(a, { db, key, now: 1 });
    await saveOutline(b, { db, key, now: 2 });
    expect((await listOutlines(db)).map((m) => m.id)).toEqual(['b', 'a']);
  });
});

describe('sermon deletion removes its excerpt blocks from outlines (one transaction)', () => {
  const long = (tag: string) => Array.from({ length: 60 }, (_, i) => `${tag} 설교의 ${i}번째 문장으로 말씀을 묵상합니다.`).join(' ');
  it('only the deleted sermon’s excerpts go; other outlines and blocks stay', async () => {
    const { db, key } = await fresh();
    const yes = { granted: true, at: 1 };
    const s1 = await saveSermon({ title: '하나', text: long('하나') }, yes, { db, key, now: 1 });
    const s2 = await saveSermon({ title: '둘', text: long('둘') }, yes, { db, key, now: 2 });
    const both = createOutline({ ref: 'JHN 15:1', bibleId: 'krv', verses, excerpts: [ex(s1.id, 'c1'), ex(s2.id, 'c2'), ex(s1.id, 'c3')], id: 'both', now: 1 });
    const only2 = createOutline({ ref: 'JHN 15:2', bibleId: 'krv', verses, excerpts: [ex(s2.id, 'c4')], id: 'only2', now: 1 });
    await saveOutline(both, { db, key, now: 3 });
    await saveOutline(only2, { db, key, now: 3 });
    expect((await listOutlinesCiting(s1.id, db)).map((r) => r.id)).toEqual(['both']);

    await deleteSermon(s1.id, { db, key });
    expect((await listSermons(db)).map((s) => s.id)).toEqual([s2.id]);
    const after = (await openOutline('both', { db, key }))!;
    expect(excerptSermonIds(after)).toEqual([s2.id]);
    expect(allBlocks(after).filter((b) => b.kind === 'quote_excerpt').map((b) => b.source?.chunk_id)).toEqual(['c2']);
    expect(allBlocks(after).filter((b) => b.kind === 'quote_bible')).toHaveLength(1);
    expect(after.updated_at).toBe(3);
    expect((await listOutlines(db)).find((m) => m.id === 'both')?.excerpt_sermon_ids).toEqual([s2.id]);
    expect(await listOutlinesCiting(s1.id, db)).toEqual([]);
    expect(excerptSermonIds((await openOutline('only2', { db, key }))!)).toEqual([s2.id]);
  });
  it('an outline saved in between aborts the transaction: nothing is deleted', async () => {
    const { db, key } = await fresh();
    const s1 = await saveSermon({ title: '하나', text: long('하나') }, { granted: true, at: 1 }, { db, key, now: 1 });
    const o = createOutline({ ref: 'JHN 15:1', bibleId: 'krv', verses, excerpts: [ex(s1.id, 'c1')], id: 'o' });
    await saveOutline(o, { db, key, now: 3 });
    const stale = { record: (await getOutline('o', db))!, expectedUpdatedAt: 2 };
    await expect(deleteSermonStores(s1.id, db, [stale])).rejects.toBeInstanceOf(StaleOutlineError);
    expect((await listSermons(db)).map((s) => s.id)).toEqual([s1.id]);
  });
});

describe('library', () => {
  it('validates drafts: kind, body, tags, references', () => {
    expect(validateLibraryDraft({ kind: 'example', body: ' ', refs: [], tags: [] })).toEqual({ ok: false, errors: ['body_empty'] });
    expect(validateLibraryDraft({ kind: 'joke' as 'example', body: 'x', refs: [], tags: [] })).toEqual({ ok: false, errors: ['kind'] });
    expect(validateLibraryDraft({ kind: 'example', body: 'x'.repeat(1001), refs: [], tags: [] })).toEqual({ ok: false, errors: ['body_too_long'] });
    expect(validateLibraryDraft({ kind: 'example', body: 'x', refs: ['요 99:1x'], tags: [] })).toEqual({ ok: false, errors: ['ref'] });
    expect(validateLibraryDraft({ kind: 'example', body: 'x', refs: [], tags: ['가'.repeat(21)] })).toEqual({ ok: false, errors: ['tags'] });
    expect(validateLibraryDraft({ kind: 'one_liner', body: ' 한마디 ', refs: ['요 15:1-8', 'JHN 15:1-8', ''], tags: ['#가족', '가족', ' 감사 '] })).toEqual({
      ok: true,
      body: '한마디',
      refs: ['JHN 15:1-8'],
      tags: ['가족', '감사'],
    });
  });
  it('add, edit, delete', async () => {
    const { db } = await fresh();
    const r = await saveLibraryItem({ kind: 'example', body: '버스 정류장에서', refs: ['요 15:5'], tags: ['일상'] }, { db, now: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const e = await saveLibraryItem({ id: r.item.id, kind: 'example', body: '지하철에서', refs: ['요 15:5'], tags: ['일상'] }, { db, now: 2 });
    expect(e.ok && e.item).toMatchObject({ id: r.item.id, body: '지하철에서', created_at: 1, updated_at: 2 });
    expect(await listLibraryItems(db)).toHaveLength(1);
    expect((await saveLibraryItem({ kind: 'example', body: '', refs: [], tags: [] }, { db })).ok).toBe(false);
    await deleteLibraryItem(r.item.id, db);
    expect(await listLibraryItems(db)).toEqual([]);
  });
  it('search by kind, tag and verses (a shared verse ranks above the same chapter)', async () => {
    const { db } = await fresh();
    const add = (kind: 'example' | 'one_liner', body: string, refs: string[], tags: string[], now: number) => saveLibraryItem({ kind, body, refs, tags }, { db, now });
    await add('example', 'A 같은 절', ['요 15:5'], ['가족'], 1);
    await add('example', 'B 같은 장', ['요 15:20'], ['직장'], 2);
    await add('one_liner', 'C 한마디 같은 절', ['요 15:1-8'], ['가족'], 3);
    await add('example', 'D 다른 책', ['창 1:1'], ['가족'], 4);
    await add('example', 'E 장 전체', ['요 15'], [], 5);
    const items = await listLibraryItems(db);
    const bodies = (q: Parameters<typeof searchLibrary>[1]) => searchLibrary(items, q).map((h) => h.item.body[0]);
    expect(bodies({ ref: ref('요 15:5') })).toEqual(['E', 'C', 'A', 'B']); // verse/whole chapter first (newest), then same chapter
    expect(bodies({ ref: ref('요 15:5'), kind: 'example' })).toEqual(['E', 'A', 'B']);
    expect(bodies({ ref: ref('요 15:5'), kind: 'one_liner' })).toEqual(['C']);
    expect(bodies({ tag: '#가족' })).toEqual(['D', 'C', 'A']);
    expect(bodies({ tag: '직' })).toEqual(['B']);
    expect(bodies({ ref: ref('요 16:1') })).toEqual([]);
    expect(bodies({})).toEqual(['E', 'D', 'C', 'B', 'A']);
    expect(searchLibrary(items, { ref: ref('요 15:5') }).map((h) => h.match)).toEqual(['verse', 'verse', 'verse', 'chapter']);
  });
});
