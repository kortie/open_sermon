// S15: single-section results (draft only / example only / light remark only) use the same rules where
// they apply. One everyday example and one light remark (user decision 2026-11-06); the draft accepts
// the wider on-device length range (config on_device_ai.draft_length).
import { describe, expect, it } from 'vitest';
import { on_device_ai } from '../../../config/app.config.json';
import { validateShort } from '../../../src/core/validate/short';
import { fixture, ref, SOURCES } from '../../fixtures/llm-responses';

const ok = fixture('ok-ko') as { sermon: { title: string; body: string; verse_refs: string[] }; examples: unknown[]; humor: { text: string; purpose: string }[] };
const base = { lang: 'ko' as const, inputRefs: [ref('JHN 15:1-5')], copySources: [], quotedBlocks: [] };

describe('validateShort: everyday example', () => {
  it('one example inside the passage passes; no draft, no remark in the output', () => {
    const v = validateShort({ ...base, kind: 'example', output: { examples: ok.examples } });
    expect(v.ok).toBe(true);
    expect(v.output?.examples).toHaveLength(1);
    expect(v.output?.sermon.body).toBe('');
    expect(v.output?.humor).toEqual([]);
  });

  it('schema, count, verse range, missing refs, doctrine and copy are blocking', () => {
    expect(validateShort({ ...base, kind: 'example', output: undefined }).issues).toEqual([{ kind: 'schema' }]);
    expect(validateShort({ ...base, kind: 'example', output: { examples: [{ text: '', verse_refs: [] }] } }).issues).toEqual([{ kind: 'schema' }]);
    expect(validateShort({ ...base, kind: 'example', output: { examples: [ok.examples[0], ok.examples[0]] } }).issues).toContainEqual({ kind: 'count', field: 'examples' });
    expect(validateShort({ ...base, kind: 'example', output: { examples: [{ text: '예시', verse_refs: ['JHN 16:1'] }] } }).issues).toContainEqual({ kind: 'verse_out_of_range', ref: 'JHN 16:1' });
    expect(validateShort({ ...base, kind: 'example', output: { examples: [{ text: '예시', verse_refs: [] }] } }).issues).toContainEqual({ kind: 'verse_missing', index: 0 });
    const doctrine = validateShort({ ...base, kind: 'example', output: { examples: [{ text: '그 교회는 이단이다.', verse_refs: ['JHN 15:1'] }] } });
    expect(doctrine.issues).toContainEqual({ kind: 'forbidden_expr', term: '이단이다' });
    const copied = validateShort({
      ...base,
      kind: 'example',
      copySources: [{ id: 'imported:43:15:1', text: SOURCES.excerpt }],
      output: { examples: [{ text: SOURCES.excerpt, verse_refs: ['JHN 15:1'] }] },
    });
    expect(copied.issues).toContainEqual({ kind: 'copy', sourceId: 'imported:43:15:1' });
  });
});

describe('validateShort: light remark', () => {
  it('one remark with how to bring it in passes, whatever words the purpose uses', () => {
    const v = validateShort({ ...base, kind: 'one_liner', output: { humor: [{ text: '포도 이야기 하나', purpose: '도입에서 가볍게 꺼냅니다.' }] } });
    expect(v).toMatchObject({ ok: true, humorDropped: false });
    expect(v.output?.humor).toHaveLength(1);
    expect(v.output?.examples).toEqual([]);
  });

  it('a forbidden topic or an empty purpose fails the result', () => {
    const topic = validateShort({ ...base, kind: 'one_liner', output: { humor: [{ text: '장례식 농담입니다.', purpose: '도입에서' }] } });
    expect(topic.ok).toBe(false);
    expect(topic.issues.map((i) => i.kind)).toContain('humor_topic');
    const empty = validateShort({ ...base, kind: 'one_liner', output: { humor: [{ text: '좋은 말', purpose: ' ' }] } });
    expect(empty.ok).toBe(false);
    expect(empty.issues).toContainEqual({ kind: 'humor_purpose', index: 0 });
  });

  it('schema and count', () => {
    expect(validateShort({ ...base, kind: 'one_liner', output: { examples: [] } }).issues).toEqual([{ kind: 'schema' }]);
    expect(validateShort({ ...base, kind: 'one_liner', output: { humor: [{ text: 'x' }] } }).issues).toEqual([{ kind: 'schema' }]);
    expect(validateShort({ ...base, kind: 'one_liner', output: { humor: [ok.humor[0], ok.humor[0]] } }).issues).toContainEqual({ kind: 'count', field: 'humor' });
  });
});

describe('validateShort: Reflection Draft', () => {
  const sermon = (over: Partial<typeof ok.sermon>) => ({ sermon: { ...ok.sermon, ...over } });

  it('a draft inside the passage and the length range passes; no example or remark in the output', () => {
    const v = validateShort({ ...base, kind: 'sermon', output: { sermon: ok.sermon, examples: ok.examples } });
    expect(v.ok).toBe(true);
    expect(v.output?.sermon).toEqual(ok.sermon);
    expect(v.output?.examples).toEqual([]);
    expect(v.output?.humor).toEqual([]);
  });

  it('the on-device length range (ko characters, en words) blocks the draft only outside it', () => {
    const ko = on_device_ai.draft_length.ko;
    const en = on_device_ai.draft_length.en;
    expect(ko.min).toBeLessThan(800);
    expect(ko.max).toBeGreaterThan(1200);
    const koBody = (n: number) => sermon({ body: '가'.repeat(n) });
    expect(validateShort({ ...base, kind: 'sermon', output: koBody(ko.min) }).ok).toBe(true);
    expect(validateShort({ ...base, kind: 'sermon', output: koBody(ko.max) }).ok).toBe(true);
    expect(validateShort({ ...base, kind: 'sermon', output: koBody(ko.min - 1) }).issues).toEqual([{ kind: 'length', actual: ko.min - 1, min: ko.min, max: ko.max, unit: 'chars' }]);
    expect(validateShort({ ...base, kind: 'sermon', output: koBody(ko.max + 1) }).issues).toEqual([{ kind: 'length', actual: ko.max + 1, min: ko.min, max: ko.max, unit: 'chars' }]);
    const enBody = (n: number) => sermon({ body: Array(n).fill('word').join(' ') });
    const enBase = { ...base, lang: 'en' as const };
    expect(validateShort({ ...enBase, kind: 'sermon', output: enBody(en.min) }).ok).toBe(true);
    expect(validateShort({ ...enBase, kind: 'sermon', output: enBody(en.max) }).ok).toBe(true);
    expect(validateShort({ ...enBase, kind: 'sermon', output: enBody(en.min - 1) }).issues).toContainEqual(expect.objectContaining({ kind: 'length', unit: 'words' }));
    expect(validateShort({ ...enBase, kind: 'sermon', output: enBody(en.max + 1) }).issues).toContainEqual(expect.objectContaining({ kind: 'length', unit: 'words' }));
  });

  it('schema, verses outside the passage, forbidden expressions and copies fail', () => {
    expect(validateShort({ ...base, kind: 'sermon', output: { examples: ok.examples } }).issues).toEqual([{ kind: 'schema' }]);
    expect(validateShort({ ...base, kind: 'sermon', output: sermon({ body: '  ' }) }).issues).toEqual([{ kind: 'schema' }]);
    expect(validateShort({ ...base, kind: 'sermon', output: sermon({ verse_refs: 'JHN 15:1' as never }) }).issues).toEqual([{ kind: 'schema' }]);
    expect(validateShort({ ...base, kind: 'sermon', output: sermon({ verse_refs: ['JHN 16:1'] }) }).issues).toContainEqual({ kind: 'verse_out_of_range', ref: 'JHN 16:1' });
    const doctrine = validateShort({ ...base, kind: 'sermon', output: sermon({ body: `${ok.sermon.body.slice(0, 900)} 그 교회는 이단이다.` }) });
    expect(doctrine.issues.some((i) => i.kind === 'forbidden_expr')).toBe(true);
    const copied = validateShort({
      ...base,
      kind: 'sermon',
      copySources: [{ id: 'excerpt-1', text: SOURCES.excerpt }],
      output: sermon({ body: `${SOURCES.excerpt} ${ok.sermon.body.slice(0, 900)}` }),
    });
    expect(copied.issues).toContainEqual({ kind: 'copy', sourceId: 'excerpt-1' });
  });
});
