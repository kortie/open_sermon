// Prompt assembly (DESIGN 6.1). Order: system → persona → style profile (only if present) → reference
// excerpts (≤ 3, only with an external_transfer consent) → passage (bundled DB text) → keywords →
// output format (→ rewrite note on the retry). Templates live in src/prompts/<lang>; the version
// string goes into gen_cache and the result meta.
import { i18n, sermon_ingest } from '../../../config/app.config.json';
import { canonicalRef, type Reference, type Verse } from '../bible';
import { buildPersonaBlock, defaultPersona, type Persona } from '../persona';
import enPhrases from '../../prompts/en/prompt.json';
import enSchema from '../../prompts/en/output-schema.json?raw';
import enSystem from '../../prompts/en/system.txt?raw';
import enVersion from '../../prompts/en/VERSION?raw';
import koPhrases from '../../prompts/ko/prompt.json';
import koSchema from '../../prompts/ko/output-schema.json?raw';
import koSystem from '../../prompts/ko/system.txt?raw';
import koVersion from '../../prompts/ko/VERSION?raw';
import { lengthBounds, type Issue, type Lang } from '../validate';

const TEMPLATES = {
  ko: { phrases: koPhrases, schema: koSchema, system: koSystem, version: koVersion.trim() },
  en: { phrases: enPhrases, schema: enSchema, system: enSystem, version: enVersion.trim() },
} as const;

export const MAX_EXCERPTS = sermon_ingest.retrieval_top_k;
export const MAX_KEYWORDS = 5;
/** Bibles whose text may go into a prompt: bundled ones that are not excluded (NIV etc.). */
export const PROMPT_BIBLES: readonly string[] = [...new Set(Object.values(i18n.available_bibles).flat())].filter((b) => !i18n.excluded_bibles.includes(b));

export const promptVersion = (lang: Lang): string => TEMPLATES[lang].version;

export interface PromptExcerpt {
  id: string;
  text: string;
}

export interface PromptInput {
  lang: Lang;
  bibleId: string;
  refs: readonly Reference[];
  /** Passage verses from the bundled DB (never written by the model). */
  verses: readonly Verse[];
  keywords: readonly string[];
  /** Active persona; null uses the default persona. Its `name` never goes in. */
  persona: Persona | null;
  /** Style profile summary (S10). Omitted when absent. */
  styleProfile?: string | null;
  /** Candidate excerpts; only used with `transferConsent`. */
  excerpts: readonly PromptExcerpt[];
  transferConsent: boolean;
  /** The user reads an imported bible (S11): tell the model not to re-quote other translations
   *  verse by verse. Neither the imported text nor its name is sent. */
  otherTranslation?: boolean;
  /** The retry carries the reasons of the first attempt. */
  retryIssues?: readonly Issue[];
}

export interface BuiltPrompt {
  system: string;
  user: string;
  version: string;
  /** Excerpt ids actually sent. */
  excerptIds: string[];
}

export class PromptError extends Error {
  constructor(readonly code: 'excluded_bible' | 'no_verses') {
    super(`prompt: ${code}`);
    this.name = 'PromptError';
  }
}

const fill = (s: string, values: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));

export function verseLine(v: Verse): string {
  return `${canonicalRef({ book: v.book, chapter: v.chapter, ranges: [{ start: v.verse, end: v.verse }] })} ${v.text}`;
}

export function buildPrompt(input: PromptInput): BuiltPrompt {
  if (!PROMPT_BIBLES.includes(input.bibleId)) throw new PromptError('excluded_bible');
  if (input.verses.length === 0) throw new PromptError('no_verses');
  const t = TEMPLATES[input.lang];
  const p = t.phrases;
  const bounds = lengthBounds(input.lang);
  const sections: string[] = [];

  sections.push(`${p.headings.persona}\n${buildPersonaBlock(input.persona ?? defaultPersona('default', ''), input.lang)}`);

  const style = input.styleProfile?.trim();
  if (style) sections.push(`${p.headings.style}\n${style}`);

  const excerpts = input.transferConsent ? input.excerpts.filter((e) => e.text.trim()).slice(0, MAX_EXCERPTS) : [];
  if (excerpts.length) {
    const body = excerpts.map((e, i) => `<<<${fill(p.excerpt_label, { n: i + 1 })}\n${e.text.trim()}\n>>>`).join('\n');
    sections.push(`${p.headings.excerpts}\n${p.excerpt_intro}\n${body}`);
  }

  const bibleName = (p.bibles as Record<string, string>)[input.bibleId] ?? input.bibleId;
  sections.push(`${p.headings.passage}\n${fill(p.passage_intro, { bible: bibleName })}\n${input.verses.map(verseLine).join('\n')}${input.otherTranslation ? `\n${p.no_requote}` : ''}`);

  const keywords = [...new Set(input.keywords.map((k) => k.trim()).filter(Boolean))].slice(0, MAX_KEYWORDS);
  sections.push(`${p.headings.keywords}\n${p.keywords_intro}\n${keywords.join(', ')}`);

  const out = p.output_lines.map((l) => fill(l, { min: bounds.min, max: bounds.max }));
  sections.push(`${p.headings.output}\n${out.join('\n')}\n${t.schema.trim()}`);

  if (input.retryIssues?.length) {
    const reasons = p.retry_reasons as Record<string, string>;
    const kinds = [...new Set(input.retryIssues.map((i) => (i.kind === 'verse_missing' ? 'verse_out_of_range' : i.kind)))];
    const lines = kinds.flatMap((k) => (reasons[k] ? [`- ${fill(reasons[k], { min: bounds.min, max: bounds.max })}`] : []));
    sections.push(`${p.headings.retry}\n${p.retry_intro}\n${lines.join('\n')}`);
  }

  return { system: t.system.trim(), user: sections.join('\n\n'), version: t.version, excerptIds: excerpts.map((e) => e.id) };
}

/** Bundled text of the passage: excluded from the copy check (DESIGN 7.3). */
export const passageText = (verses: readonly Verse[]): string[] => verses.map((v) => v.text);

/** Canonical reference strings of the input passage. */
export const inputRefStrings = (refs: readonly Reference[]): string[] => refs.map(canonicalRef);
