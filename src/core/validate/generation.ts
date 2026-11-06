// Full check of one generation (DESIGN 7.0–7.3, skill generation-validator §4.2). Order: structure →
// verse_refs → length → forbidden / real person → copy → light remarks. Blocking issues mean "retry
// once, then fall back"; light remark issues only drop the light remark section.
import type { Reference } from '../bible';
import { buildCopyIndexExcluding, COPY_NGRAM, findCopies, type CopySource } from './copy-check';
import { checkForbidden } from './forbidden';
import { checkHumor } from './humor';
import { checkLength } from './length';
import { stripQuotes } from './quotes';
import { checkStructure } from './structure';
import type { GenerationOutput, Issue, Lang } from './types';
import { checkVerseRefs } from './verseRefs';

export interface ValidateInput {
  /** Parsed JSON (undefined when the reply was not JSON). */
  output: unknown;
  inputRefs: readonly Reference[];
  lang: Lang;
  /** Reference excerpts and imported bible text (S11). */
  copySources: readonly CopySource[];
  /** Bundled bible text of the passage: never counted as copying. */
  quotedBlocks: readonly string[];
  n?: number;
}

export interface ValidateResult {
  ok: boolean;
  /** Blocking issues (retry reasons). */
  issues: Issue[];
  /** Light remark issues (never blocking). */
  humorIssues: Issue[];
  humorDropped: boolean;
  /** The checked output; light remarks emptied when dropped. Present when the structure parsed. */
  output?: GenerationOutput;
}

/** Copy matches in the model's own text (quote markers removed). One issue per source. */
export function checkCopies(o: GenerationOutput, sources: readonly CopySource[], quotedBlocks: readonly string[], n = COPY_NGRAM): Issue[] {
  if (sources.length === 0) return [];
  const index = buildCopyIndexExcluding(sources, quotedBlocks, n);
  const targets = [o.sermon.title, o.sermon.body, ...o.examples.map((e) => e.text), ...o.humor.flatMap((h) => [h.text, h.purpose])];
  const ids = new Set(targets.flatMap((t) => findCopies(stripQuotes(t), index, n).map((m) => m.sourceId)));
  return [...ids].map((sourceId) => ({ kind: 'copy', sourceId }));
}

export function validateGeneration(i: ValidateInput): ValidateResult {
  const structure = checkStructure(i.output);
  if (!structure.ok && !structure.output) return { ok: false, issues: structure.issues, humorIssues: [], humorDropped: false };
  const o = structure.output!;
  const issues: Issue[] = [
    ...(structure.ok ? [] : structure.issues),
    ...checkVerseRefs(o, i.inputRefs),
    ...checkLength(o.sermon.body, i.lang),
    ...checkForbidden(o),
    ...checkCopies(o, i.copySources, i.quotedBlocks, i.n),
  ];
  const humorIssues = checkHumor(o.humor);
  const humorDropped = humorIssues.length > 0;
  return { ok: issues.length === 0, issues, humorIssues, humorDropped, output: humorDropped ? { ...o, humor: [] } : o };
}
