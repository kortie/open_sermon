// Structure check (DESIGN 6.2, 7.1): field types, then examples 2 and humor 2. Unknown fields are
// dropped so nothing unexpected reaches the screen.
import type { GenerationOutput, Issue } from './types';

export const EXPECTED_EXAMPLES = 2;
export const EXPECTED_HUMOR = 2;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const strList = (v: unknown): string[] | null => (Array.isArray(v) && v.every(isStr) ? v : null);

export type StructureResult = { ok: true; output: GenerationOutput } | { ok: false; issues: Issue[]; output?: GenerationOutput };

export function checkStructure(value: unknown): StructureResult {
  const schema: StructureResult = { ok: false, issues: [{ kind: 'schema' }] };
  if (!isObj(value) || !isObj(value.sermon) || !Array.isArray(value.examples) || !Array.isArray(value.humor)) return schema;
  const s = value.sermon;
  const sermonRefs = strList(s.verse_refs);
  if (!isStr(s.title) || !isStr(s.body) || !s.body.trim() || !sermonRefs) return schema;

  const examples: GenerationOutput['examples'] = [];
  for (const e of value.examples) {
    const refs = isObj(e) ? strList(e.verse_refs) : null;
    if (!isObj(e) || !isStr(e.text) || !e.text.trim() || !refs) return schema;
    examples.push({ text: e.text, verse_refs: refs });
  }
  const humor: GenerationOutput['humor'] = [];
  for (const h of value.humor) {
    if (!isObj(h) || !isStr(h.text) || !h.text.trim() || !isStr(h.purpose)) return schema;
    humor.push({ text: h.text, purpose: h.purpose });
  }

  const output: GenerationOutput = { sermon: { title: s.title, body: s.body, verse_refs: sermonRefs }, examples, humor };
  const issues: Issue[] = [];
  if (examples.length !== EXPECTED_EXAMPLES) issues.push({ kind: 'count', field: 'examples' });
  if (humor.length !== EXPECTED_HUMOR) issues.push({ kind: 'count', field: 'humor' });
  return issues.length ? { ok: false, issues, output } : { ok: true, output };
}
