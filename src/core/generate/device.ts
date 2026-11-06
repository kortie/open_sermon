// One section with on-device AI (DESIGN 3.6.1, S15): the kinds in config on_device_ai.kinds — the
// Reflection Draft, everyday examples or light remarks, each asked for on its own so the small model
// answers one thing at a time. Differences from the full request (orchestrate.ts):
//  - short prompt (src/prompts/<lang>/device.json): passage + keywords + task; the draft also gets
//    the persona block. No style profile or sermon excerpts (nothing from the manuscripts goes in);
//  - no daily slot: nothing is sent and nothing is billed (the OS applies its own per-app quota);
//  - no cache: each answer comes from the device again;
//  - the passage is capped (on_device_ai.max_passage_chars) to fit the small context window.
// Validation, the single retry and the fallback to the independent result are the same.
import { generation, on_device_ai } from '../../../config/app.config.json';
import { DEVICE_PROVIDER, LlmError, type LlmClient } from '../llm';
import { buildPersonaBlock, defaultPersona, type Persona } from '../persona';
import { lengthBounds, validateShort, type Issue, type Lang, type ShortKind } from '../validate';
import enDevice from '../../prompts/en/device.json';
import koDevice from '../../prompts/ko/device.json';
import { canonicalRef } from '../bible';
import { passageText, PROMPT_BIBLES, verseLine, MAX_KEYWORDS } from './buildPrompt';
import type { CacheMeta } from './cache';
import { independentResult, type FallbackReason, type GenerateOutcome, type GenerateRequest } from './orchestrate';
import { parseOutput } from './parseOutput';

const TEMPLATES = { ko: koDevice, en: enDevice } as const;

export const devicePromptVersion = (lang: Lang): string => TEMPLATES[lang].version;

export interface DevicePrompt {
  system: string;
  user: string;
  version: string;
}

export class DevicePromptError extends Error {
  constructor(readonly code: 'excluded_bible' | 'no_verses' | 'too_long') {
    super(`device prompt: ${code}`);
    this.name = 'DevicePromptError';
  }
}

const fill = (s: string, values: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));

/** Output token budget: the draft is long, the others are a few sentences. */
export const deviceMaxTokens = (kind: ShortKind): number => (kind === 'sermon' ? on_device_ai.draft_max_output_tokens : on_device_ai.max_output_tokens);

/**
 * `retry`: the previous answer failed. `tooLong`: its draft body was this long (chars or words), so
 * the rewrite note says how long it was instead of the generic note — the small model writes the
 * same answer to the same prompt, and it cannot count characters.
 */
export function buildDevicePrompt(
  input: Pick<GenerateRequest, 'lang' | 'bibleId' | 'verses' | 'keywords'> & { kind: ShortKind; persona?: Persona | null; retry?: boolean; tooLong?: number },
): DevicePrompt {
  if (!PROMPT_BIBLES.includes(input.bibleId)) throw new DevicePromptError('excluded_bible');
  const [first] = input.verses;
  if (!first) throw new DevicePromptError('no_verses');
  const p = TEMPLATES[input.lang];
  const passage = input.verses.map(verseLine).join('\n');
  if (passage.length > on_device_ai.max_passage_chars[input.lang]) throw new DevicePromptError('too_long');
  const keywords = [...new Set(input.keywords.map((k) => k.trim()).filter(Boolean))].slice(0, MAX_KEYWORDS);
  const bounds = lengthBounds(input.lang);
  // The example reference is the passage's own first verse: a fixed example (JHN 15:5) was copied
  // into verse_refs and failed the range check.
  const ref = canonicalRef({ book: first.book, chapter: first.chapter, ranges: [{ start: first.verse, end: first.verse }] });
  const values = { min: bounds.min, max: bounds.max, ref };
  const sections = [
    ...(input.kind === 'sermon' ? [`${p.headings.persona}\n${buildPersonaBlock(input.persona ?? defaultPersona('default', ''), input.lang)}`] : []),
    `${p.headings.passage}\n${passage}`,
    // The light remark starts from the passage alone (user decision 2026-11-06).
    ...(input.kind === 'one_liner' ? [] : [`${p.headings.keywords}\n${keywords.join(', ')}`]),
    `${p.headings.task}\n${fill(p.tasks[input.kind], values)}`,
    `${p.headings.output}\n${p.schemas[input.kind]}`,
  ];
  if (input.retry) sections.push(`${p.headings.retry}\n${input.tooLong ? fill(p.retry_length, { ...values, actual: input.tooLong }) : p.retry}`);
  return { system: fill(p.system, values), user: sections.join('\n\n'), version: p.version };
}

export interface DeviceGenerateDeps {
  client: LlmClient;
  model: string;
  db?: IDBDatabase;
  now?: () => Date;
  signal?: AbortSignal;
}

export async function generateOnDevice(req: GenerateRequest & { kind: ShortKind }, deps: DeviceGenerateDeps): Promise<GenerateOutcome> {
  const now = deps.now ?? (() => new Date());
  let calls = 0;
  const fallback = async (reason: FallbackReason, issues: Issue[] = []): Promise<GenerateOutcome> => ({
    kind: 'fallback',
    reason,
    calls,
    issues,
    independent: await independentResult(req, deps.db),
  });
  const maxRetries = Math.min(generation.max_retries_validation, 1);
  if (!on_device_ai.kinds.includes(req.kind)) return fallback('unknown');

  const promptFor = (retry: boolean, tooLong?: number) => buildDevicePrompt({ ...req, retry, tooLong });
  let prompt: DevicePrompt;
  try {
    prompt = promptFor(false);
  } catch (err) {
    return fallback(err instanceof DevicePromptError && err.code === 'too_long' ? 'device_too_long' : 'unknown');
  }

  for (let attempt = 0; ; attempt++) {
    let raw: string;
    try {
      calls++;
      raw = await deps.client.generate(prompt.system, prompt.user, { maxTokens: deviceMaxTokens(req.kind), signal: deps.signal });
    } catch (err) {
      if (deps.signal?.aborted) return { kind: 'cancelled', calls };
      return fallback(err instanceof LlmError ? err.cause : 'unknown');
    }
    if (deps.signal?.aborted) return { kind: 'cancelled', calls };
    const v = validateShort({
      kind: req.kind,
      lang: req.lang,
      output: parseOutput(raw),
      inputRefs: req.refs,
      copySources: req.extraCopySources ?? [],
      quotedBlocks: passageText(req.verses),
    });
    if (v.ok && v.output) {
      const meta: CacheMeta = { prompt_version: prompt.version, provider: DEVICE_PROVIDER, model: deps.model, created_at: now().getTime() };
      return { kind: 'result', output: v.output, humorDropped: v.humorDropped, fromCache: false, calls, meta };
    }
    if (attempt >= maxRetries) return fallback('validation', v.issues);
    const long = v.issues.find((x) => x.kind === 'length' && x.actual > x.max);
    prompt = promptFor(true, long?.kind === 'length' ? long.actual : undefined);
  }
}
