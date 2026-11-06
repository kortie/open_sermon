// Persona → prompt block (DESIGN 6.1, skill persona-builder §4.4). Only phrases for the stored codes
// go in, from src/prompts/<lang>/prompt.json. The persona `name` (a user label) never does
// (CLAUDE.md rule 11). Denomination is phrased as a tradition tendency only.
import { i18n } from '../../../config/app.config.json';
import en from '../../prompts/en/prompt.json';
import ko from '../../prompts/ko/prompt.json';
import type { Persona } from './options';

type Lang = 'ko' | 'en';
const PHRASES = { ko: ko.persona, en: en.persona } as const;

type CodeMap = Record<string, string>;
const phrase = (map: CodeMap, code: string): string => {
  const p = map[code];
  if (p === undefined) throw new Error(`persona: no prompt phrase for ${code}`);
  return p;
};

/** Target length shown in the block: characters (ko) or the middle of the English word range. */
export function personaLength(p: Persona, lang: Lang): string {
  if (lang === 'ko') return p.length;
  const { sermon_min, sermon_max } = i18n.english_length_words;
  return String(Math.round((sermon_min + sermon_max) / 2));
}

/** Block lines without the heading. */
export function buildPersonaBlock(p: Persona, lang: Lang): string {
  const ph = PHRASES[lang];
  const values: Record<string, string> = {
    denomination: phrase(ph.denomination, p.denomination),
    emphasis: p.emphasis.map((e) => phrase(ph.emphasis, e)).join(ph.list_separator),
    style: phrase(ph.style, p.style),
    tone: phrase(ph.tone, p.tone),
    audience: phrase(ph.audience, p.audience),
    length: personaLength(p, lang),
  };
  return ph.lines.map((line) => line.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')).join('\n');
}
