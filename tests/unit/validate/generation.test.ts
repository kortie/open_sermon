// S09: generation validation (DESIGN 7.1–7.3) against fixture replies.
import { describe, expect, it } from 'vitest';
import { parseOutput } from '../../../src/core/generate/parseOutput';
import {
  checkStructure,
  countLength,
  forbiddenTopic,
  refWithin,
  splitQuotes,
  stripQuotes,
  validateGeneration,
  type Lang,
  type ValidateInput,
} from '../../../src/core/validate';
import { fixture, KEYWORDS_EN, KEYWORDS_KO, ref, reply, SOURCES, VERSES } from '../../fixtures/llm-responses';

const INPUT = [ref('JHN 15:1-5')];
function run(name: string, lang: Lang = 'ko', extra: Partial<ValidateInput> = {}) {
  return validateGeneration({
    output: parseOutput(reply(name)),
    inputRefs: INPUT,
    lang,
    keywords: lang === 'ko' ? KEYWORDS_KO : KEYWORDS_EN,
    copySources: [{ id: 'chunk-1', text: SOURCES.excerpt }],
    quotedBlocks: VERSES.map((v) => v.text),
    ...extra,
  });
}
const kinds = (r: ReturnType<typeof run>) => r.issues.map((i) => i.kind);

describe('fixtures', () => {
  it('a normal reply passes (ko, en)', () => {
    for (const [name, lang] of [['ok-ko', 'ko'], ['ok-en', 'en']] as const) {
      const r = run(name, lang);
      expect(r.issues).toEqual([]);
      expect(r.humorIssues).toEqual([]);
      expect(r.ok).toBe(true);
      expect(r.output?.humor).toHaveLength(2);
    }
  });

  it('not JSON → schema', () => {
    const r = validateGeneration({ output: parseOutput('Sure! Here is your draft.'), inputRefs: INPUT, lang: 'ko', keywords: [], copySources: [], quotedBlocks: [] });
    expect(r).toMatchObject({ ok: false, issues: [{ kind: 'schema' }] });
    expect(r.output).toBeUndefined();
  });

  it('one example → count', () => {
    expect(run('examples-one').issues).toContainEqual({ kind: 'count', field: 'examples' });
  });

  it('verse_refs outside the passage, and quote markers outside it, fail', () => {
    expect(run('verse-out-of-range').issues).toContainEqual({ kind: 'verse_out_of_range', ref: 'JHN 15:9' });
    expect(run('quote-out-of-range').issues).toContainEqual({ kind: 'verse_out_of_range', ref: 'ROM 8:1' });
  });

  it('ko length 799 and 1201 fail; 800 and 1200 pass', () => {
    expect(run('ko-799').issues).toEqual([{ kind: 'length', actual: 799, min: 800, max: 1200, unit: 'chars' }]);
    expect(run('ko-1201').issues).toEqual([{ kind: 'length', actual: 1201, min: 800, max: 1200, unit: 'chars' }]);
    expect(run('ko-800').ok).toBe(true);
    expect(run('ko-1200').ok).toBe(true);
  });

  it('en length 549 and 751 words fail; 550 and 750 pass', () => {
    expect(run('en-549', 'en').issues).toEqual([{ kind: 'length', actual: 549, min: 550, max: 750, unit: 'words' }]);
    expect(run('en-751', 'en').issues).toEqual([{ kind: 'length', actual: 751, min: 550, max: 750, unit: 'words' }]);
    expect(run('en-550', 'en').ok).toBe(true);
    expect(run('en-750', 'en').ok).toBe(true);
  });

  it('a forbidden-topic light remark drops the light remarks only', () => {
    const r = run('humor-forbidden');
    expect(r.ok).toBe(true);
    expect(r.humorDropped).toBe(true);
    expect(r.humorIssues).toContainEqual({ kind: 'humor_topic', index: 0, topic: 'clergy_mockery' });
    expect(r.output?.humor).toEqual([]);
    expect(r.output?.examples).toHaveLength(2);
  });

  it('a purpose without an input keyword drops the light remarks only', () => {
    const r = run('humor-no-keyword');
    expect(r.ok).toBe(true);
    expect(r.humorIssues).toEqual([{ kind: 'humor_purpose', index: 1 }]);
  });

  it('pastor imitation ("○○ 목사처럼") fails', () => {
    expect(kinds(run('imitation'))).toContain('real_person');
  });

  it('a doctrinal assertion fails', () => {
    expect(run('doctrine').issues).toContainEqual({ kind: 'forbidden_expr', term: '이단이다' });
  });

  it('20 characters copied from an excerpt are detected; 19 are not', () => {
    expect(run('copy-excerpt').issues).toEqual([{ kind: 'copy', sourceId: 'chunk-1' }]);
    expect(run('copy-19').ok).toBe(true);
  });

  it('a bundled KJV quote passes even when an excerpt quotes the same verse at length', () => {
    const r = run('kjv-quote', 'en', { copySources: [{ id: 'chunk-kjv', text: `My sermon: ${SOURCES.kjv_5}. Amen.` }] });
    expect(r.issues).toEqual([]);
    // Without the bundled text excluded, the same reply would be flagged.
    expect(run('kjv-quote', 'en', { copySources: [{ id: 'chunk-kjv', text: SOURCES.kjv_5 }], quotedBlocks: [] }).issues).toContainEqual({ kind: 'copy', sourceId: 'chunk-kjv' });
  });

  it('imported bible text is a copy source too (S11 interface)', () => {
    const r = run('kjv-quote', 'en', { copySources: [{ id: 'imported:abc', text: 'Some imported translation line that the reply does not use at all here.' }] });
    expect(r.ok).toBe(true);
  });
});

describe('structure', () => {
  it('rejects wrong field types and empty bodies', () => {
    const ok = fixture('ok-ko');
    const bad = [
      null,
      [],
      { ...ok, sermon: 'x' },
      { ...ok, sermon: { title: 't', body: ' ', verse_refs: [] } },
      { ...ok, sermon: { title: 't', body: 'b', verse_refs: [1] } },
      { ...ok, examples: [{ text: '', verse_refs: [] }] },
      { ...ok, examples: ['x'] },
      { ...ok, humor: [{ text: 'x' }] },
    ];
    for (const b of bad) expect(checkStructure(b)).toEqual({ ok: false, issues: [{ kind: 'schema' }] });
  });

  it('drops unknown fields and reports both counts', () => {
    const ok = fixture('ok-ko') as { examples: unknown[]; humor: unknown[] };
    const r = checkStructure({ ...ok, extra: '<b>', examples: [], humor: ok.humor.slice(0, 1) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toEqual([
      { kind: 'count', field: 'examples' },
      { kind: 'count', field: 'humor' },
    ]);
    expect(r.output).not.toHaveProperty('extra');
  });

  it('an example without verse_refs fails', () => {
    const o = fixture('ok-ko') as { examples: { verse_refs: string[] }[] };
    o.examples[1]!.verse_refs = [];
    expect(validateGeneration({ output: o, inputRefs: INPUT, lang: 'ko', keywords: KEYWORDS_KO, copySources: [], quotedBlocks: [] }).issues).toEqual([{ kind: 'verse_missing', index: 1 }]);
  });
});

describe('parts', () => {
  it('refWithin: comma blocks, whole chapters, other chapters, unparsable', () => {
    const comma = [ref('JHN 15:1-3,7')];
    expect(refWithin('JHN 15:7', comma)).toBe(true);
    expect(refWithin('요 15:2-3', comma)).toBe(true);
    expect(refWithin('JHN 15:4', comma)).toBe(false);
    expect(refWithin('JHN 15', comma)).toBe(false);
    expect(refWithin('JHN 16:1', comma)).toBe(false);
    expect(refWithin('nonsense', comma)).toBe(false);
    expect(refWithin('JHN 15:27', [ref('JHN 15')])).toBe(true);
  });

  it('quote markers split, strip and do not count toward length', () => {
    expect(splitQuotes('가 [[QUOTE JHN 15:5]] 나')).toEqual([
      { kind: 'text', text: '가 ' },
      { kind: 'quote', ref: 'JHN 15:5' },
      { kind: 'text', text: ' 나' },
    ]);
    expect(splitQuotes('[[ QUOTE JHN 15:1-2 ]]')).toEqual([{ kind: 'quote', ref: 'JHN 15:1-2' }]);
    expect(stripQuotes('a [[QUOTE JHN 15:5]] b')).toBe('a b');
    expect(countLength('가나 [[QUOTE JHN 15:5]]', 'ko')).toBe(2);
    expect(countLength("God's love isn't far-off — it's near [[QUOTE JHN 15:5]]", 'en')).toBe(6);
    expect(countLength('👨‍👩‍👧 가', 'ko')).toBe(3);
  });

  it('forbidden topics: Latin terms match whole words only, both languages apply', () => {
    expect(forbiddenTopic('Essex is lovely')).toBeNull();
    expect(forbiddenTopic('women are wonderful')).toBe('group_disparagement');
    expect(forbiddenTopic('Vote for the President')).toBe('political');
    expect(forbiddenTopic('선거 이야기')).toBe('political');
    expect(forbiddenTopic('포도나무 이야기')).toBeNull();
  });
});
