// Book table shared by the reference parser, the formatter and the DB layer
// (skill bible-reference-parser §4.4). Internal BookNo 1..66 equals `books.book` in the bundled
// DB (checked 2026-11-04 against crizin/bible-db v1.0.1), so no separate DB book map is needed.
// `code` is the DB's `books.code`; it is also accepted as an English alias.

export type BookNo = number;

export interface BookInfo {
  no: BookNo;
  code: string;
  ko: string;
  koAbbr: string;
  en: string;
  enAbbr: string;
  /** Extra accepted spellings (compared after lowercasing and removing spaces and dots). */
  aliases: readonly string[];
}

type Row = [code: string, ko: string, koAbbr: string, en: string, enAbbr: string, aliases?: string[]];

const ROWS: Row[] = [
  ['GEN', '창세기', '창', 'Genesis', 'Gen', ['Ge', 'Gn']],
  ['EXO', '출애굽기', '출', 'Exodus', 'Exod', ['Ex']],
  ['LEV', '레위기', '레', 'Leviticus', 'Lev', ['Lv']],
  ['NUM', '민수기', '민', 'Numbers', 'Num', ['Nm']],
  ['DEU', '신명기', '신', 'Deuteronomy', 'Deut', ['Dt']],
  ['JOS', '여호수아', '수', 'Joshua', 'Josh', []],
  ['JDG', '사사기', '삿', 'Judges', 'Judg', ['Jdgs']],
  ['RUT', '룻기', '룻', 'Ruth', 'Ruth', ['Ru']],
  ['1SA', '사무엘상', '삼상', '1 Samuel', '1Sam', []],
  ['2SA', '사무엘하', '삼하', '2 Samuel', '2Sam', []],
  ['1KI', '열왕기상', '왕상', '1 Kings', '1Kgs', ['1Kin']],
  ['2KI', '열왕기하', '왕하', '2 Kings', '2Kgs', ['2Kin']],
  ['1CH', '역대상', '대상', '1 Chronicles', '1Chr', ['1Chron']],
  ['2CH', '역대하', '대하', '2 Chronicles', '2Chr', ['2Chron']],
  ['EZR', '에스라', '스', 'Ezra', 'Ezra', []],
  ['NEH', '느헤미야', '느', 'Nehemiah', 'Neh', ['Ne']],
  ['EST', '에스더', '에', 'Esther', 'Esth', []],
  ['JOB', '욥기', '욥', 'Job', 'Job', ['Jb']],
  ['PSA', '시편', '시', 'Psalms', 'Ps', ['Psalm', 'Pss', 'Psa']],
  ['PRO', '잠언', '잠', 'Proverbs', 'Prov', ['Pr', 'Prv']],
  ['ECC', '전도서', '전', 'Ecclesiastes', 'Eccl', ['Ecc', 'Qoh']],
  ['SNG', '아가', '아', 'Song of Solomon', 'Song', ['Song of Songs', 'SOS', 'Canticles']],
  ['ISA', '이사야', '사', 'Isaiah', 'Isa', ['Is']],
  ['JER', '예레미야', '렘', 'Jeremiah', 'Jer', ['Je']],
  ['LAM', '예레미야애가', '애', 'Lamentations', 'Lam', ['La']],
  ['EZK', '에스겔', '겔', 'Ezekiel', 'Ezek', ['Eze']],
  ['DAN', '다니엘', '단', 'Daniel', 'Dan', ['Dn']],
  ['HOS', '호세아', '호', 'Hosea', 'Hos', ['Ho']],
  ['JOL', '요엘', '욜', 'Joel', 'Joel', ['Jl']],
  ['AMO', '아모스', '암', 'Amos', 'Amos', ['Am']],
  ['OBA', '오바댜', '옵', 'Obadiah', 'Obad', ['Ob']],
  ['JON', '요나', '욘', 'Jonah', 'Jonah', ['Jnh']],
  ['MIC', '미가', '미', 'Micah', 'Mic', ['Mi']],
  ['NAM', '나훔', '나', 'Nahum', 'Nah', ['Na']],
  ['HAB', '하박국', '합', 'Habakkuk', 'Hab', ['Hb']],
  ['ZEP', '스바냐', '습', 'Zephaniah', 'Zeph', []],
  ['HAG', '학개', '학', 'Haggai', 'Hag', ['Hg']],
  ['ZEC', '스가랴', '슥', 'Zechariah', 'Zech', []],
  ['MAL', '말라기', '말', 'Malachi', 'Mal', ['Ml']],
  ['MAT', '마태복음', '마', 'Matthew', 'Matt', ['Mt']],
  ['MRK', '마가복음', '막', 'Mark', 'Mark', ['Mk', 'Mr']],
  ['LUK', '누가복음', '눅', 'Luke', 'Luke', ['Lk', 'Lu']],
  ['JHN', '요한복음', '요', 'John', 'John', ['Jn']],
  ['ACT', '사도행전', '행', 'Acts', 'Acts', ['Ac']],
  ['ROM', '로마서', '롬', 'Romans', 'Rom', ['Ro', 'Rm']],
  ['1CO', '고린도전서', '고전', '1 Corinthians', '1Cor', []],
  ['2CO', '고린도후서', '고후', '2 Corinthians', '2Cor', []],
  ['GAL', '갈라디아서', '갈', 'Galatians', 'Gal', ['Ga']],
  ['EPH', '에베소서', '엡', 'Ephesians', 'Eph', []],
  ['PHP', '빌립보서', '빌', 'Philippians', 'Phil', []],
  ['COL', '골로새서', '골', 'Colossians', 'Col', []],
  ['1TH', '데살로니가전서', '살전', '1 Thessalonians', '1Thess', []],
  ['2TH', '데살로니가후서', '살후', '2 Thessalonians', '2Thess', []],
  ['1TI', '디모데전서', '딤전', '1 Timothy', '1Tim', []],
  ['2TI', '디모데후서', '딤후', '2 Timothy', '2Tim', []],
  ['TIT', '디도서', '딛', 'Titus', 'Titus', []],
  ['PHM', '빌레몬서', '몬', 'Philemon', 'Phlm', ['Philem']],
  ['HEB', '히브리서', '히', 'Hebrews', 'Heb', []],
  ['JAS', '야고보서', '약', 'James', 'Jas', ['Jm']],
  ['1PE', '베드로전서', '벧전', '1 Peter', '1Pet', ['1Pt']],
  ['2PE', '베드로후서', '벧후', '2 Peter', '2Pet', ['2Pt']],
  ['1JN', '요한일서', '요일', '1 John', '1John', ['1Jn', '1Jo']],
  ['2JN', '요한이서', '요이', '2 John', '2John', ['2Jn', '2Jo']],
  ['3JN', '요한삼서', '요삼', '3 John', '3John', ['3Jn', '3Jo']],
  ['JUD', '유다서', '유', 'Jude', 'Jude', []],
  ['REV', '요한계시록', '계', 'Revelation', 'Rev', ['Re', 'Rv']],
];

export const BOOKS: readonly BookInfo[] = ROWS.map(([code, ko, koAbbr, en, enAbbr, aliases = []], i) => ({
  no: i + 1,
  code,
  ko,
  koAbbr,
  en,
  enAbbr,
  aliases,
}));

export const BOOK_COUNT = BOOKS.length;

/** Lowercase, drop spaces and dots: "1 John" → "1john", "Ps." → "ps". */
export function bookKey(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/[\s.]+/g, '');
}

const INDEX: ReadonlyMap<string, BookNo> = (() => {
  const map = new Map<string, BookNo>();
  for (const b of BOOKS) {
    for (const name of [b.code, b.ko, b.koAbbr, b.en, b.enAbbr, ...b.aliases]) {
      const key = bookKey(name);
      const prev = map.get(key);
      if (prev !== undefined && prev !== b.no) throw new Error(`book alias collision: ${name}`);
      map.set(key, b.no);
    }
  }
  return map;
})();

/** Exact (whole-token) match on full name, abbreviation, English name/abbreviation, DB code or alias. */
export function lookupBook(name: string): BookNo | null {
  return INDEX.get(bookKey(name)) ?? null;
}

export function getBook(no: BookNo): BookInfo | undefined {
  return BOOKS[no - 1];
}

export function bookName(no: BookNo, lang: 'ko' | 'en', style: 'short' | 'long' = 'long'): string {
  const b = getBook(no);
  if (!b) return '';
  if (lang === 'ko') return style === 'short' ? b.koAbbr : b.ko;
  return style === 'short' ? b.enAbbr : b.en;
}
