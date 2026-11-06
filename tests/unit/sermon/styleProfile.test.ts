// S10: style profile contract in core/sermon — schema, no-original filter, set hash, staleness.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { saveSermon } from '../../../src/core/sermon/ingest';
import { deleteSermon } from '../../../src/core/sermon/read';
import {
  computeSourceHash,
  filterOriginal,
  isEmptyAnswer,
  isStale,
  limitedStyle,
  measureSentences,
  styleProfileStatus,
  validateModelAnswer,
  validateStyleProfile,
  type ModelStyleAnswer,
  type StyleProfile,
} from '../../../src/core/sermon/styleProfile';
import { openDb } from '../../../src/core/store/db';
import { listSermons } from '../../../src/core/store/sermon';
import { getStyleProfileRecord, putStyleProfileRecord, STYLE_PROFILE_ID } from '../../../src/core/store/styleProfile';
import { getOrCreateDeviceKey, resetDeviceKeyCache } from '../../../src/core/vault/crypto-key';

const yes = { granted: true, at: 1 };
const long = (tag: string) => Array.from({ length: 30 }, (_, i) => `${tag} 설교의 ${i}번째 문장으로 말씀을 묵상합니다.`).join(' ');
const opened: IDBDatabase[] = [];
let n = 0;
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  resetDeviceKeyCache();
});
async function fresh() {
  const db = await openDb(`style-${++n}-${Date.now()}`);
  opened.push(db);
  return { db, key: await getOrCreateDeviceKey(db) };
}

const answer: ModelStyleAnswer = {
  illustration_freq: 'mid',
  structure: 'expository',
  tone_summary: ['따뜻하고 차분한 권면이 중심입니다', '질문을 던진 뒤 본문으로 돌아갑니다'],
  frequent_phrases: ['사랑하는 여러분', '함께 생각해 봅시다'],
};
const profile: StyleProfile = { avg_sentence_len: 32, question_ratio: 0.2, ...answer };

describe('schema', () => {
  it('accepts a valid answer and profile', () => {
    expect(validateModelAnswer(answer)).toEqual({ ok: true, answer });
    expect(validateStyleProfile(profile)).toEqual({ ok: true, profile });
  });

  it('rejects 4 summary lines, 11 phrases and a ratio out of range', () => {
    expect(validateModelAnswer({ ...answer, tone_summary: ['a', 'b', 'c', 'd'] })).toEqual({ ok: false, issue: 'tone_summary' });
    expect(validateModelAnswer({ ...answer, frequent_phrases: Array.from({ length: 11 }, (_, i) => `표현${i}`) })).toEqual({ ok: false, issue: 'frequent_phrases' });
    expect(validateStyleProfile({ ...profile, question_ratio: 1.2 })).toEqual({ ok: false, issue: 'question_ratio' });
    expect(validateStyleProfile({ ...profile, question_ratio: -0.1 })).toEqual({ ok: false, issue: 'question_ratio' });
  });

  it('rejects unknown enums, wrong types, long lines and missing numbers', () => {
    expect(validateModelAnswer(null)).toEqual({ ok: false, issue: 'not_object' });
    expect(validateModelAnswer([answer])).toEqual({ ok: false, issue: 'not_object' });
    expect(validateModelAnswer({ ...answer, illustration_freq: 'often' })).toEqual({ ok: false, issue: 'illustration_freq' });
    expect(validateModelAnswer({ ...answer, structure: 'poem' })).toEqual({ ok: false, issue: 'structure' });
    expect(validateModelAnswer({ ...answer, tone_summary: 'one line' })).toEqual({ ok: false, issue: 'tone_summary' });
    expect(validateModelAnswer({ ...answer, tone_summary: ['가'.repeat(101)] })).toEqual({ ok: false, issue: 'tone_summary' });
    expect(validateModelAnswer({ ...answer, frequent_phrases: [1] })).toEqual({ ok: false, issue: 'frequent_phrases' });
    expect(validateStyleProfile({ ...answer, question_ratio: 0.1 })).toEqual({ ok: false, issue: 'avg_sentence_len' });
    expect(validateStyleProfile({ ...profile, avg_sentence_len: Number.NaN })).toEqual({ ok: false, issue: 'avg_sentence_len' });
    expect(validateStyleProfile({ ...profile, frequent_phrases: ['가'.repeat(20)] })).toEqual({ ok: false, issue: 'frequent_phrases' });
  });

  it('trims items and drops blank ones', () => {
    const v = validateModelAnswer({ ...answer, tone_summary: ['  따뜻한   말투  ', ' '], frequent_phrases: [] });
    expect(v).toEqual({ ok: true, answer: { ...answer, tone_summary: ['따뜻한 말투'], frequent_phrases: [] } });
  });
});

describe('measureSentences', () => {
  it('average length and question share', () => {
    expect(measureSentences(['하나님은 사랑이십니다. 우리는 무엇을 하나요? 함께 기도합시다.'])).toEqual({ avg_sentence_len: 11, question_ratio: 0.33 });
    expect(measureSentences([''])).toEqual({ avg_sentence_len: 0, question_ratio: 0 });
  });
});

describe('filterOriginal', () => {
  const sermon = '오늘 우리는 포도나무와 가지의 비유를 통해 주님 안에 머무는 삶을 배웁니다. 사랑하는 여러분 함께 기도합시다.';

  it('drops a phrase that copies 20 characters of a manuscript, and phrases of 20 characters or more', () => {
    const copied = '포도나무와 가지의 비유를 통해 주님 안에 머무는 삶';
    const out = filterOriginal({ ...answer, frequent_phrases: ['사랑하는 여러분', copied, '아주 길게 이어지는 표현이라서 스무 글자를 넘깁니다'] }, [sermon]);
    expect(out.answer.frequent_phrases).toEqual(['사랑하는 여러분']);
    expect(out.removed).toBe(2);
  });

  it('drops copied summary lines and real-person shapes', () => {
    const out = filterOriginal(
      { ...answer, tone_summary: ['포도나무와 가지의 비유를 통해 주님 안에 머무는 삶을 배웁니다', '김철수 목사처럼 말합니다', '차분합니다'], frequent_phrases: ['홍길동 목사님'] },
      [sermon],
    );
    expect(out.answer.tone_summary).toEqual(['차분합니다']);
    expect(out.answer.frequent_phrases).toEqual([]);
    expect(out.removed).toBe(3);
  });

  it('an answer with no summary left is empty', () => {
    expect(isEmptyAnswer({ ...answer, tone_summary: [] })).toBe(true);
    expect(isEmptyAnswer(answer)).toBe(false);
  });
});

describe('source hash and staleness', () => {
  it('order-independent; add, edit and delete each change it', async () => {
    const a = { source_hash: 'aaa' };
    const b = { source_hash: 'bbb' };
    const h = await computeSourceHash([a, b]);
    expect(await computeSourceHash([b, a])).toBe(h);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    const added = await computeSourceHash([a, b, { source_hash: 'ccc' }]);
    const edited = await computeSourceHash([a, { source_hash: 'bbb2' }]);
    const deleted = await computeSourceHash([a]);
    for (const other of [added, edited, deleted]) {
      expect(other).not.toBe(h);
      expect(isStale({ profile_json: '{}', source_hash: h }, other)).toBe(true);
    }
    expect(isStale({ profile_json: '{}', source_hash: h }, h)).toBe(false);
    expect(isStale({ profile_json: null, source_hash: h }, h)).toBe(true);
  });

  it('status: none → ready → stale after adding a sermon', async () => {
    const { db, key } = await fresh();
    await saveSermon({ title: '첫째', text: long('첫째') }, yes, { db, key, now: 1 });
    expect(await styleProfileStatus(db)).toEqual({ state: 'none', sermonCount: 1 });
    const hash = await computeSourceHash(await listSermons(db));
    await putStyleProfileRecord({ id: STYLE_PROFILE_ID, profile_json: JSON.stringify(profile), source_hash: hash, prompt_version: 'style-ko', sermon_count: 1, created_at: 5 }, db);
    expect(await styleProfileStatus(db)).toMatchObject({ state: 'ready', sermonCount: 1, profile });
    await saveSermon({ title: '둘째', text: long('둘째') }, yes, { db, key, now: 2 });
    expect(await styleProfileStatus(db)).toMatchObject({ state: 'stale', sermonCount: 2 });
  });

  it('a stored profile that no longer parses or validates is stale, not used', async () => {
    const { db, key } = await fresh();
    await saveSermon({ title: '첫째', text: long('첫째') }, yes, { db, key, now: 1 });
    const hash = await computeSourceHash(await listSermons(db));
    const rec = { id: STYLE_PROFILE_ID, source_hash: hash, prompt_version: 'v', sermon_count: 1, created_at: 1 };
    await putStyleProfileRecord({ ...rec, profile_json: '{not json' }, db);
    expect((await styleProfileStatus(db)).state).toBe('stale');
    await putStyleProfileRecord({ ...rec, profile_json: JSON.stringify({ ...profile, question_ratio: 3 }) }, db);
    expect((await styleProfileStatus(db)).state).toBe('stale');
  });

  it('deleting a sermon wipes the profile content in the same transaction and leaves a stale marker', async () => {
    const { db, key } = await fresh();
    const s1 = await saveSermon({ title: '첫째', text: long('첫째') }, yes, { db, key, now: 1 });
    await saveSermon({ title: '둘째', text: long('둘째') }, yes, { db, key, now: 2 });
    const hash = await computeSourceHash(await listSermons(db));
    await putStyleProfileRecord({ id: STYLE_PROFILE_ID, profile_json: JSON.stringify(profile), source_hash: hash, prompt_version: 'v', sermon_count: 2, created_at: 9 }, db);
    await deleteSermon(s1.id, { db, key });
    const rec = await getStyleProfileRecord(db);
    expect(rec).toEqual({ id: STYLE_PROFILE_ID, profile_json: null, source_hash: '', prompt_version: 'v', sermon_count: 0, created_at: 9 });
    expect(JSON.stringify(rec)).not.toContain('사랑하는 여러분');
    expect((await styleProfileStatus(db)).state).toBe('stale');
  });

  it('fewer than 3 sermons is a limited profile', () => {
    expect(limitedStyle(2)).toBe(true);
    expect(limitedStyle(3)).toBe(false);
  });
});
