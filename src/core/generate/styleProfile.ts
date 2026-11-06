// Style profile generation (DESIGN 3.9, 4.4; S10; skill sermon-style-profile). The schema,
// filter and staleness live in core/sermon; this module only makes the call:
//   connection? → external_transfer consent? → sermons? → decrypt masked bodies → daily slot →
//   call → parse → schema → no-original filter → (empty or invalid: one retry) → save.
// Nothing is sent without a stored key and the consent; a failed profile is never saved.
import { generation } from '../../../config/app.config.json';
import { getConnection, connectedClient, LlmError, takeDailySlot, type FetchFn, type LlmCause, type LlmClient, type RegistryConfig } from '../llm';
import {
  computeSourceHash,
  filterOriginal,
  isEmptyAnswer,
  limitedStyle,
  listSermons,
  measureSentences,
  readSermonText,
  styleProfileStatus,
  validateModelAnswer,
  type StyleProfile,
} from '../sermon';
import { hasConsent } from '../store/consent';
import { putStyleProfileRecord, STYLE_PROFILE_ID, type StyleProfileRecord } from '../store/styleProfile';
import type { Lang } from '../validate';
import { getOrCreateDeviceKey } from '../vault/crypto-key';
import enPhrases from '../../prompts/en/prompt.json';
import enSystem from '../../prompts/en/style-profile.txt?raw';
import koPhrases from '../../prompts/ko/prompt.json';
import koSystem from '../../prompts/ko/style-profile.txt?raw';
import { promptVersion } from './buildPrompt';
import { parseOutput } from './parseOutput';

const TEMPLATES = { ko: { phrases: koPhrases, system: koSystem }, en: { phrases: enPhrases, system: enSystem } } as const;

const fill = (s: string, values: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));

/** Version stored with the profile: the style template follows the language prompt version. */
export const styleProfileVersion = (lang: Lang): string => `style-${promptVersion(lang)}`;

/** First `budget` characters (code points) of a text. */
const head = (text: string, budget: number): string => {
  const cps = [...text.trim()];
  return cps.length <= budget ? cps.join('') : cps.slice(0, budget).join('');
};

/** System and user messages for the masked manuscripts (each cut to an equal share of the budget). */
export function buildStyleProfilePrompt(texts: readonly string[], lang: Lang, maxChars = generation.style_profile_max_input_chars): { system: string; user: string } {
  const t = TEMPLATES[lang];
  const p = t.phrases.style_profile;
  const budget = Math.max(1, Math.floor(maxChars / Math.max(1, texts.length)));
  const blocks = texts.map((x, i) => `<<<${fill(p.sermon_label, { n: i + 1 })}\n${head(x, budget)}\n>>>`);
  const lines = [p.heading, fill(p.intro, { n: texts.length })];
  if (limitedStyle(texts.length)) lines.push(fill(p.limited, { n: texts.length }));
  return { system: t.system.trim(), user: `${lines.join('\n')}\n${blocks.join('\n')}` };
}

export interface StyleProfileDeps {
  lang: Lang;
  db?: IDBDatabase;
  /** Device key for the sermon bodies (default: this device's key). */
  key?: CryptoKey;
  fetch?: FetchFn;
  cfg?: RegistryConfig;
  /** Test seam: a ready client (the connection and consent checks still run). */
  client?: LlmClient;
  now?: () => Date;
  limit?: number;
  signal?: AbortSignal;
  maxRetries?: number;
}

export type StyleProfileOutcome =
  | { kind: 'saved'; profile: StyleProfile; record: StyleProfileRecord; removed: number; calls: number }
  | { kind: 'blocked'; reason: 'no_connection' | 'no_consent' | 'no_sermons' }
  | { kind: 'failed'; reason: 'validation' | LlmCause; calls: number }
  | { kind: 'cancelled'; calls: number };

export async function createStyleProfile(deps: StyleProfileDeps): Promise<StyleProfileOutcome> {
  const { db, lang } = deps;
  const now = deps.now ?? (() => new Date());
  const conn = await getConnection({ cfg: deps.cfg, db });
  if (!conn) return { kind: 'blocked', reason: 'no_connection' };
  if (!(await hasConsent('external_transfer', conn.provider, db))) return { kind: 'blocked', reason: 'no_consent' };
  const metas = await listSermons(db);
  if (metas.length === 0) return { kind: 'blocked', reason: 'no_sermons' };
  const client = deps.client ?? (await connectedClient({ fetch: deps.fetch, cfg: deps.cfg, db }));
  if (!client) return { kind: 'blocked', reason: 'no_connection' };

  // Masked bodies, decrypted right before the call and kept only in this function.
  const key = deps.key ?? (await getOrCreateDeviceKey(db));
  const ordered = [...metas].sort((a, b) => a.created_at - b.created_at);
  const texts = (await Promise.all(ordered.map((m) => readSermonText(m.id, { db, key })))).filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  if (texts.length === 0) return { kind: 'blocked', reason: 'no_sermons' };
  const sourceHash = await computeSourceHash(metas);
  const prompt = buildStyleProfilePrompt(texts, lang);
  const maxRetries = Math.min(deps.maxRetries ?? generation.max_retries_validation, 1);

  let calls = 0;
  for (let attempt = 0; ; attempt++) {
    let raw: string;
    try {
      await takeDailySlot({ now: now(), limit: deps.limit, db });
      calls++;
      raw = await client.generate(prompt.system, prompt.user, { maxTokens: generation.style_profile_max_output_tokens, signal: deps.signal });
    } catch (err) {
      if (deps.signal?.aborted) return { kind: 'cancelled', calls };
      return { kind: 'failed', reason: err instanceof LlmError ? err.cause : 'unknown', calls };
    }
    if (deps.signal?.aborted) return { kind: 'cancelled', calls };

    const v = validateModelAnswer(parseOutput(raw));
    if (v.ok) {
      const { answer, removed } = filterOriginal(v.answer, texts);
      if (!isEmptyAnswer(answer)) {
        const profile: StyleProfile = { ...measureSentences(texts), ...answer };
        const record: StyleProfileRecord = {
          id: STYLE_PROFILE_ID,
          profile_json: JSON.stringify(profile),
          source_hash: sourceHash,
          prompt_version: styleProfileVersion(lang),
          sermon_count: metas.length,
          created_at: now().getTime(),
        };
        await putStyleProfileRecord(record, db);
        return { kind: 'saved', profile, record, removed, calls };
      }
    }
    if (attempt >= maxRetries) return { kind: 'failed', reason: 'validation', calls };
  }
}

/** Profile summary block for the S09 prompt (no manuscript sentences: only the filtered profile). */
export function styleProfileText(profile: StyleProfile, lang: Lang): string {
  const b = TEMPLATES[lang].phrases.style_block;
  const lines = [
    b.intro,
    fill(b.avg_sentence_len, { n: profile.avg_sentence_len }),
    fill(b.question_ratio, { n: Math.round(profile.question_ratio * 100) }),
    fill(b.illustration_freq, { v: b.freq[profile.illustration_freq] }),
    fill(b.structure, { v: b.structures[profile.structure] }),
    ...profile.tone_summary.map((l) => fill(b.tone, { v: l })),
  ];
  if (profile.frequent_phrases.length) lines.push(fill(b.phrases, { v: profile.frequent_phrases.join(', ') }));
  return lines.join('\n');
}

/** The profile block to send, or null when there is none or it is stale (never a stale one). */
export async function activeStyleProfileText(lang: Lang, db?: IDBDatabase): Promise<string | null> {
  const status = await styleProfileStatus(db);
  return status.state === 'ready' ? styleProfileText(status.profile, lang) : null;
}
