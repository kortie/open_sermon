// S06 encrypted local backup: format, KDF, export, import, errors, conflicts (DESIGN 3.11, 4.2).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportBackup, checkBackupPassword, collectPayload, backupFileName, countProviderKeys } from '../../../src/core/backup/export';
import { BackupError, fromBase64, parseEnvelope, parsePayload, toBase64, MAX_ITERATIONS } from '../../../src/core/backup/format';
import { importBackup, inspectBackup, openBackup } from '../../../src/core/backup/import';
import { deriveBackupKey, PBKDF2_ITERATIONS, passwordLength } from '../../../src/core/backup/kdf';
import { saveLibraryItem } from '../../../src/core/compose/library';
import { openOutline, saveOutline } from '../../../src/core/compose/outline';
import { createOutline } from '../../../src/core/compose/template';
import { defaultPersona } from '../../../src/core/persona/options';
import { saveSermon } from '../../../src/core/sermon/ingest';
import { readSermonText } from '../../../src/core/sermon/read';
import { computeSourceHash } from '../../../src/core/sermon/styleProfile';
import { listConsents } from '../../../src/core/store/consent';
import { MIGRATIONS, openDb, req, withTransaction, type Migration } from '../../../src/core/store/db';
import { getActivePersona, listPersonas, savePersona, setActivePersona } from '../../../src/core/store/persona';
import { listSermons } from '../../../src/core/store/sermon';
import { getAllSettings, setSettings } from '../../../src/core/store/settings';
import { decryptText, encrypt } from '../../../src/core/vault/cipher';
import { getOrCreateDeviceKey } from '../../../src/core/vault/crypto-key';

const ITER = 1000; // fast tests; the configured count is checked separately
const PW = '안전한백업암호123';
const SECRET = 'ZQX-백업-표지-문장';
const API_KEY = 'AIzaZQXsecretKEY1234';

const opened: IDBDatabase[] = [];
afterEach(() => opened.splice(0).forEach((db) => db.close()));

/** A later schema version with no new stores: a backup from it counts as "newer" for this app.
 *  (provider_key and the imported bible stores are in MIGRATIONS since S08 and S11.) */
const LATER: Migration = () => undefined;

async function device(migrations: readonly Migration[] = MIGRATIONS) {
  const db = await openDb(`backup-${Math.random()}`, migrations);
  opened.push(db);
  return { db, key: await getOrCreateDeviceKey(db) };
}

const long = (tag: string) => Array.from({ length: 40 }, (_, i) => `${tag} ${SECRET} 설교의 ${i}번째 문장으로 말씀을 묵상합니다.`).join(' ');

async function seed(d: { db: IDBDatabase; key: CryptoKey }) {
  const { db, key } = d;
  const s1 = await saveSermon({ title: '포도나무', text: long('하나') }, { granted: true, at: 1 }, { db, key, now: 1 });
  const s2 = await saveSermon({ title: '목자', text: long('둘') }, { granted: true, at: 2 }, { db, key, now: 2 });
  await savePersona(defaultPersona('p1', '주일 아침'), db);
  await setActivePersona('p1', db);
  await saveLibraryItem(
    {
      kind: 'example',
      body: '버스 정류장에서',
      refs: ['요 15:5'],
      tags: ['일상'],
    },
    { db, now: 3 },
  );
  const o = createOutline({
    ref: 'JHN 15:1',
    bibleId: 'krv',
    verses: [{ verse: 1, text: '나는 참포도나무요' }],
    excerpts: [
      {
        sermonId: s1.id,
        chunkId: 'c1',
        sermonTitle: '포도나무',
        text: `${SECRET} 발췌`,
      },
    ],
    id: 'o1',
    now: 4,
  });
  await saveOutline(o, { db, key, now: 5 });
  await setSettings(
    {
      ui_language: 'ko',
      bible_id: 'krv',
      bible_user_chosen: true,
      wizard_state: 'done',
      font_size_px: 20,
    },
    db,
  );
  return { s1, s2 };
}

async function dumpAll(db: IDBDatabase): Promise<Record<string, unknown[]>> {
  const names = Array.from(db.objectStoreNames);
  return withTransaction(
    names as 'settings'[],
    'readonly',
    async (tx) => {
      const out: Record<string, unknown[]> = {};
      for (const n of names) out[n] = await req(tx.objectStore(n).getAll());
      return out;
    },
    db,
  );
}
const textOf = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x instanceof ArrayBuffer || ArrayBuffer.isView(x) ? `<${(x as ArrayBuffer).byteLength}>` : x instanceof CryptoKey ? '<key>' : x));

const exportText = async (blob: Blob) => new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
const blobOf = (text: string) => new Blob([text]);

async function exported(d: { db: IDBDatabase; key: CryptoKey }, extra: Partial<Parameters<typeof exportBackup>[0]> = {}) {
  return exportBackup({
    password: PW,
    db: d.db,
    deviceKey: d.key,
    iterations: ITER,
    now: () => 1_700_000_000_000,
    ...extra,
  });
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(BackupError);
  await expect(p).rejects.toMatchObject({ code });
}

describe('password rule and KDF', () => {
  it('needs 8+ characters typed twice the same (NFC)', () => {
    expect(checkBackupPassword('1234567', '1234567')).toBe('too_short');
    expect(checkBackupPassword('12345678', '12345679')).toBe('mismatch');
    expect(checkBackupPassword('12345678', '12345678')).toBeNull();
    const composed = '가나다라마바사아';
    const decomposed = composed.normalize('NFD');
    expect(passwordLength(decomposed)).toBe(8);
    expect(checkBackupPassword(composed, decomposed)).toBeNull();
  });

  it('uses the confirmed iteration count from config (600,000)', () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });

  it('derives a non-extractable AES-GCM key that is never stored', async () => {
    const d = await device();
    const k = await deriveBackupKey(PW, new Uint8Array(16), ITER);
    expect(k.extractable).toBe(false);
    expect(k.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    await expect(crypto.subtle.exportKey('raw', k)).rejects.toThrow();
    const spy = vi.spyOn(crypto.subtle, 'deriveKey');
    await seed(d);
    await exported(d);
    expect(spy).toHaveBeenCalledTimes(1);
    const derived = await spy.mock.results[0]!.value;
    expect((derived as CryptoKey).extractable).toBe(false);
    spy.mockRestore();
    const stored = await dumpAll(d.db);
    const keys = Object.values(stored)
      .flat()
      .flatMap((r) => Object.values(r as object))
      .filter((v) => v instanceof CryptoKey);
    expect(keys).toHaveLength(1); // only the device key in crypto_key
    expect(stored.crypto_key).toHaveLength(1);
  });

  it('NFC: the same password typed decomposed opens the backup', async () => {
    const d = await device();
    await seed(d);
    const blob = await exportBackup({
      password: '가나다라마바사아',
      db: d.db,
      deviceKey: d.key,
      iterations: ITER,
    });
    const payload = await openBackup(blob, '가나다라마바사아'.normalize('NFD'), d.db);
    expect(payload.stores.sermon_meta).toHaveLength(2);
  });

  it('exportBackup rejects a short password', async () => {
    const d = await device();
    await expect(exportBackup({ password: 'short', db: d.db, iterations: ITER })).rejects.toThrow(RangeError);
  });
});

describe('format', () => {
  it('envelope has only format parameters; no user data or counts in plain text', async () => {
    const d = await device();
    await seed(d);
    const text = await exportText(await exported(d));
    const env = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(env).sort()).toEqual(['cipher', 'ciphertext', 'created_at', 'format', 'kdf', 'schema_version', 'version']);
    expect(env).toMatchObject({
      format: 'open-sermon-backup',
      version: 1,
      schema_version: MIGRATIONS.length,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITER },
      cipher: { name: 'AES-GCM' },
    });
    expect(fromBase64((env.kdf as { salt: string }).salt)).toHaveLength(16);
    expect(fromBase64((env.cipher as { iv: string }).iv)).toHaveLength(12);
    const plainPart = JSON.stringify({ ...env, ciphertext: undefined });
    for (const s of [SECRET, '포도나무', '목자', '주일 아침', '버스 정류장', '발췌']) expect(plainPart).not.toContain(s);
    expect(text).not.toContain(SECRET);
  });

  it('two exports of the same data differ in salt, IV and ciphertext', async () => {
    const d = await device();
    await seed(d);
    const a = JSON.parse(await exportText(await exported(d)));
    const b = JSON.parse(await exportText(await exported(d)));
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('base64 round trip and strict decoding', () => {
    const bytes = Uint8Array.from({ length: 70_000 }, (_, i) => (i * 7919) % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    expect(() => fromBase64('abc')).toThrow(BackupError);
    expect(() => fromBase64('ab!d')).toThrow(BackupError);
  });

  it('parseEnvelope classifies bad envelopes', () => {
    const good = {
      format: 'open-sermon-backup',
      version: 1,
      schema_version: 4,
      kdf: {
        name: 'PBKDF2',
        hash: 'SHA-256',
        iterations: 1000,
        salt: toBase64(new Uint8Array(16)),
      },
      cipher: { name: 'AES-GCM', iv: toBase64(new Uint8Array(12)) },
      ciphertext: toBase64(new Uint8Array(32)),
      created_at: '2026-11-05T00:00:00.000Z',
    };
    const code = (v: unknown, schema = 4) => {
      try {
        parseEnvelope(typeof v === 'string' ? v : JSON.stringify(v), schema);
        return 'ok';
      } catch (e) {
        return (e as BackupError).code;
      }
    };
    expect(code(good)).toBe('ok');
    expect(code('{"format":"open-sermon-backup","vers')).toBe('CORRUPTED');
    expect(code('hello')).toBe('CORRUPTED');
    expect(code({ hello: 1 })).toBe('NOT_BACKUP');
    expect(code([1, 2])).toBe('NOT_BACKUP');
    expect(code({ ...good, version: 99 })).toBe('UNSUPPORTED_VERSION');
    expect(code({ ...good, schema_version: 5 })).toBe('UNSUPPORTED_VERSION');
    expect(code({ ...good, schema_version: 0 })).toBe('CORRUPTED');
    expect(code({ ...good, kdf: { ...good.kdf, hash: 'SHA-1' } })).toBe('CORRUPTED');
    expect(code({ ...good, kdf: { ...good.kdf, iterations: MAX_ITERATIONS + 1 } })).toBe('CORRUPTED');
    expect(
      code({
        ...good,
        kdf: { ...good.kdf, salt: toBase64(new Uint8Array(8)) },
      }),
    ).toBe('CORRUPTED');
    expect(code({ ...good, cipher: { name: 'AES-CBC', iv: good.cipher.iv } })).toBe('CORRUPTED');
    expect(code({ ...good, ciphertext: toBase64(new Uint8Array(4)) })).toBe('CORRUPTED');
    expect(code({ ...good, ciphertext: 7 })).toBe('CORRUPTED');
  });

  it('parsePayload rejects unexpected shapes', () => {
    const ok = {
      version: 1,
      stores: {
        sermon_meta: [],
        sermon_body: [],
        sermon_chunk: [],
        style_profile: [],
        persona: [],
        library_item: [],
        outline: [],
        settings: [],
        consent_log: [],
      },
    };
    expect(parsePayload(JSON.stringify(ok)).stores.persona).toEqual([]);
    for (const bad of [
      'x',
      '{}',
      JSON.stringify({ ...ok, version: 2 }),
      JSON.stringify({ ...ok, stores: { ...ok.stores, outline: [{ id: 1 }] } }),
      JSON.stringify({
        ...ok,
        stores: {
          ...ok.stores,
          settings: [{ key: 'wizard_state', value: 'done' }],
        },
      }),
      JSON.stringify({
        ...ok,
        stores: { ...ok.stores, provider_key: [{ provider: 'x' }] },
      }),
    ]) {
      expect(() => parsePayload(bad)).toThrow(BackupError);
    }
  });

  it('suggests a dated .osbackup file name', () => {
    expect(backupFileName(new Date(2026, 10, 5, 9, 7))).toBe('open-sermon-20261105-0907.osbackup');
  });
});

describe('round trip to another device', () => {
  it('restores every included store, re-encrypted with the new device key', async () => {
    const a = await device();
    const { s1 } = await seed(a);
    const blob = await exported(a);

    const b = await device();
    expect(b.key).not.toBe(a.key);
    const info = await inspectBackup(blob, b.db);
    expect(info).toEqual({
      createdAt: new Date(1_700_000_000_000).toISOString(),
      schemaVersion: MIGRATIONS.length,
    });
    const report = await importBackup(blob, PW, { db: b.db, deviceKey: b.key });
    expect(report.written).toMatchObject({
      sermon_meta: 2,
      persona: 1,
      library_item: 1,
      outline: 1,
      settings: 4,
    });
    expect(report.skipped).toBe(0);

    expect((await listSermons(b.db)).map((m) => m.title).sort()).toEqual((await listSermons(a.db)).map((m) => m.title).sort());
    expect(await readSermonText(s1.id, { db: b.db, key: b.key })).toBe(await readSermonText(s1.id, { db: a.db, key: a.key }));
    expect(await listPersonas(b.db)).toEqual(await listPersonas(a.db));
    expect((await getActivePersona(b.db))?.id).toBe('p1');
    expect(await openOutline('o1', { db: b.db, key: b.key })).toEqual(await openOutline('o1', { db: a.db, key: a.key }));
    const settings = await getAllSettings(b.db);
    expect(settings).toEqual({
      ui_language: 'ko',
      bible_id: 'krv',
      bible_user_chosen: true,
      persona_id: 'p1',
    }); // no wizard/font
    const consents = await listConsents(b.db);
    expect(consents.filter((c) => c.kind === 'sermon_rights')).toHaveLength(2);

    // Chunks decrypt with B's key, not A's; same plain text and plain metadata.
    const da = await dumpAll(a.db);
    const db_ = await dumpAll(b.db);
    expect(db_.sermon_chunk).toHaveLength(da.sermon_chunk!.length);
    const chunkB = db_.sermon_chunk![0] as {
      id: string;
      ciphertext: ArrayBuffer;
      iv: Uint8Array;
      keywords: string[];
    };
    const chunkA = da.sermon_chunk!.find((c) => (c as { id: string }).id === chunkB.id) as typeof chunkB;
    expect(await decryptText(chunkB.ciphertext, chunkB.iv, b.key)).toBe(await decryptText(chunkA.ciphertext, chunkA.iv, a.key));
    await expect(decryptText(chunkB.ciphertext, chunkB.iv, a.key)).rejects.toThrow();
    expect(Array.from(chunkB.iv)).not.toEqual(Array.from(chunkA.iv));
    expect(chunkB.keywords).toEqual(chunkA.keywords);
    // Nothing decrypted is left in plain text in B's IndexedDB.
    expect(textOf(db_)).not.toContain(SECRET);
    expect(db_.local_stats).toEqual([]);
  });

  it('excludes local_stats, crypto_key, wizard state and font size', async () => {
    const a = await device();
    await seed(a);
    const p = await collectPayload({ db: a.db, deviceKey: a.key });
    expect(Object.keys(p.stores).sort()).toEqual(['consent_log', 'library_item', 'outline', 'persona', 'sermon_body', 'sermon_chunk', 'sermon_meta', 'settings', 'style_profile']);
    expect(p.stores.settings.map((s) => s.key).sort()).toEqual(['bible_id', 'bible_user_chosen', 'persona_id', 'ui_language']);
  });

  it("keeps an outline's excerpt quotes when the cited sermon is not restored", async () => {
    const a = await device();
    await seed(a);
    const b = await device();
    // B already has the same sermon text under another id → duplicate, skipped.
    await saveSermon({ title: '포도나무', text: long('하나') }, { granted: true, at: 9 }, { db: b.db, key: b.key, now: 9 });
    const report = await importBackup(await exported(a), PW, {
      db: b.db,
      deviceKey: b.key,
    });
    expect(report.duplicateSermons).toBe(1);
    expect(report.written.sermon_meta).toBe(1);
    const o = await openOutline('o1', { db: b.db, key: b.key });
    expect(JSON.stringify(o)).toContain(`${SECRET} 발췌`);
    expect(await listSermons(b.db)).toHaveLength(2);
  });
});

describe('provider keys and imported bibles', () => {
  async function withKeys() {
    const a = await device([...MIGRATIONS, LATER]);
    await seed(a);
    const enc = await encrypt(API_KEY, a.key);
    await withTransaction(
      ['provider_key' as 'settings', 'imported_bible' as 'settings', 'imported_verse' as 'settings', 'consent_log'],
      'readwrite',
      async (tx) => {
        await req(
          tx.objectStore('provider_key').put({
            provider: 'gemini',
            key_ciphertext: enc.ciphertext,
            iv: enc.iv,
            key_last4: '1234',
            created_at: 1,
          }),
        );
        await req(tx.objectStore('imported_bible').put({ id: 'mybible', name: '내 역본', language: 'ko' }));
        await req(
          tx.objectStore('imported_verse').put({
            bible_id: 'mybible',
            book: 1,
            chapter: 1,
            verse: 1,
            text: '태초에',
          }),
        );
        await req(
          tx.objectStore('consent_log').put({
            id: 'br',
            kind: 'bible_rights',
            target_id: 'mybible',
            granted: true,
            at: 1,
          }),
        );
      },
      a.db,
    );
    return a;
  }

  it('default export has no provider key, imported bible or their consents', async () => {
    const a = await withKeys();
    expect(await countProviderKeys(a.db)).toBe(1);
    const p = await collectPayload({ db: a.db, deviceKey: a.key });
    expect(p.stores.provider_key).toBeUndefined();
    expect(p.stores.imported_bible).toBeUndefined();
    expect(p.stores.imported_verse).toBeUndefined();
    expect(p.stores.consent_log.some((c) => c.kind === 'bible_rights')).toBe(false);
    expect(JSON.stringify(p)).not.toContain(API_KEY);
    expect((await listConsents(a.db)).some((c) => c.kind === 'backup_include_key')).toBe(false);
  });

  it('keys are included only with the confirmation, which is recorded in consent_log', async () => {
    const a = await withKeys();
    const blob = await exported(a, { includeKeys: true });
    const recorded = (await listConsents(a.db)).filter((c) => c.kind === 'backup_include_key');
    expect(recorded).toEqual([expect.objectContaining({ granted: true, target_id: null })]);
    expect(await exportText(blob)).not.toContain(API_KEY);
    const p = await openBackup(blob, PW, a.db);
    expect(p.stores.provider_key).toEqual([{ provider: 'gemini', key: API_KEY, key_last4: '1234', created_at: 1 }]);
    expect(p.stores.imported_bible).toBeUndefined();

    const b = await device([...MIGRATIONS, LATER]);
    const report = await importBackup(blob, PW, { db: b.db, deviceKey: b.key });
    expect(report.written.provider_key).toBe(1);
    const rows = (await dumpAll(b.db)).provider_key as {
      key_ciphertext: ArrayBuffer;
      iv: Uint8Array;
    }[];
    expect(await decryptText(rows[0]!.key_ciphertext, rows[0]!.iv, b.key)).toBe(API_KEY);
    expect(textOf(await dumpAll(b.db))).not.toContain(API_KEY);
  });

  it('imported bibles travel only with their flag, together with their rights consent', async () => {
    const a = await withKeys();
    const blob = await exported(a, { includeImportedBibles: true });
    const p = await openBackup(blob, PW, a.db);
    expect(p.stores.imported_bible).toHaveLength(1);
    expect(p.stores.imported_verse).toHaveLength(1);
    expect(p.stores.provider_key).toBeUndefined();
    expect(p.stores.consent_log.map((c) => c.kind)).toEqual(expect.arrayContaining(['bible_rights', 'backup_include_bible']));
    const b = await device([...MIGRATIONS, LATER]);
    const report = await importBackup(blob, PW, { db: b.db, deviceKey: b.key });
    expect(report.written.imported_bible).toBe(1);
    expect((await dumpAll(b.db)).imported_verse).toHaveLength(1);
  });

  it('an older app rejects a newer backup; a newer app imports an older one', async () => {
    const a = await withKeys();
    const newer = await exported(a, { includeKeys: true, includeImportedBibles: true });
    const old = await device();
    expect(await countProviderKeys(old.db)).toBe(0);
    await expectCode(importBackup(newer, PW, { db: old.db, deviceKey: old.key }), 'UNSUPPORTED_VERSION');

    await seed(old);
    const b = await device([...MIGRATIONS, LATER]);
    const report = await importBackup(await exported(old), PW, { db: b.db, deviceKey: b.key });
    expect(report.written).toMatchObject({ sermon_meta: 2, provider_key: 0, imported_bible: 0 });
  });
});

describe('errors leave existing data untouched', () => {
  async function target() {
    const a = await device();
    await seed(a);
    const blob = await exported(a);
    const b = await device();
    await savePersona(defaultPersona('mine', '내 것'), b.db);
    await saveSermon({ title: '기존', text: long('기존') }, { granted: true, at: 1 }, { db: b.db, key: b.key, now: 1 });
    return { blob, b, before: textOf(await dumpAll(b.db)) };
  }
  const unchanged = async (b: { db: IDBDatabase }, before: string) => expect(textOf(await dumpAll(b.db))).toBe(before);

  it('wrong password → WRONG_PASSWORD', async () => {
    const { blob, b, before } = await target();
    await expectCode(importBackup(blob, '틀린암호입니다만', { db: b.db, deviceKey: b.key }), 'WRONG_PASSWORD');
    await unchanged(b, before);
  });

  it('one flipped ciphertext byte → WRONG_PASSWORD (AES-GCM authentication)', async () => {
    const { blob, b, before } = await target();
    const env = JSON.parse(await exportText(blob));
    const ct = fromBase64(env.ciphertext);
    ct[10] = ct[10]! ^ 0x01;
    env.ciphertext = toBase64(ct);
    await expectCode(
      importBackup(blobOf(JSON.stringify(env)), PW, {
        db: b.db,
        deviceKey: b.key,
      }),
      'WRONG_PASSWORD',
    );
    await unchanged(b, before);
  });

  it('truncated file and non-JSON → CORRUPTED; binary → NOT_BACKUP', async () => {
    const { blob, b, before } = await target();
    const text = await exportText(blob);
    await expectCode(
      importBackup(blobOf(text.slice(0, Math.floor(text.length / 2))), PW, {
        db: b.db,
      }),
      'CORRUPTED',
    );
    await expectCode(importBackup(blobOf('not a backup'), PW, { db: b.db }), 'CORRUPTED');
    await expectCode(importBackup(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe])]), PW, { db: b.db }), 'NOT_BACKUP');
    await expectCode(importBackup(blobOf('{"a":1}'), PW, { db: b.db }), 'NOT_BACKUP');
    await unchanged(b, before);
  });

  it('version 99 or a newer schema → UNSUPPORTED_VERSION', async () => {
    const { blob, b, before } = await target();
    const env = JSON.parse(await exportText(blob));
    await expectCode(
      importBackup(blobOf(JSON.stringify({ ...env, version: 99 })), PW, {
        db: b.db,
      }),
      'UNSUPPORTED_VERSION',
    );
    await expectCode(importBackup(blobOf(JSON.stringify({ ...env, schema_version: MIGRATIONS.length + 1 })), PW, { db: b.db }), 'UNSUPPORTED_VERSION');
    await expectCode(inspectBackup(blobOf(JSON.stringify({ ...env, version: 99 })), b.db), 'UNSUPPORTED_VERSION');
    await unchanged(b, before);
  });

  it('a valid ciphertext with a broken payload → CORRUPTED', async () => {
    const { b, before } = await target();
    const salt = new Uint8Array(16);
    const iv = new Uint8Array(12);
    const k = await deriveBackupKey(PW, salt, ITER);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode('{"version":1,"stores":{}}')));
    const env = {
      format: 'open-sermon-backup',
      version: 1,
      schema_version: 4,
      kdf: {
        name: 'PBKDF2',
        hash: 'SHA-256',
        iterations: ITER,
        salt: toBase64(salt),
      },
      cipher: { name: 'AES-GCM', iv: toBase64(iv) },
      ciphertext: toBase64(ct),
      created_at: 'x',
    };
    await expectCode(importBackup(blobOf(JSON.stringify(env)), PW, { db: b.db }), 'CORRUPTED');
    await unchanged(b, before);
  });

  it('a failing write transaction rolls everything back', async () => {
    const { blob, b, before } = await target();
    const put = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'outline') throw new DOMException('quota', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(importBackup(blob, PW, { db: b.db, deviceKey: b.key })).rejects.toThrow();
    spy.mockRestore();
    await unchanged(b, before);
  });
});

describe('conflicts', () => {
  async function pair() {
    const a = await device();
    const seeded = await seed(a);
    const blob = await exported(a);
    const b = await device();
    await importBackup(blob, PW, { db: b.db, deviceKey: b.key });
    // B edits the persona and the library item after restoring.
    await savePersona({ ...defaultPersona('p1', '바뀐 이름') }, b.db);
    return { a, b, blob, ...seeded };
  }

  it('default skip keeps existing records and reports them', async () => {
    const { b, blob } = await pair();
    const report = await importBackup(blob, PW, { db: b.db, deviceKey: b.key });
    expect(report.written).toMatchObject({
      sermon_meta: 0,
      persona: 0,
      library_item: 0,
      outline: 0,
      settings: 0,
    });
    expect(report.skipped).toBe(2 + 1 + 1 + 1); // 2 sermons, persona, library item, outline
    expect((await listPersonas(b.db))[0]!.name).toBe('바뀐 이름');
    expect(await listSermons(b.db)).toHaveLength(2);
  });

  it("overwrite replaces same-id records, including a sermon's chunks", async () => {
    const { b, blob, s1 } = await pair();
    const chunkCount = (await dumpAll(b.db)).sermon_chunk!.length;
    // An extra stale chunk for s1 must disappear on overwrite.
    const enc = await encrypt('stale', b.key);
    await withTransaction(
      'sermon_chunk',
      'readwrite',
      (tx) =>
        req(
          tx.objectStore('sermon_chunk').put({
            id: 'stale',
            sermon_id: s1.id,
            seq: 99,
            keywords: [],
            verse_refs: [],
            ...enc,
          }),
        ),
      b.db,
    );
    await setSettings({ ui_language: 'en' }, b.db);
    const report = await importBackup(blob, PW, {
      db: b.db,
      deviceKey: b.key,
      onConflict: 'overwrite',
    });
    expect(report.written).toMatchObject({
      sermon_meta: 2,
      persona: 1,
      library_item: 1,
      outline: 1,
      settings: 4,
    });
    expect(report.skipped).toBe(0);
    expect((await listPersonas(b.db))[0]!.name).toBe('주일 아침');
    expect((await dumpAll(b.db)).sermon_chunk).toHaveLength(chunkCount);
    expect((await getAllSettings(b.db)).ui_language).toBe('ko');
  });

  it('skip does not report settings that already exist', async () => {
    const a = await device();
    await seed(a);
    const b = await device();
    await setSettings({ ui_language: 'en' }, b.db);
    const report = await importBackup(await exported(a), PW, {
      db: b.db,
      deviceKey: b.key,
    });
    expect(report.skipped).toBe(0);
    expect(report.written.settings).toBe(3);
    expect((await getAllSettings(b.db)).ui_language).toBe('en');
  });

  it('invalid persona rows are skipped', async () => {
    const a = await device();
    await seed(a);
    await withTransaction('persona', 'readwrite', (tx) => req(tx.objectStore('persona').put({ id: 'bad', name: '김철수 목사', denomination: 'x' })), a.db);
    const b = await device();
    const report = await importBackup(await exported(a), PW, {
      db: b.db,
      deviceKey: b.key,
    });
    expect(report.written.persona).toBe(1);
    expect(report.skipped).toBe(1);
  });
});

describe('style profiles', () => {
  // A profile made from the device's current sermon set (S10 computeSourceHash).
  const putProfile = async (db: IDBDatabase, id: string, sourceHash?: string) => {
    const rec = { id, profile_json: '{}', source_hash: sourceHash ?? (await computeSourceHash(await listSermons(db))), prompt_version: 'v1' };
    await withTransaction('style_profile', 'readwrite', (tx) => req(tx.objectStore('style_profile').put(rec)), db);
  };

  it('restored when the final sermon set matches the backup', async () => {
    const a = await device();
    await seed(a);
    await putProfile(a.db, 'sp');
    const b = await device();
    const report = await importBackup(await exported(a), PW, {
      db: b.db,
      deviceKey: b.key,
    });
    expect(report.written.style_profile).toBe(1);
    expect(report.profilesInvalidated).toBe(false);
  });

  it('dropped when other sermons exist; device profiles cleared when sermons were added', async () => {
    const a = await device();
    await seed(a);
    await putProfile(a.db, 'sp');
    const b = await device();
    await saveSermon({ title: '기존', text: long('기존') }, { granted: true, at: 1 }, { db: b.db, key: b.key, now: 1 });
    await putProfile(b.db, 'mine');
    const report = await importBackup(await exported(a), PW, {
      db: b.db,
      deviceKey: b.key,
    });
    expect(report.written.style_profile).toBe(0);
    expect(report.profilesInvalidated).toBe(true);
    expect((await dumpAll(b.db)).style_profile).toEqual([]);
  });
  it('dropped when its source_hash does not match the sermon set', async () => {
    const a = await device();
    await seed(a);
    await putProfile(a.db, 'sp', 'not-this-set');
    const b = await device();
    const report = await importBackup(await exported(a), PW, { db: b.db, deviceKey: b.key });
    expect(report.written.style_profile).toBe(0);
    expect(report.profilesInvalidated).toBe(true);
  });

  it('the sermon-set hash is the same on the restoring device', async () => {
    const a = await device();
    await seed(a);
    await putProfile(a.db, 'sp');
    const hashA = await computeSourceHash(await listSermons(a.db));
    const b = await device();
    await importBackup(await exported(a), PW, { db: b.db, deviceKey: b.key });
    expect(await computeSourceHash(await listSermons(b.db))).toBe(hashA);
  });
});
