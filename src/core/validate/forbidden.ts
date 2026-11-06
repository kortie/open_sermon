// Forbidden expressions in the draft and examples (DESIGN 7.1, CLAUDE.md rule 11): doctrinal
// assertions and real-pastor imitation. Both fail the result (retry once, then fall back).
// Lists hold shapes, never real names. Both language lists apply (a reply may mix languages).
import { hasImitationPattern } from './person-name';
import type { GenerationOutput, Issue } from './types';

export const DOCTRINAL_ASSERTIONS = {
  ko: ['유일한 참 교회', '유일하게 옳은 교리', '유일하게 바른 교단', '이단이다', '이단입니다', '구원받지 못한다', '구원받지 못합니다', '반드시 지옥', '지옥에 간다', '지옥에 갑니다', '틀린 교리', '잘못된 교단'],
  en: ['the only true church', 'the only true doctrine', 'the only right denomination', 'is heresy', 'are heretics', 'is a heretic', 'cannot be saved', 'will not be saved', 'will go to hell', 'are going to hell', 'false doctrine', 'wrong denomination'],
} as const;

const LATIN = /[A-Za-z]/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cache = new Map<string, RegExp>();

/** Latin terms match whole words (case-insensitive); other terms match as substrings. */
export function containsTerm(text: string, term: string): boolean {
  const t = text.normalize('NFC');
  if (!LATIN.test(term)) return t.includes(term.normalize('NFC'));
  let re = cache.get(term);
  if (!re) {
    re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(term).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu');
    cache.set(term, re);
  }
  return re.test(t);
}

export function findTerm(text: string, terms: readonly string[]): string | null {
  return terms.find((term) => containsTerm(text, term)) ?? null;
}

const ALL_ASSERTIONS: readonly string[] = [...DOCTRINAL_ASSERTIONS.ko, ...DOCTRINAL_ASSERTIONS.en];

/** Draft title, body and examples. (Light remarks are judged separately and only dropped.) */
export function checkForbidden(o: GenerationOutput): Issue[] {
  const texts = [o.sermon.title, o.sermon.body, ...o.examples.map((e) => e.text)];
  const issues: Issue[] = [];
  if (texts.some(hasImitationPattern)) issues.push({ kind: 'real_person' });
  const terms = new Set(texts.map((t) => findTerm(t, ALL_ASSERTIONS)).filter((t): t is string => t !== null));
  for (const term of terms) issues.push({ kind: 'forbidden_expr', term });
  return issues;
}
