// S15: short results (examples only / light remarks only) use the same rules where they apply.
import { describe, expect, it } from 'vitest';
import { validateShort } from '../../../src/core/validate/short';
import { fixture, KEYWORDS_KO, ref, SOURCES } from '../../fixtures/llm-responses';

const ok = fixture('ok-ko') as { examples: unknown[]; humor: unknown[] };
const base = { inputRefs: [ref('JHN 15:1-5')], keywords: KEYWORDS_KO, copySources: [], quotedBlocks: [] };

describe('validateShort: examples', () => {
  it('two examples inside the passage pass; no draft, no remarks in the output', () => {
    const v = validateShort({ ...base, kind: 'example', output: { examples: ok.examples } });
    expect(v.ok).toBe(true);
    expect(v.output?.examples).toHaveLength(2);
    expect(v.output?.sermon.body).toBe('');
    expect(v.output?.humor).toEqual([]);
  });

  it('schema, count, verse range, missing refs, doctrine and copy are blocking', () => {
    expect(validateShort({ ...base, kind: 'example', output: undefined }).issues).toEqual([{ kind: 'schema' }]);
    expect(validateShort({ ...base, kind: 'example', output: { examples: [{ text: '', verse_refs: [] }] } }).issues).toEqual([{ kind: 'schema' }]);
    expect(validateShort({ ...base, kind: 'example', output: { examples: [ok.examples[0]] } }).issues).toContainEqual({ kind: 'count', field: 'examples' });
    const out = validateShort({ ...base, kind: 'example', output: { examples: [{ text: '예시', verse_refs: ['JHN 16:1'] }, { text: '예시 둘', verse_refs: [] }] } });
    expect(out.issues).toEqual(expect.arrayContaining([{ kind: 'verse_out_of_range', ref: 'JHN 16:1' }, { kind: 'verse_missing', index: 1 }]));
    const doctrine = validateShort({ ...base, kind: 'example', output: { examples: [{ text: '그 교회는 이단이다.', verse_refs: ['JHN 15:1'] }, ok.examples[1]] } });
    expect(doctrine.issues).toContainEqual({ kind: 'forbidden_expr', term: '이단이다' });
    const copied = validateShort({
      ...base,
      kind: 'example',
      copySources: [{ id: 'imported:43:15:1', text: SOURCES.excerpt }],
      output: { examples: [{ text: SOURCES.excerpt, verse_refs: ['JHN 15:1'] }, ok.examples[1]] },
    });
    expect(copied.issues).toContainEqual({ kind: 'copy', sourceId: 'imported:43:15:1' });
  });
});

describe('validateShort: light remarks', () => {
  it('two good remarks pass', () => {
    const v = validateShort({ ...base, kind: 'one_liner', output: { humor: ok.humor } });
    expect(v).toMatchObject({ ok: true, humorDropped: false });
    expect(v.output?.humor).toHaveLength(2);
    expect(v.output?.examples).toEqual([]);
  });

  it('a failing remark is dropped alone; with none left the result fails', () => {
    const bad = { text: '장례식 농담입니다.', purpose: '열매' };
    const one = validateShort({ ...base, kind: 'one_liner', output: { humor: [ok.humor[0], bad] } });
    expect(one).toMatchObject({ ok: true, humorDropped: true });
    expect(one.output?.humor).toEqual([ok.humor[0]]);
    const none = validateShort({ ...base, kind: 'one_liner', output: { humor: [bad, { text: '좋은 말', purpose: '상관없는 말' }] } });
    expect(none.ok).toBe(false);
    expect(none.issues.map((i) => i.kind)).toEqual(expect.arrayContaining(['humor_topic', 'humor_purpose']));
  });

  it('schema and count', () => {
    expect(validateShort({ ...base, kind: 'one_liner', output: { examples: [] } }).issues).toEqual([{ kind: 'schema' }]);
    expect(validateShort({ ...base, kind: 'one_liner', output: { humor: [{ text: 'x' }] } }).issues).toEqual([{ kind: 'schema' }]);
    expect(validateShort({ ...base, kind: 'one_liner', output: { humor: [ok.humor[0]] } }).issues).toContainEqual({ kind: 'count', field: 'humor' });
  });
});
