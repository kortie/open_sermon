// Real-pastor imitation patterns (CLAUDE.md rule 11, DESIGN 3.8, 7.1). Shared by persona labels
// (S05) and generated drafts (S09). No list of real names: only shapes such as "○○ 목사처럼".

/** Imitation phrases: "김OO 목사처럼", "○○○ 목사님 스타일", "like Pastor X". Used for drafts and labels. */
export const IMITATION_PATTERNS: readonly RegExp[] = [
  /[가-힣A-Za-z○OＯ]{1,6}\s?(?:목사|전도사|선교사|감독|신부)(?:님)?\s?(?:처럼|같이|스타일|풍|식으로|의\s?방식)/,
  /(?:처럼|같이)\s?(?:설교|말씀을\s?전)/,
  /\b(?:like|in\s+the\s+(?:style|manner)\s+of|imitat\w*)\s+(?:pastor|rev\.?|reverend|bishop|father|dr\.?)\s+\w+/i,
];

/** A name followed by a clergy title: "김철수 목사", "홍길동 목사님", "Pastor Smith". Labels only. */
const TITLED_KO = /(?<![가-힣])([가-힣○OＯ]{2,4})\s?(?:목사|전도사|선교사|감독|신부|장로)(?:님)?/g;
const TITLED_EN = /\b(?:pastor|rev\.?|reverend|bishop|father)\s+[A-Za-z]{2,}/i;
/** Role words before a title that are not names ("담임 목사용" is a fine label). */
const ROLE_WORDS = new Set(['담임', '원로', '협동', '교육', '청년', '선교', '은퇴', '부목', '새벽', '주일', '우리', '모든']);

export function hasImitationPattern(text: string): boolean {
  return IMITATION_PATTERNS.some((re) => re.test(text));
}

/** Persona labels must not look like a real person (stricter than draft checks). */
export function looksLikePersonLabel(label: string): boolean {
  if (hasImitationPattern(label) || TITLED_EN.test(label)) return true;
  for (const m of label.matchAll(TITLED_KO)) if (!ROLE_WORDS.has(m[1]!)) return true; // group 1 always takes part in a match
  return false;
}
