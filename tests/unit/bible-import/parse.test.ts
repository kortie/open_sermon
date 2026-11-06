// S11: txt bible import — file checks, decoding (UTF-8, BOM, CRLF, EUC-KR), format detection,
// parsers and the inspection report. Fixtures are synthetic text (tests/fixtures/bible-import).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkFile,
  decodeBytes,
  detectFormat,
  ImportError,
  inspectText,
  MAX_FILE_BYTES,
  MAX_WARNING_RATIO,
  parseA,
  parseB,
  splitLines,
  structureFrom,
  type BibleStructure,
} from '../../../src/core/bible-import';

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/bible-import/${name}`));
/** Every book 50 chapters of 31 verses (enough for the fixtures). */
const STRUCT: BibleStructure = { chapterCount: (b) => (b >= 1 && b <= 66 ? 50 : 0), verseCount: () => 31 };

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof ImportError ? e.code : `other:${String(e)}`;
  }
  return 'no error';
}

const inspectFile = (name: string) => {
  const { text, encoding } = decodeBytes(fixture(name));
  return inspectText(text, encoding, STRUCT);
};

describe('file checks', () => {
  it('accepts .txt only, case-insensitive', () => {
    expect(code(() => checkFile('bible.txt', 10))).toBe('no error');
    expect(code(() => checkFile('BIBLE.TXT', 10))).toBe('no error');
    for (const n of ['bible.docx', 'bible.pdf', 'bible.epub', 'bible', 'txt']) expect(code(() => checkFile(n, 10))).toBe('UNSUPPORTED_TYPE');
  });

  it('rejects files over 10MB before reading, and oversized bytes', () => {
    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(code(() => checkFile('bible.txt', MAX_FILE_BYTES + 1))).toBe('TOO_LARGE');
    expect(code(() => checkFile('bible.txt', MAX_FILE_BYTES))).toBe('no error');
    expect(code(() => decodeBytes(new Uint8Array(MAX_FILE_BYTES + 1).fill(0x41)))).toBe('TOO_LARGE');
  });

  it('rejects binary content renamed to .txt (e.g. a .docx zip)', () => {
    expect(code(() => decodeBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])))).toBe('UNSUPPORTED_TYPE');
  });
});

describe('decoding', () => {
  it('reads UTF-8, strips the BOM and handles CRLF', () => {
    const plain = decodeBytes(fixture('format-a.txt'));
    const bom = decodeBytes(fixture('format-a-bom-crlf.txt'));
    expect(plain.encoding).toBe('utf-8');
    expect(bom.encoding).toBe('utf-8');
    expect(bom.text.charCodeAt(0)).not.toBe(0xfeff);
    expect(splitLines(bom.text)).toEqual(splitLines(plain.text));
  });

  it('falls back to EUC-KR and gives the same result as the UTF-8 file (open question 14)', () => {
    for (const [utf8, euckr] of [
      ['format-a.txt', 'format-a-euckr.txt'],
      ['format-b.txt', 'format-b-euckr.txt'],
    ] as const) {
      const a = inspectFile(utf8);
      const b = inspectFile(euckr);
      expect(b.report.encoding).toBe('euc-kr');
      expect(b.verses).toEqual(a.verses);
      expect({ ...b.report, encoding: 'utf-8' }).toEqual(a.report);
    }
  });

  it('rejects bytes that are neither UTF-8 nor EUC-KR', () => {
    const junk = new Uint8Array(400).fill(0xff);
    expect(code(() => decodeBytes(junk))).toBe('ENCODING');
  });
});

describe('format detection', () => {
  it('format A and B fixtures', () => {
    expect(inspectFile('format-a.txt').report.format).toBe('A');
    expect(inspectFile('format-b.txt').report.format).toBe('B');
  });

  it('mixed A and B is rejected; unknown format is rejected; empty is rejected', () => {
    expect(code(() => inspectFile('mixed.txt'))).toBe('MIXED_FORMAT');
    expect(code(() => inspectFile('unknown.txt'))).toBe('UNKNOWN_FORMAT');
    expect(code(() => detectFormat(splitLines('\n\n# only a comment\n')))).toBe('EMPTY');
  });

  it('a few stray lines (≤ 5%) do not make a file mixed', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `창세기 2:${i + 1} 시험 줄 ${i}`);
    lines.push('요한복음 3장');
    expect(detectFormat(splitLines(lines.join('\n')))).toBe('A');
  });

  it('B headings: 장/편 suffix, numbered English names; a verse line ending in a number is not a heading', () => {
    const r = parseB(splitLines('시편 23편\n1 시험 줄\n2 그 수가 3\n1 Samuel 3\n4 numbered'));
    expect(r.badLines).toEqual([]);
    expect(r.verses.map((v) => [v.book, v.chapter, v.verse])).toEqual([
      [19, 23, 1],
      [19, 23, 2],
      [9, 3, 4],
    ]);
  });

  it('parsers report lines that fit no pattern; B verses before any heading are bad lines', () => {
    expect(parseA(splitLines('창세기 1:1 가\n그냥 문장')).badLines).toEqual([2]);
    expect(parseB(splitLines('1 가\n창세기 1장\n2 나')).badLines).toEqual([1]);
  });
});

describe('inspection report', () => {
  it('format A: books by full name, abbreviation and English name; sorted verses; partial', () => {
    const { report, verses } = inspectFile('format-a.txt');
    expect(verses.map((v) => [v.book, v.chapter, v.verse])).toEqual([
      [1, 1, 1],
      [1, 1, 2],
      [1, 1, 3],
      [1, 2, 1],
      [9, 3, 4],
      [43, 3, 16],
    ]);
    expect(report).toMatchObject({ books: 3, verses: 6, partial: true, warningRatio: 0, canSave: true });
    expect(report.missingChapters).toContainEqual({ book: 1, chapter: 3 });
  });

  it('duplicates keep the first verse and warn; out of range and unknown books warn', () => {
    const text = ['창세기 1:1 첫째', '창세기 1:1 둘째', '창세기 51:1 장 범위 밖', '창세기 1:32 절 범위 밖', '없는책 1:1 모름', '창세기 1:2 정상'].join('\n');
    const { report, verses } = inspectText(text, 'utf-8', STRUCT);
    expect(verses.map((v) => v.text)).toEqual(['첫째', '정상']);
    expect(report.duplicates).toEqual([2]);
    expect(report.outOfRange).toEqual([3, 4]);
    expect(report.unknownBooks).toEqual([5]);
    expect(report.warningRatio).toBeCloseTo(4 / 6);
    expect(report.canSave).toBe(false);
  });

  it('exactly 20% warnings is allowed, above 20% blocks saving', () => {
    expect(MAX_WARNING_RATIO).toBe(0.2);
    const make = (good: number, bad: number) =>
      [...Array.from({ length: good }, (_, i) => `창세기 ${3 + Math.floor(i / 30)}:${(i % 30) + 1} 정상 ${i}`), ...Array.from({ length: bad }, (_, i) => `창세기 4:${40 + i} 범위 밖`)].join('\n');
    expect(inspectText(make(8, 2), 'utf-8', STRUCT).report).toMatchObject({ warningRatio: 0.2, canSave: true });
    expect(inspectText(make(79, 21), 'utf-8', STRUCT).report).toMatchObject({ warningRatio: 0.21, canSave: false });
    expect(inspectText(make(81, 19), 'utf-8', STRUCT).report).toMatchObject({ warningRatio: 0.19, canSave: true });
  });

  it('a full set of 66 books is not partial', () => {
    const text = BOOK_CODES.map((c, i) => `${c} 1:1 시험 ${i}`).join('\n');
    expect(inspectText(text, 'utf-8', STRUCT).report).toMatchObject({ books: 66, partial: false });
  });

  it('structureFrom takes the largest counts over the given bibles', () => {
    const src = {
      chapterCount: (b: string) => (b === 'x' ? 3 : 5),
      verseCount: (b: string) => (b === 'x' ? 10 : 7),
    };
    const s = structureFrom(src, ['x', 'y']);
    expect(s.chapterCount(1)).toBe(5);
    expect(s.verseCount(1, 1)).toBe(10);
  });
});

const BOOK_CODES = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split(' ');
