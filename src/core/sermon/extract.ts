// Chunk metadata for "Search My Sermons" scoring (S06): keywords and verse references.
// Both are stored in plain text (DESIGN 4.1), so they hold single words and references only,
// never sentences. Masking tokens ([이름] etc.) are excluded.
import { BOOKS } from '../bible/books';
import { canonicalRef } from '../bible/reference-overlap';
import { parseReference } from '../bible/reference-parser';

export const MAX_KEYWORDS = 10;

const PARTICLES = [
  '에게서', '으로서', '으로써', '이라고', '이라는', '께서는', '에서는', '에게는', '으로는', '처럼', '보다', '에게',
  '께서', '에서', '부터', '까지', '으로', '이나', '이라', '라고', '라는', '하고', '이고', '마다', '조차', '은', '는',
  '이', '가', '을', '를', '의', '에', '도', '만', '로', '와', '과', '께', '요', '야',
];
const VERB_ENDINGS = /(?:니다|니까|세요|십시오|는데|지만|면서|어서|아서|해서|하여|하는|하고|했다|한다|었다|았다|겠다|으며|이며|ㄴ다|었고|았고|셨다|시고|시는|었던|았던|하게|했던|합시다|십니다|ed|ing)$/;
const STOPWORDS = new Set([
  '우리', '그리고', '그러나', '그런데', '그래서', '하지만', '또한', '이것', '그것', '저것', '여기', '거기', '오늘',
  '이번', '지난주', '때문', '것이', '것을', '것은', '수가', '있는', '없는', '같은', '모든', '어떤', '정말', '바로',
  '조금씩', '비로소', '오히려', '날마다', '말씀', '여러분', '하나', '가운데', '통해', '대한', '위해',
  'the', 'and', 'that', 'this', 'with', 'for', 'are', 'was', 'his', 'her', 'you', 'your', 'our', 'not', 'but', 'from', 'they',
  'have', 'has', 'will', 'shall', 'unto', 'into', 'what', 'when', 'who', 'which', 'there', 'their', 'them', 'been',
]);

function stripParticle(word: string): string {
  for (const p of PARTICLES) {
    if (word.length - p.length >= 2 && word.endsWith(p)) return word.slice(0, -p.length);
  }
  return word;
}

/** Up to MAX_KEYWORDS frequent content words (ties: first occurrence). */
export function extractKeywords(text: string, max = MAX_KEYWORDS): string[] {
  const cleaned = text.replace(/\[[^\]\n]{1,10}\]/g, ' ');
  const counts = new Map<string, { n: number; first: number }>();
  let i = 0;
  for (const m of cleaned.matchAll(/[가-힣]{2,}|[A-Za-z]{3,}/g)) {
    const raw = m[0].toLowerCase();
    if (VERB_ENDINGS.test(raw)) continue;
    const w = stripParticle(raw);
    if (w.length < 2 || STOPWORDS.has(w) || STOPWORDS.has(raw)) continue;
    const c = counts.get(w);
    if (c) c.n++;
    else counts.set(w, { n: 1, first: i });
    i++;
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first)
    .slice(0, max)
    .map(([w]) => w);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAMES = [...new Set(BOOKS.flatMap((b) => [b.ko, b.koAbbr, b.en, b.enAbbr]))].sort((a, b) => b.length - a.length);
const N = '\\d{1,3}';
const VERSES = `${N}(?:\\s?[-~–]\\s?${N})?(?:\\s?,\\s?${N}(?:\\s?[-~–]\\s?${N})?)*`;
// "요 15:1-8", "요한복음 15장 1-8절", "John 15:1". A Korean name must not continue a longer word.
const REF = new RegExp(
  `(?<![가-힣A-Za-z0-9])(${NAMES.map(escape).join('|')})\\s?(${N}:${VERSES}|${N}\\s?장\\s?${N}\\s?절?(?:\\s?[-~–]\\s?${N}\\s?절?)?)(?![\\d:])`,
  'g',
);

export { canonicalRef };

/** Verse references mentioned in the text, validated by the reference parser, deduplicated. */
export function extractVerseRefs(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(REF)) {
    const parsed = parseReference(`${m[1]} ${m[2]}`.slice(0, 50));
    if (!parsed.ok || parsed.ref.ranges.length === 0) continue;
    const c = canonicalRef(parsed.ref);
    if (!out.includes(c)) out.push(c);
  }
  return out;
}
