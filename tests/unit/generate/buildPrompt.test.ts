// S09: prompt assembly (DESIGN 6.1) and the persona block (CLAUDE.md rule 11).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPrompt, PromptError, promptVersion, PROMPT_BIBLES, type PromptInput } from '../../../src/core/generate/buildPrompt';
import { buildPersonaBlock, defaultPersona, PERSONA_OPTIONS, type Persona } from '../../../src/core/persona';
import { KEYWORDS_KO, ref, VERSES } from '../../fixtures/llm-responses';

const persona: Persona = { ...defaultPersona('p1', '주일 오전용'), denomination: 'methodist', emphasis: ['grace', 'community'] };
const base: PromptInput = {
  lang: 'ko',
  bibleId: 'kjv',
  refs: [ref('JHN 15:1-5')],
  verses: VERSES,
  keywords: KEYWORDS_KO,
  persona,
  excerpts: [1, 2, 3, 4].map((n) => ({ id: `c${n}`, text: `발췌 본문 ${n}번입니다.` })),
  transferConsent: true,
};
const HEADINGS_KO = ['[페르소나]', '[스타일 프로필]', '[데이터: 참고 발췌]', '[데이터: 본문]', '[데이터: 키워드]', '[출력 형식]'];

describe('buildPrompt', () => {
  it('sections follow 6.1: persona → style → excerpts → passage → keywords → output', () => {
    const p = buildPrompt({ ...base, styleProfile: '- 평균 문장 길이: 짧음' });
    const at = HEADINGS_KO.map((h) => p.user.indexOf(h));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(p.system).toContain('[[QUOTE');
    expect(p.user).toContain('JHN 15:5 I am the vine');
    expect(p.user).toContain('포도나무, 열매, 거하라');
  });

  it('at most 3 excerpts', () => {
    const p = buildPrompt(base);
    expect(p.excerptIds).toEqual(['c1', 'c2', 'c3']);
    expect(p.user).not.toContain('발췌 본문 4번');
  });

  it('no consent → no excerpts and no excerpt section', () => {
    const p = buildPrompt({ ...base, transferConsent: false });
    expect(p.excerptIds).toEqual([]);
    expect(p.user).not.toContain('[데이터: 참고 발췌]');
    expect(p.user).not.toContain('발췌 본문');
  });

  it('no style profile → no style block', () => {
    expect(buildPrompt(base).user).not.toContain('[스타일 프로필]');
    expect(buildPrompt({ ...base, styleProfile: '  ' }).user).not.toContain('[스타일 프로필]');
  });

  it('NIV and other excluded bibles are refused before any text is assembled', () => {
    expect(PROMPT_BIBLES).not.toContain('niv');
    expect(() => buildPrompt({ ...base, bibleId: 'niv' })).toThrow(PromptError);
    expect(() => buildPrompt({ ...base, verses: [] })).toThrow(PromptError);
  });

  it('ko/en templates and their version strings', () => {
    const ko = buildPrompt(base);
    const en = buildPrompt({ ...base, lang: 'en' });
    expect(ko.version).toBe(readFileSync('src/prompts/ko/VERSION', 'utf8').trim());
    expect(en.version).toBe(readFileSync('src/prompts/en/VERSION', 'utf8').trim());
    expect(ko.version).not.toBe(en.version);
    expect(promptVersion('en')).toBe(en.version);
    expect(ko.system).toContain('한국어');
    expect(en.system).toContain('Write everything in English');
    expect(en.user).toContain('[Data: Passage]');
    expect(en.user).toContain('550–750 words');
    expect(ko.user).toContain('800~1200자');
  });

  it('the retry note lists the reasons once each', () => {
    const p = buildPrompt({ ...base, retryIssues: [{ kind: 'copy', sourceId: 'c1' }, { kind: 'length', actual: 10, min: 800, max: 1200, unit: 'chars' }, { kind: 'verse_missing', index: 0 }] });
    expect(p.user.indexOf('[다시 쓰기]')).toBeGreaterThan(p.user.indexOf('[출력 형식]'));
    expect(p.user).toContain('참고 발췌의 문장을 그대로 옮겼습니다.');
    expect(p.user).toContain('800~1200자 범위');
  });

  it('a null persona uses the default persona', () => {
    expect(buildPrompt({ ...base, persona: null }).user).toContain('초교파');
  });
});

describe('persona block', () => {
  it('real pastor names and imitation labels never reach the prompt', () => {
    for (const name of ['김철수 목사처럼', '홍길동 목사님 스타일', 'like Pastor Smith']) {
      const p = buildPrompt({ ...base, persona: { ...persona, name } });
      expect(p.user).not.toContain(name);
      expect(p.system).not.toContain(name);
      expect(buildPersonaBlock({ ...persona, name }, 'en')).not.toContain(name);
    }
  });

  it('tradition tendency wording, phrases for every code in both languages', () => {
    expect(buildPersonaBlock(persona, 'ko')).toContain('감리교 전통의 강조점을 참고하되 교리를 단정하지 않는다');
    expect(buildPersonaBlock(persona, 'ko')).toContain('은혜, 공동체');
    expect(buildPersonaBlock(persona, 'ko')).toContain('약 1000자');
    expect(buildPersonaBlock(persona, 'en')).toContain('about 650 words');
    for (const lang of ['ko', 'en'] as const)
      for (const [field, codes] of Object.entries(PERSONA_OPTIONS)) {
        if (field === 'length') continue;
        for (const code of codes) {
          const p = { ...persona, [field]: field === 'emphasis' ? [code] : code } as Persona;
          expect(() => buildPersonaBlock(p, lang)).not.toThrow();
        }
      }
    expect(() => buildPersonaBlock({ ...persona, tone: 'shouting' as Persona['tone'] }, 'ko')).toThrow();
  });
});
