// Fixture loader for model replies (S09). The JSON files are what a model would answer.
import { readFileSync } from 'node:fs';
import { parseReference, type Reference, type Verse } from '../../../src/core/bible';

const DIR = 'tests/fixtures/llm-responses';

export function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`${DIR}/${name}.json`, 'utf8')) as Record<string, unknown>;
}
export const reply = (name: string) => JSON.stringify(fixture(name));
export const SOURCES = fixture('sources') as { excerpt: string; kjv_5: string };

export function ref(text: string): Reference {
  const p = parseReference(text);
  if (!p.ok) throw new Error(`bad ref ${text}`);
  return p.ref;
}

/** John 15:1-5 lines for tests. KJV verse 5 is real (public domain); the rest are placeholders. */
export const VERSES: Verse[] = [1, 2, 3, 4, 5].map((verse) => ({
  book: 43 as Verse['book'],
  chapter: 15,
  verse,
  text: verse === 5 ? SOURCES.kjv_5 : `placeholder verse text number ${verse} for tests`,
}));
export const KEYWORDS_KO = ['포도나무', '열매', '거하라'];
export const KEYWORDS_EN = ['vine', 'fruit', 'abide'];
