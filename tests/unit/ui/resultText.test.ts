// Result export text (save as txt / send by email): same content as the screen, bundled verses for
// quote markers, labels from i18n, the AI-draft notice kept; safe file names.
import { afterEach, describe, expect, it } from 'vitest';
import { formatReference, parseReference } from '../../../src/core/bible';
import type { GenerationOutput } from '../../../src/core/validate';
import { setLanguage } from '../../../src/i18n';
import { resultFileName, resultSubject, resultText } from '../../../src/ui/result/resultText';
import ko from '../../../src/i18n/ko.json';
import en from '../../../src/i18n/en.json';
import { VERSES } from '../../fixtures/llm-responses';

afterEach(() => setLanguage('ko'));

const R = (s: string, lang: 'ko' | 'en' = 'ko') => {
  const p = parseReference(s);
  if (!p.ok) throw new Error(s);
  return formatReference(p.ref, lang);
};

const output: GenerationOutput = {
  sermon: { title: '포도나무에 붙어 있는 삶', body: '첫 문단입니다.\n\n[[QUOTE JHN 15:1-2]]\n\n둘째 문단입니다. [[QUOTE ROM 8:1]]', verse_refs: ['JHN 15:1', 'JHN 15:5'] },
  examples: [{ text: '지난주 택시 기사님과 이야기했습니다.', verse_refs: ['JHN 15:4'] }],
  humor: [{ text: '포도 농부의 농담', purpose: '도입에서 가볍게' }],
};
const base = { output, humorDropped: false, verses: VERSES, bibleId: 'krv', lang: 'ko' as const, refText: 'JHN 15:1-5' };

describe('resultText', () => {
  it('ko: subject, passage line, every section, bundled quotes, refs and the AI notice', () => {
    setLanguage('ko');
    const txt = resultText(base);
    expect(resultSubject(base)).toBe(`포도나무에 붙어 있는 삶 (${R('JHN 15:1-5')})`);
    expect(txt.startsWith(`포도나무에 붙어 있는 삶 (${R('JHN 15:1-5')})\n\n${R('JHN 15:1-5')} · ${ko.bible.krv}\n\n`)).toBe(true);
    expect(txt).toContain(`■ ${ko.result.sermon}`);
    expect(txt).toContain(`[${ko.result.quote.replace('{bible}', ko.bible.krv)} · ${R('JHN 15:1-2')}]\n1 ${VERSES[0]!.text}\n2 ${VERSES[1]!.text}`);
    expect(txt).not.toContain('[[QUOTE');
    expect(txt).not.toContain('ROM 8:1'); // a marker without bundled verses is dropped, as on screen
    expect(txt).toContain(`${ko.result.verse_refs}: ${R('JHN 15:1')}, ${R('JHN 15:5')}`);
    expect(txt).toContain(`■ ${ko.result.examples}\n\n1.\n지난주 택시 기사님과 이야기했습니다.`);
    expect(txt).toContain(`■ ${ko.result.humor}\n\n포도 농부의 농담\n${ko.result.purpose.replace('{purpose}', '도입에서 가볍게')}`);
    expect(txt.trimEnd().endsWith(`— ${ko.result.ai_notice}`)).toBe(true);
  });

  it('one section only (on-device AI); a dropped light remark says so', () => {
    const ex = { ...base, only: 'examples' as const };
    expect(resultSubject(ex)).toBe(`${ko.result.examples} (${R('JHN 15:1-5')})`);
    expect(resultText(ex)).not.toContain(ko.result.sermon);
    expect(resultText(ex)).not.toContain(`■ ${ko.result.humor}`);
    const humor = resultText({ ...base, only: 'humor', humorDropped: true });
    expect(humor).toContain(ko.result.humor_dropped);
    expect(humor).not.toContain('포도 농부의 농담');
  });

  it('en labels follow the language', () => {
    setLanguage('en');
    const txt = resultText({ ...base, lang: 'en', bibleId: 'kjv' });
    expect(txt).toContain(`■ ${en.result.sermon}`);
    expect(txt).toContain(R('JHN 15:1-5', 'en'));
    expect(txt).toContain(en.result.ai_notice);
  });
});

describe('resultFileName', () => {
  it('drops characters file systems refuse, trims, caps at 60 characters, keeps Hangul', () => {
    expect(resultFileName('삶 / 열매: "포도"? <나무> | 끝.')).toBe('삶 열매 포도 나무 끝.txt');
    expect(resultFileName('가'.repeat(80))).toBe(`${'가'.repeat(60)}.txt`);
    expect(resultFileName(' \u0000 ')).toBe('open-sermon.txt');
  });
});
