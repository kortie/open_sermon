// S05 persona: allowed values only, emphasis dedupe, label rules, storage, active persona.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../../src/i18n/en.json' with { type: 'json' };
import ko from '../../../src/i18n/ko.json' with { type: 'json' };
import { defaultPersona, optionLabelKey, PERSONA_OPTIONS, type PersonaField } from '../../../src/core/persona/options';
import { validatePersona } from '../../../src/core/persona/validate';
import { openDb } from '../../../src/core/store/db';
import { deletePersona, getActivePersona, listPersonas, savePersona, setActivePersona } from '../../../src/core/store/persona';

const base = () => ({ ...defaultPersona('p1', '주일 오전용') });

describe('validatePersona', () => {
  it('accepts allowed values on every field boundary', () => {
    for (const f of Object.keys(PERSONA_OPTIONS) as PersonaField[]) {
      for (const code of PERSONA_OPTIONS[f]) {
        const input = { ...base(), [f]: f === 'emphasis' ? [code] : code };
        expect(validatePersona(input).ok, `${f}=${code}`).toBe(true);
      }
    }
  });
  it.each(['denomination', 'style', 'tone', 'audience', 'length'] as const)('rejects an unknown %s', (f) => {
    expect(validatePersona({ ...base(), [f]: 'catholic_bishop' })).toEqual({ ok: false, errors: [f] });
  });
  it('length is fixed to 1000', () => {
    expect(validatePersona({ ...base(), length: '1500' })).toEqual({ ok: false, errors: ['length'] });
  });
  it('emphasis: several kept, duplicates removed, empty or unknown rejected', () => {
    const r = validatePersona({ ...base(), emphasis: ['mission', 'grace', 'mission'] });
    expect(r.ok && r.persona.emphasis).toEqual(['grace', 'mission']);
    expect(validatePersona({ ...base(), emphasis: [] })).toEqual({ ok: false, errors: ['emphasis'] });
    expect(validatePersona({ ...base(), emphasis: ['grace', 'wealth'] })).toEqual({ ok: false, errors: ['emphasis'] });
    expect(validatePersona({ ...base(), emphasis: 'grace' })).toEqual({ ok: false, errors: ['emphasis'] });
  });
  it('name: required, at most 20 characters, no real-person patterns', () => {
    expect(validatePersona({ ...base(), name: '  ' })).toEqual({ ok: false, errors: ['name_empty'] });
    expect(validatePersona({ ...base(), name: '가'.repeat(21) })).toEqual({ ok: false, errors: ['name_too_long'] });
    expect(validatePersona({ ...base(), name: '가'.repeat(20) }).ok).toBe(true);
    for (const n of ['김철수 목사', '홍길동 목사님 스타일', '김OO 목사처럼', 'like Pastor Smith'])
      expect(validatePersona({ ...base(), name: n }), n).toEqual({ ok: false, errors: ['name_person'] });
    const r = validatePersona({ ...base(), name: '  청년부   수요일 ' });
    expect(r.ok && r.persona.name).toBe('청년부 수요일');
  });
  it('rejects non-objects and collects several errors', () => {
    expect(validatePersona(null)).toMatchObject({ ok: false });
    const r = validatePersona({ id: 'x', name: 'n', denomination: 'x', emphasis: ['grace'], style: 'x', tone: 'explanatory', audience: 'adult', length: '1000' });
    expect(r).toEqual({ ok: false, errors: ['denomination', 'style'] });
  });
  it('drops extra fields (no free text reaches storage)', () => {
    const r = validatePersona({ ...base(), note: '자유 입력' });
    expect(r.ok && Object.keys(r.persona).sort()).toEqual(['audience', 'denomination', 'emphasis', 'id', 'length', 'name', 'style', 'tone']);
  });
});

describe('labels', () => {
  const get = (o: unknown, path: string) => path.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);
  it('every option has a ko and an en label, and they differ by language', () => {
    for (const f of Object.keys(PERSONA_OPTIONS) as PersonaField[]) {
      for (const code of PERSONA_OPTIONS[f]) {
        const k = optionLabelKey(f, code);
        expect(typeof get(ko, k), k).toBe('string');
        expect(typeof get(en, k), k).toBe('string');
      }
    }
    expect(get(ko, optionLabelKey('denomination', 'presbyterian'))).not.toBe(get(en, optionLabelKey('denomination', 'presbyterian')));
  });
});

const opened: IDBDatabase[] = [];
afterEach(() => opened.splice(0).forEach((db) => db.close()));
const fresh = async () => {
  const db = await openDb(`persona-${Math.random()}`);
  opened.push(db);
  return db;
};

describe('persona store', () => {
  it('saves several, rejects invalid ones, selects and deletes', async () => {
    const db = await fresh();
    expect((await savePersona({ ...base(), id: 'a', name: '주일 오전' }, db)).ok).toBe(true);
    expect((await savePersona({ ...base(), id: 'b', name: '수요 저녁', emphasis: ['grace', 'community'] }, db)).ok).toBe(true);
    expect((await savePersona({ ...base(), id: 'c', denomination: 'unknown' }, db)).ok).toBe(false);
    const list = await listPersonas(db);
    expect(list.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(list.find((p) => p.id === 'b')?.emphasis).toEqual(['grace', 'community']);

    expect(await getActivePersona(db)).toBeNull();
    await setActivePersona('b', db);
    expect((await getActivePersona(db))?.id).toBe('b');
    await deletePersona('b', db);
    expect(await getActivePersona(db)).toBeNull();
    await setActivePersona('a', db);
    await setActivePersona(null, db);
    expect(await getActivePersona(db)).toBeNull();
  });
  it('rows that no longer validate are skipped on read', async () => {
    const db = await fresh();
    await new Promise<void>((resolve) => {
      const tx = db.transaction('persona', 'readwrite');
      tx.objectStore('persona').put({ ...base(), id: 'old', tone: 'retired_value' });
      tx.oncomplete = () => resolve();
    });
    await setActivePersona('old', db);
    expect(await listPersonas(db)).toEqual([]);
    expect(await getActivePersona(db)).toBeNull();
  });
});
