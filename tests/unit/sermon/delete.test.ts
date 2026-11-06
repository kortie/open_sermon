// S04 deletion: one transaction over meta, body, chunks and style profiles; rollback on failure.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { saveSermon } from '../../../src/core/sermon/ingest';
import { openDb, req, withTransaction } from '../../../src/core/store/db';
import { DELETE_STORES, deleteSermon, deleteSermonTx, getSermonBody, getSermonChunks, listSermons } from '../../../src/core/store/sermon';
import { getOrCreateDeviceKey } from '../../../src/core/vault/crypto-key';

const yes = { granted: true, at: 1 };
const long = (tag: string) => Array.from({ length: 80 }, (_, i) => `${tag} 설교의 ${i}번째 문장으로 말씀을 묵상합니다.`).join(' ');
const opened: IDBDatabase[] = [];
let n = 0;
afterEach(() => opened.splice(0).forEach((db) => db.close()));

async function setup() {
  const db = await openDb(`delete-${++n}-${Date.now()}`);
  opened.push(db);
  const key = await getOrCreateDeviceKey(db);
  const a = await saveSermon({ title: '첫째', text: long('첫째') }, yes, { db, key, now: 1 });
  const b = await saveSermon({ title: '둘째', text: long('둘째') }, yes, { db, key, now: 2 });
  await withTransaction('style_profile', 'readwrite', (tx) => req(tx.objectStore('style_profile').put({ id: 'default', source_hash: 'x' })), db);
  return { db, a, b };
}

const count = (db: IDBDatabase, store: string) =>
  new Promise<number>((resolve) => {
    const r = db.transaction(store).objectStore(store).count();
    r.onsuccess = () => resolve(r.result);
  });

describe('deleteSermon', () => {
  it('removes meta, body, every chunk and the style profiles of that sermon only', async () => {
    const { db, a, b } = await setup();
    expect((await getSermonChunks(a.id, db)).length).toBeGreaterThan(1);
    await deleteSermon(a.id, db);
    expect((await listSermons(db)).map((s) => s.id)).toEqual([b.id]);
    expect(await getSermonBody(a.id, db)).toBeUndefined();
    expect(await getSermonChunks(a.id, db)).toEqual([]);
    expect(await count(db, 'style_profile')).toBe(0);
    // The other sermon is untouched.
    expect(await getSermonBody(b.id, db)).toBeDefined();
    expect((await getSermonChunks(b.id, db)).length).toBeGreaterThan(1);
    expect(await count(db, 'sermon_chunk')).toBe((await getSermonChunks(b.id, db)).length);
  });

  it('a failure in the middle of the transaction deletes nothing', async () => {
    const { db, a } = await setup();
    const before = await Promise.all(DELETE_STORES.map((s) => count(db, s)));
    await expect(
      withTransaction(DELETE_STORES, 'readwrite', async (tx) => {
        await deleteSermonTx(tx, a.id);
        throw new Error('injected failure');
      }, db),
    ).rejects.toThrow('injected failure');
    expect(await Promise.all(DELETE_STORES.map((s) => count(db, s)))).toEqual(before);
    expect(await getSermonBody(a.id, db)).toBeDefined();
  });

  it('deleting an unknown id is harmless', async () => {
    const { db } = await setup();
    await deleteSermon('nope', db);
    expect((await listSermons(db)).length).toBe(2);
  });
});
