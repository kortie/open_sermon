import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, openDb, withTransaction, type Migration } from '../../../src/core/store/db';
import { getAllSettings, getSetting, setSetting, setSettings } from '../../../src/core/store/settings';

let n = 0;
const fresh = () => `test-${++n}-${Date.now()}`;
const opened: IDBDatabase[] = [];
async function open(name: string, migrations: readonly Migration[] = MIGRATIONS) {
  const db = await openDb(name, migrations);
  opened.push(db);
  return db;
}
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
});

describe('core/store settings', () => {
  it('stores, reads and survives reopening', async () => {
    const name = fresh();
    const db = await open(name);
    expect(await getSetting('ui_language', db)).toBeUndefined();
    await setSetting('ui_language', 'en', db);
    await setSettings({ font_size_px: 20, bible_user_chosen: true }, db);
    db.close();

    const again = await open(name);
    expect(await getSetting('ui_language', again)).toBe('en');
    expect(await getSetting('font_size_px', again)).toBe(20);
    expect(await getAllSettings(again)).toEqual({ ui_language: 'en', font_size_px: 20, bible_user_chosen: true });
  });

  it('upgrading the schema keeps existing values (append-only migrations)', async () => {
    const name = fresh();
    const v1 = await open(name, MIGRATIONS.slice(0, 1));
    expect(v1.version).toBe(1);
    await setSetting('wizard_state', 'skipped', v1);
    v1.close();

    const later: Migration = (db) => {
      db.createObjectStore('future_store', { keyPath: 'id' });
    };
    const v2 = await open(name, [...MIGRATIONS.slice(0, 1), later]);
    expect(v2.version).toBe(2);
    expect([...v2.objectStoreNames].sort()).toEqual(['future_store', 'settings']);
    expect(await getSetting('wizard_state', v2)).toBe('skipped');
  });

  it('MIGRATIONS defines the settings store at version 1', async () => {
    const db = await open(fresh());
    expect(db.version).toBe(MIGRATIONS.length);
    expect([...db.objectStoreNames]).toContain('settings');
  });

  it('rolls back the whole transaction when the callback throws', async () => {
    const db = await open(fresh());
    await expect(
      withTransaction(
        'settings',
        'readwrite',
        (tx) => {
          tx.objectStore('settings').put({ key: 'ui_language', value: 'en' });
          throw new Error('boom');
        },
        db,
      ),
    ).rejects.toThrow('boom');
    expect(await getSetting('ui_language', db)).toBeUndefined();
  });
});
