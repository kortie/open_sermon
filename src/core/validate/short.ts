// Short results (S15, on-device AI): only everyday examples or only light remarks, no draft.
// Same rules as the full check where they apply (DESIGN 7.1–7.3): structure and count, supporting
// verses inside the passage, forbidden expressions / real person, copy check. Light remarks that
// fail their own check are dropped one by one; with none left the result fails (retry, fallback).
import type { Reference } from '../bible';
import type { CopySource } from './copy-check';
import { checkForbidden } from './forbidden';
import { checkCopies, type ValidateResult } from './generation';
import { checkHumor } from './humor';
import { EXPECTED_EXAMPLES, EXPECTED_HUMOR } from './structure';
import type { GenerationOutput, Issue } from './types';
import { checkVerseRefs } from './verseRefs';

export type ShortKind = 'example' | 'one_liner';

export interface ShortValidateInput {
  kind: ShortKind;
  output: unknown;
  inputRefs: readonly Reference[];
  keywords: readonly string[];
  copySources: readonly CopySource[];
  quotedBlocks: readonly string[];
  n?: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const strList = (v: unknown): string[] | null => (Array.isArray(v) && v.every(isStr) ? v : null);

const EMPTY_SERMON: GenerationOutput['sermon'] = { title: '', body: '', verse_refs: [] };
const SCHEMA: ValidateResult = { ok: false, issues: [{ kind: 'schema' }], humorIssues: [], humorDropped: false };

export function validateShort(i: ShortValidateInput): ValidateResult {
  const v = i.output;
  if (i.kind === 'example') {
    if (!isObj(v) || !Array.isArray(v.examples)) return SCHEMA;
    const examples: GenerationOutput['examples'] = [];
    for (const e of v.examples) {
      const refs = isObj(e) ? strList(e.verse_refs) : null;
      if (!isObj(e) || !isStr(e.text) || !e.text.trim() || !refs) return SCHEMA;
      examples.push({ text: e.text, verse_refs: refs });
    }
    const output: GenerationOutput = { sermon: EMPTY_SERMON, examples, humor: [] };
    const issues: Issue[] = [
      ...(examples.length === EXPECTED_EXAMPLES ? [] : [{ kind: 'count', field: 'examples' } as const]),
      ...checkVerseRefs(output, i.inputRefs),
      ...checkForbidden(output),
      ...checkCopies(output, i.copySources, i.quotedBlocks, i.n),
    ];
    return { ok: issues.length === 0, issues, humorIssues: [], humorDropped: false, output };
  }

  if (!isObj(v) || !Array.isArray(v.humor)) return SCHEMA;
  const humor: GenerationOutput['humor'] = [];
  for (const h of v.humor) {
    if (!isObj(h) || !isStr(h.text) || !h.text.trim() || !isStr(h.purpose)) return SCHEMA;
    humor.push({ text: h.text, purpose: h.purpose });
  }
  const all: GenerationOutput = { sermon: EMPTY_SERMON, examples: [], humor };
  const humorIssues = checkHumor(humor, i.keywords);
  const failed = new Set(humorIssues.flatMap((x) => ('index' in x ? [x.index] : [])));
  const kept = humor.filter((_, idx) => !failed.has(idx));
  const output: GenerationOutput = { ...all, humor: kept };
  const issues: Issue[] = [
    ...(humor.length === EXPECTED_HUMOR ? [] : [{ kind: 'count', field: 'humor' } as const]),
    ...checkVerseRefs(output, i.inputRefs),
    ...checkCopies(all, i.copySources, i.quotedBlocks, i.n),
    ...(kept.length === 0 ? humorIssues : []),
  ];
  return { ok: issues.length === 0, issues, humorIssues, humorDropped: kept.length < humor.length, output };
}
