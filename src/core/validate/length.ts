// Draft length (DESIGN 3.8, 7.1): Korean counts graphemes including spaces, English counts words
// (i18n.english_length_words). Only the draft body counts; quote markers are not the model's text.
import { generation, i18n } from '../../../config/app.config.json';
import { stripQuotes } from './quotes';
import type { Issue, Lang } from './types';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function countLength(text: string, lang: Lang): number {
  const t = stripQuotes(text).trim();
  if (lang === 'en') return t.match(WORD)?.length ?? 0;
  return [...graphemes.segment(t)].length;
}

export function lengthBounds(lang: Lang): { min: number; max: number; unit: 'chars' | 'words' } {
  return lang === 'en'
    ? { min: i18n.english_length_words.sermon_min, max: i18n.english_length_words.sermon_max, unit: 'words' }
    : { min: generation.sermon_min_chars, max: generation.sermon_max_chars, unit: 'chars' };
}

export function checkLength(body: string, lang: Lang): Issue[] {
  const b = lengthBounds(lang);
  const actual = countLength(body, lang);
  return actual < b.min || actual > b.max ? [{ kind: 'length', actual, ...b }] : [];
}
