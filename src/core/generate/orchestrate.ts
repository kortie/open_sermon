// One generation request (DESIGN 3.7, 7.0–7.3, skill generation-validator §4.4):
//   cache? → daily slot → call → parse → validate → ok: show
//                                             └ fail: (copy → drop matched excerpts) daily slot → call → validate → ok: show | fallback
// At most one retry whatever the reasons (generation.max_retries_validation); every call, the retry
// included, takes a daily slot first. Call failures (auth, quota, timeout, network, daily limit)
// and a second validation failure never show a model result: they return the independent result
// (outline + library hits). A failed result is never cached.
import { generation } from '../../../config/app.config.json';
import { canonicalRef } from '../bible';
import { createOutline, type ExcerptInput, type LibraryHit, type Outline } from '../compose';
import { listLibraryItems, searchLibrary, type LibraryKind } from '../compose/library';
import { LlmError, takeDailySlot, type LlmCause, type LlmClient } from '../llm';
import { validateGeneration, type CopySource, type GenerationOutput, type Issue } from '../validate';
import { buildPrompt, passageText, type PromptInput } from './buildPrompt';
import { cacheKey, getCached, putCached, type CacheMeta } from './cache';
import { parseOutput } from './parseOutput';

export interface GenerateExcerpt extends ExcerptInput {
  /** Same as chunkId: the copy-check source id. */
  id?: string;
}

export interface GenerateRequest extends Omit<PromptInput, 'excerpts' | 'retryIssues'> {
  excerpts: readonly GenerateExcerpt[];
  /** Extra copy-check sources: imported bible text (S11). */
  extraCopySources?: readonly CopySource[];
  /** Library kind shown first in the independent result. */
  libraryKind?: LibraryKind;
}

export interface GenerateDeps {
  client: LlmClient;
  provider: string;
  model: string;
  db?: IDBDatabase;
  now?: () => Date;
  limit?: number;
  signal?: AbortSignal;
  /** Default true. */
  useCache?: boolean;
  maxRetries?: number;
}

export interface IndependentResult {
  outline: Outline;
  library: LibraryHit[];
}

export type FallbackReason = 'validation' | LlmCause;

export type GenerateOutcome =
  | { kind: 'result'; output: GenerationOutput; humorDropped: boolean; fromCache: boolean; calls: number; meta: CacheMeta }
  | { kind: 'fallback'; reason: FallbackReason; calls: number; issues: Issue[]; independent: IndependentResult }
  | { kind: 'cancelled'; calls: number };

/** Outline (bundled quote + excerpt quotes, empty user blocks) and library hits for the passage. */
export async function independentResult(req: GenerateRequest, db?: IDBDatabase): Promise<IndependentResult> {
  const ref = req.refs[0];
  const outline = createOutline({
    ref: ref ? canonicalRef(ref) : '',
    bibleId: req.bibleId,
    verses: req.verses.map((v) => ({ verse: v.verse, text: v.text })),
    excerpts: req.excerpts,
  });
  let library: LibraryHit[] = [];
  try {
    const hits = searchLibrary(await listLibraryItems(db), { ref });
    const first = req.libraryKind;
    library = first ? [...hits.filter((h) => h.item.kind === first), ...hits.filter((h) => h.item.kind !== first)] : hits;
  } catch {
    // storage unavailable: the outline alone is still a result
  }
  return { outline, library };
}

const excerptId = (e: GenerateExcerpt) => e.id ?? e.chunkId;

export async function generate(req: GenerateRequest, deps: GenerateDeps): Promise<GenerateOutcome> {
  const now = deps.now ?? (() => new Date());
  const maxRetries = Math.min(deps.maxRetries ?? generation.max_retries_validation, 1);
  let calls = 0;
  const fallback = async (reason: FallbackReason, issues: Issue[] = []): Promise<GenerateOutcome> => ({
    kind: 'fallback',
    reason,
    calls,
    issues,
    independent: await independentResult(req, deps.db),
  });

  let excerpts = [...req.excerpts];
  const promptFor = (retryIssues?: Issue[]) => buildPrompt({ ...req, excerpts: excerpts.map((e) => ({ id: excerptId(e), text: e.text })), retryIssues });

  let first: ReturnType<typeof promptFor>;
  try {
    first = promptFor();
  } catch {
    // Excluded or unknown bible, or no verses: nothing may be sent (CLAUDE.md rule 17).
    return fallback('unknown');
  }
  const key = await cacheKey({ version: first.version, provider: deps.provider, model: deps.model, system: first.system, user: first.user });
  if (deps.useCache !== false) {
    const hit = await getCached(key, deps.db);
    if (hit) return { kind: 'result', output: hit.output, humorDropped: hit.humorDropped, fromCache: true, calls, meta: hit.meta };
  }

  let prompt = first;
  for (let attempt = 0; ; attempt++) {
    let raw: string;
    try {
      await takeDailySlot({ now: now(), limit: deps.limit, db: deps.db });
      calls++;
      raw = await deps.client.generate(prompt.system, prompt.user, { maxTokens: generation.max_output_tokens, signal: deps.signal });
    } catch (err) {
      if (deps.signal?.aborted) return { kind: 'cancelled', calls };
      return fallback(err instanceof LlmError ? err.cause : 'unknown');
    }
    if (deps.signal?.aborted) return { kind: 'cancelled', calls };

    const sent = new Set(prompt.excerptIds);
    const v = validateGeneration({
      output: parseOutput(raw),
      inputRefs: req.refs,
      lang: req.lang,
      copySources: [...excerpts.filter((e) => sent.has(excerptId(e))).map((e) => ({ id: excerptId(e), text: e.text })), ...(req.extraCopySources ?? [])],
      quotedBlocks: passageText(req.verses),
    });
    if (v.ok && v.output) {
      const meta: CacheMeta = { prompt_version: prompt.version, provider: deps.provider, model: deps.model, created_at: now().getTime() };
      try {
        await putCached(key, { output: v.output, humorDropped: v.humorDropped }, meta, deps.db);
      } catch {
        // cache is optional
      }
      return { kind: 'result', output: v.output, humorDropped: v.humorDropped, fromCache: false, calls, meta };
    }
    if (attempt >= maxRetries) return fallback('validation', v.issues);

    // Retry without the excerpts the reply copied from (DESIGN 7.3).
    const copied = new Set(v.issues.flatMap((i) => (i.kind === 'copy' ? [i.sourceId] : [])));
    excerpts = excerpts.filter((e) => !copied.has(excerptId(e)));
    prompt = promptFor(v.issues);
  }
}
