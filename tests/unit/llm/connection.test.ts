// S08: verify → save flow, format pre-check, daily limit (DESIGN 3.13.2, 4.3), disconnect.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectedClient, disconnect, getConnection, setModel, verifyAndSaveKey } from '../../../src/core/llm/connection';
import { remainingToday, takeDailySlot } from '../../../src/core/llm/dailyLimit';
import type { FetchFn } from '../../../src/core/llm/types';
import { openDb } from '../../../src/core/store/db';
import { getLlmCalls } from '../../../src/core/store/local-stats';
import { getProviderKeyInfo } from '../../../src/core/vault/providerKey';
import { resetDeviceKeyCache } from '../../../src/core/vault/crypto-key';

const KEY = 'sk-ant-api03-connection-test-WXYZ';
const ok = () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'o' }] }), { status: 200 });
const fail401 = () => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid' } }), { status: 401 });

let n = 0;
const opened: IDBDatabase[] = [];
async function fresh() {
  const db = await openDb(`llm-conn-${++n}-${Date.now()}`);
  opened.push(db);
  return db;
}
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  resetDeviceKeyCache();
});

describe('verifyAndSaveKey', () => {
  it('success: one request, key stored encrypted, connection set, one call counted', async () => {
    const db = await fresh();
    const fetchFn = vi.fn<FetchFn>(async () => ok());
    const info = await verifyAndSaveKey('anthropic', 'claude-sonnet-5-5', KEY, { fetch: fetchFn, db });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(info.key_last4).toBe('WXYZ');
    expect(await getConnection({ db })).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5', key_last4: 'WXYZ' });
    expect(await getLlmCalls(new Date(), db)).toBe(1);
    const c = await connectedClient({ fetch: fetchFn, db });
    expect(await c!.generate('s', 'u')).toBe('o');
    expect((fetchFn.mock.calls[1]![1].headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
  });

  it('format mismatch: 0 requests, nothing saved, no call counted', async () => {
    const db = await fresh();
    const fetchFn = vi.fn<FetchFn>(async () => ok());
    await expect(verifyAndSaveKey('anthropic', '', 'AIzaSyNotAnthropic', { fetch: fetchFn, db })).rejects.toMatchObject({ cause: 'format' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await getProviderKeyInfo('anthropic', db)).toBeNull();
    expect(await getLlmCalls(new Date(), db)).toBe(0);
  });

  it('"check anyway" skips the format check and lets the provider decide', async () => {
    const db = await fresh();
    const fetchFn = vi.fn<FetchFn>(async () => ok());
    await verifyAndSaveKey('anthropic', '', 'odd-format-key-1234', { fetch: fetchFn, db, ignoreFormat: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('failed check: the key is not saved and the connection stays empty', async () => {
    const db = await fresh();
    await expect(verifyAndSaveKey('anthropic', '', KEY, { fetch: async () => fail401(), db })).rejects.toMatchObject({ cause: 'auth' });
    expect(await getProviderKeyInfo('anthropic', db)).toBeNull();
    expect(await getConnection({ db })).toBeNull();
    expect(await getLlmCalls(new Date(), db)).toBe(1); // the failed check still counts
  });

  it('unverified provider: refused before any request', async () => {
    const db = await fresh();
    const fetchFn = vi.fn<FetchFn>();
    await expect(verifyAndSaveKey('openai', '', 'sk-abc', { fetch: fetchFn, db })).rejects.toMatchObject({ cause: 'unknown' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('daily limit reached: 0 requests; a new local date starts over', async () => {
    const db = await fresh();
    const day1 = new Date(2026, 10, 5, 23, 59);
    const day2 = new Date(2026, 10, 6, 0, 1);
    const fetchFn = vi.fn<FetchFn>(async () => ok());
    for (let i = 0; i < 2; i++) await takeDailySlot({ now: day1, limit: 2, db });
    expect(await remainingToday({ now: day1, limit: 2, db })).toBe(0);
    await expect(verifyAndSaveKey('anthropic', '', KEY, { fetch: fetchFn, db, now: day1, limit: 2 })).rejects.toMatchObject({ cause: 'daily_limit' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await remainingToday({ now: day2, limit: 2, db })).toBe(2);
    await verifyAndSaveKey('anthropic', '', KEY, { fetch: fetchFn, db, now: day2, limit: 2 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('the default limit comes from config (30)', async () => {
    const db = await fresh();
    expect(await remainingToday({ db })).toBe(30);
  });
});

describe('connection settings', () => {
  it('model change keeps only offered models; disconnect removes the key at once', async () => {
    const db = await fresh();
    await verifyAndSaveKey('anthropic', '', KEY, { fetch: async () => ok(), db });
    expect((await getConnection({ db }))!.model).toBe('claude-haiku-5-5');
    await setModel('anthropic', 'claude-opus-5-5', { db });
    expect((await getConnection({ db }))!.model).toBe('claude-opus-5-5');
    await setModel('anthropic', 'unknown-model', { db });
    expect((await getConnection({ db }))!.model).toBe('claude-haiku-5-5');
    await disconnect('anthropic', db);
    expect(await getProviderKeyInfo('anthropic', db)).toBeNull();
    expect(await getConnection({ db })).toBeNull();
    expect(await connectedClient({ db })).toBeNull();
  });
});
