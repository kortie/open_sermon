// S04 chunking: 200–800 chars, consecutive seq, lossless join, boundary cases (DESIGN 3.9).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chunkText } from '../../../src/core/sermon/chunk';
import { extractKeywords, extractVerseRefs } from '../../../src/core/sermon/extract';

const MIN = 200;
const MAX = 800;
const sentences = (n: number, f = (i: number) => `이것은 ${i}번째 문장으로 포도나무와 가지를 생각합니다.`) =>
  Array.from({ length: n }, (_, i) => f(i)).join(' ');

function checkAll(text: string) {
  const chunks = chunkText(text);
  expect(chunks.join('')).toBe(text);
  if (text.length >= MIN) for (const c of chunks) {
    expect(c.length, JSON.stringify(chunks.map((x) => x.length))).toBeGreaterThanOrEqual(MIN);
    expect(c.length).toBeLessThanOrEqual(MAX);
  }
  return chunks;
}

describe('chunkText', () => {
  it('fixture sermon: every chunk 200–800 and joins back to the text', () => {
    const text = readFileSync('tests/fixtures/sermons/sermon.txt', 'utf8').trim();
    expect(checkAll(text).length).toBeGreaterThanOrEqual(2);
  });

  it('199 chars stays one (short) chunk; 200 and 800 are one chunk', () => {
    for (const n of [199, 200, 800]) {
      const t = '나'.repeat(n - 1) + '.';
      expect(chunkText(t)).toEqual([t]);
    }
  });

  it('801 chars without a break is split into two valid chunks', () => {
    const t = '나'.repeat(800) + '.';
    const c = checkAll(t);
    expect(c).toHaveLength(2);
  });

  it('a long paragraph without punctuation is split near spaces', () => {
    const t = Array.from({ length: 500 }, (_, i) => `단어${i}`).join(' ');
    const c = checkAll(t);
    for (const chunk of c.slice(0, -1)) expect(chunk.endsWith(' ')).toBe(true);
  });

  it('a long run without spaces is hard-split', () => {
    checkAll('가'.repeat(2500));
  });

  it('prefers sentence ends: no chunk starts mid-sentence in normal prose', () => {
    const t = sentences(60);
    const c = checkAll(t);
    for (const chunk of c.slice(1)) expect(chunk.startsWith('이것은')).toBe(true);
  });

  it('flushes at paragraph ends once the chunk is long enough', () => {
    const para = sentences(7); // ~250 chars
    const t = [para, para, para].join('\n\n');
    const c = checkAll(t);
    expect(c).toHaveLength(3);
    expect(c[0]?.endsWith('\n\n')).toBe(true);
  });

  it('short final paragraph merges into the previous chunk or is rebalanced', () => {
    checkAll(sentences(20) + '\n\n짧은 끝.');
    checkAll(sentences(25) + '\n\n' + sentences(3));
  });

  it('many varied inputs keep the invariants', () => {
    for (let n = 1; n < 120; n += 7) {
      checkAll(sentences(n, (i) => `${'말씀'.repeat((i * 7) % 23)} ${i}번 문장!`));
      checkAll(Array.from({ length: n }, (_, i) => '가나다 '.repeat((i * 13) % 50)).join('\n'));
    }
  });

  it('empty text gives no chunks', () => {
    expect(chunkText('')).toEqual([]);
  });
});

describe('chunk metadata', () => {
  it('keywords: frequent content words, no particles, no mask tokens, no sentences', () => {
    const k = extractKeywords('포도나무와 가지. 포도나무는 열매를 맺습니다. 가지가 포도나무에 붙어 있으면 열매가 맺힙니다. [이름] 집사님 [연락처]');
    expect(k[0]).toBe('포도나무');
    expect(k).toContain('가지');
    expect(k).toContain('열매');
    expect(k.join(' ')).not.toMatch(/이름|연락처|습니다/);
    expect(k.length).toBeLessThanOrEqual(10);
    for (const w of k) expect(w).not.toMatch(/\s/);
  });

  it('keywords: English words, stopwords removed', () => {
    expect(extractKeywords('The vine and the branches. Abide in the vine.')).toEqual(['vine', 'branches', 'abide']);
  });

  it('verse refs: Korean and English forms in canonical form, validated, deduplicated', () => {
    expect(extractVerseRefs('오늘 본문은 요 15:1-8 말씀입니다. 요 15:1-8 다시.')).toEqual(['JHN 15:1-8']);
    expect(extractVerseRefs('요한복음 3장 16절과 시편 23:1, 3 그리고 John 15:5')).toEqual(['JHN 3:16', 'PSA 23:1,3', 'JHN 15:5']);
    expect(extractVerseRefs('로마서 8장 28-30절')).toEqual(['ROM 8:28-30']);
  });

  it('verse refs: ignores times, chapters alone, and words that merely end in a book abbreviation', () => {
    expect(extractVerseRefs('오전 11:30에 모입니다. 필요 3:1 아님. 찬송가 305장. 창세기 1장')).toEqual([]);
  });
});
