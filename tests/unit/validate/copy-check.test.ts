// S05 copy check (DESIGN 7.3): 20 consecutive normalised characters; quotes excluded.
import { describe, expect, it } from 'vitest';
import { buildCopyIndex, copyCheck, copyCheckBlocks, findCopies, normalizeForCopy } from '../../../src/core/validate/copy-check';
import { hasImitationPattern, looksLikePersonLabel } from '../../../src/core/validate/person-name';

const KO = '가지가 나무에 붙어 있을 때에만 열매를 맺는 것처럼 우리도 주님 안에 머물러야 합니다';
const EN = 'Abide in me, and I in you. As the branch cannot bear fruit of itself, except it abide in the vine.';
const src = [{ id: 'c1', text: KO }, { id: 'c2', text: EN }];

describe('normalizeForCopy', () => {
  it('drops spaces and punctuation, lowercases, keeps offsets', () => {
    const n = normalizeForCopy('A b, C!');
    expect(n.text).toBe('abc');
    expect(n.offsets).toEqual([0, 2, 5]);
  });
  it('composes Hangul jamo (NFC)', () => {
    expect(normalizeForCopy('가').text).toBe('가');
  });
});

describe('copyCheck', () => {
  const k20 = '가지가나무에붙어있을때에만열매를맺는것처'; // exactly 20 normalised chars
  it('fixture is exactly 20 characters', () => expect([...k20]).toHaveLength(20));
  it('detects 20 consecutive characters (ko) and reports the original span', () => {
    const target = `저는 이렇게 씁니다. ${k20} 끝.`;
    const m = copyCheck(target, src);
    expect(m).toHaveLength(1);
    expect(m[0]?.sourceId).toBe('c1');
    expect(target.slice(m[0]!.start, m[0]!.end)).toBe(k20);
  });
  it('does not detect 19 characters', () => {
    expect(copyCheck(`앞 ${k20.slice(0, 19)} 뒤`, src)).toEqual([]);
  });
  it('detects copies that differ only in spaces and punctuation', () => {
    const m = copyCheck('가지가, 나무에 붙어 — 있을 때에만! 열매를 맺는 것처럼', src);
    expect(m.map((x) => x.sourceId)).toEqual(['c1']);
  });
  it('detects English copies regardless of case and punctuation', () => {
    expect(copyCheck('as THE branch cannot bear fruit... of itself', src).map((x) => x.sourceId)).toEqual(['c2']);
    expect(copyCheck('the branch cannot bear', src)).toEqual([]); // 19 letters
  });
  it('merges overlapping windows into one span; separate copies give separate spans', () => {
    const t = `${KO} / 다른 말 / ${EN}`;
    const m = copyCheck(t, src);
    expect(m.map((x) => x.sourceId)).toEqual(['c1', 'c2']);
  });
  it('no sources or empty target → nothing', () => {
    expect(copyCheck(KO, [])).toEqual([]);
    expect(copyCheck('', src)).toEqual([]);
  });
  it('index can be reused across targets', () => {
    const idx = buildCopyIndex(src);
    expect(findCopies(KO, idx)).toHaveLength(1);
    expect(findCopies('전혀 다른 문장으로 쓴 글입니다만 길이는 충분합니다', idx)).toEqual([]);
  });
  it('spans stay correct after astral characters', () => {
    const t = `😀😀 ${k20}`;
    const m = copyCheck(t, src);
    expect(t.slice(m[0]!.start, m[0]!.end)).toBe(k20);
  });
});

describe('copyCheckBlocks', () => {
  it('ignores quote blocks even when they match; checks user text', () => {
    const blocks = [
      { kind: 'quote_excerpt' as const, text: KO },
      { kind: 'quote_bible' as const, text: EN },
      { kind: 'user_text' as const, text: '제 생각을 적었습니다.' },
    ];
    expect(copyCheckBlocks(blocks, src)).toEqual([]);
    const pasted = [...blocks, { kind: 'user_text' as const, text: `붙여넣음: ${KO}` }];
    const r = copyCheckBlocks(pasted, src);
    expect(r).toHaveLength(1);
    expect(r[0]?.block.text).toContain('붙여넣음');
    expect(copyCheckBlocks(pasted, [])).toEqual([]);
  });
});

describe('real-person patterns', () => {
  it.each(['김OO 목사처럼', '홍길동 목사님 스타일로', '○○○ 목사 같이', '그분처럼 설교', 'like Pastor Smith', 'in the style of Rev. Jones'])(
    'imitation: %s',
    (s) => expect(hasImitationPattern(s)).toBe(true),
  );
  it.each(['목사님께서 기도하셨다', '은혜로운 말씀', 'Pastoral care'])('not imitation: %s', (s) => expect(hasImitationPattern(s)).toBe(false));
  it.each(['김철수 목사', '홍길동목사님', 'Pastor Kim', '이영희 전도사'])('label looks like a person: %s', (s) => expect(looksLikePersonLabel(s)).toBe(true));
  it.each(['주일 오전용', '청년부 수요일', '담임 목사용', 'Sunday morning', '새벽 기도'])('label ok: %s', (s) => expect(looksLikePersonLabel(s)).toBe(false));
});

describe('edge cases', () => {
  it('a gram shared by two sources is attributed to the first source', () => {
    const shared = '가지가나무에붙어있을때에만열매를맺는것처럼';
    expect(copyCheck(shared, [{ id: 'first', text: shared }, { id: 'second', text: shared }]).map((m) => m.sourceId)).toEqual(['first']);
  });
  it('a match ending on an astral character includes both code units', () => {
    const src2 = [{ id: 's', text: '𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓' }]; // 20 mathematical letters (letters, astral)
    const target = `앞 ${src2[0]!.text} 뒤`;
    const m = copyCheck(target, src2);
    expect(m).toHaveLength(1);
    expect(target.slice(m[0]!.start, m[0]!.end)).toBe(src2[0]!.text);
  });
  it('adjacent copies from different sources stay separate spans', () => {
    const a = '가나다라마바사아자차카타파하가나다라마바';
    const b = '하나둘셋넷다섯여섯일곱여덟아홉열하나둘셋';
    expect(copyCheck(a + b, [{ id: 'a', text: a }, { id: 'b', text: b }]).map((m) => m.sourceId)).toEqual(['a', 'b']);
  });
  it('a role word does not hide a real name next to it', () => {
    expect(looksLikePersonLabel('담임 김철수 목사')).toBe(true);
    expect(looksLikePersonLabel('원로 목사님')).toBe(false);
  });
});
