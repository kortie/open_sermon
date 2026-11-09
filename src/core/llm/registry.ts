// Providers the app may use (DESIGN 3.13 step 4, rule 20). Selectable: browser_direct_verified
// providers with an adapter, and app_direct_verified ones (OpenAI) while the app's native HTTP is
// set (user decision 2026-11-09); those always use that native HTTP. Unverified ones are listed for
// disabled cards only and can never produce a client.
import { generation, providers, wizard } from '../../../config/app.config.json';
import { createAnthropicClient } from './providers/anthropic';
import { createGeminiClient } from './providers/gemini';
import { createOpenAiClient } from './providers/openai';
import { LlmError, type FetchFn, type LlmClient, type ProviderConfig } from './types';

export interface RegistryConfig {
  providers: Record<string, ProviderConfig>;
  wizard: { providers_order: string[]; beginner_recommendation?: string; key_format_hints: Record<string, string | string[]> };
  generation: { timeout_seconds: number };
}

const APP_CONFIG = { providers, wizard, generation } as unknown as RegistryConfig;

const ADAPTERS: Record<string, (p: Parameters<typeof createAnthropicClient>[0]) => LlmClient> = {
  anthropic: createAnthropicClient,
  gemini: createGeminiClient,
  openai: createOpenAiClient,
};

/** Native HTTP of the app (src/app/platform.ts); null in the browser build. */
let nativeHttp: FetchFn | null = null;

export function setNativeHttp(fn: FetchFn | null): void {
  nativeHttp = fn;
}

/** Callable only through the app's native HTTP (not in the browser). */
function appOnly(id: string, cfg: RegistryConfig): boolean {
  const p = cfg.providers[id];
  return p?.browser_direct_verified !== true && p?.app_direct_verified === true;
}

export interface ProviderCard {
  id: string;
  selectable: boolean;
  /** Present on disabled cards only. */
  reason?: 'pending_verification' | 'no_browser_access' | 'app_only';
  recommended: boolean;
  /** Key prefix shown in hints (the first of wizard.key_format_hints), may be ''. */
  keyPrefix: string;
}

/** Every accepted key prefix; a list in config accepts any of them (Gemini: AQ. and older AIza). */
export function keyPrefixes(id: string, cfg: RegistryConfig = APP_CONFIG): string[] {
  const hint = cfg.wizard.key_format_hints[id] ?? '';
  return (Array.isArray(hint) ? hint : [hint]).filter(Boolean);
}

function isSelectable(id: string, cfg: RegistryConfig): boolean {
  if (!(id in ADAPTERS)) return false;
  if (cfg.providers[id]?.browser_direct_verified === true) return true;
  return appOnly(id, cfg) && nativeHttp !== null;
}

/** Ids the user can pick, in wizard order. */
export function selectableProviders(cfg: RegistryConfig = APP_CONFIG): string[] {
  return cfg.wizard.providers_order.filter((id) => isSelectable(id, cfg));
}

/** Cards for step 4: selectable providers plus disabled cards with their reason. */
export function providerCards(cfg: RegistryConfig = APP_CONFIG): ProviderCard[] {
  return cfg.wizard.providers_order
    .filter((id) => id in cfg.providers)
    .map((id) => {
      const selectable = isSelectable(id, cfg);
      return {
        id,
        selectable,
        reason: selectable ? undefined : appOnly(id, cfg) && id in ADAPTERS ? 'app_only' : (cfg.providers[id]?.unavailable_reason ?? 'pending_verification'),
        recommended: selectable && cfg.wizard.beginner_recommendation === id,
        keyPrefix: keyPrefixes(id, cfg)[0] ?? '',
      };
    });
}

/** Selectable provider's config, or null. */
export function providerConfig(id: string, cfg: RegistryConfig = APP_CONFIG): ProviderConfig | null {
  return isSelectable(id, cfg) ? (cfg.providers[id] ?? null) : null;
}

/** Models the user can choose for a provider (config `models`, else the single `model`). */
export function providerModels(id: string, cfg: RegistryConfig = APP_CONFIG): string[] {
  const p = providerConfig(id, cfg);
  if (!p) return [];
  return p.models?.length ? p.models : [p.model];
}

/** i18n id of a model (llm.model_name.<id>, llm.model_desc.<id>): dots would split the key path. */
export function modelI18nId(model: string): string {
  return model.replace(/\./g, '_');
}

/** A stored model choice if still offered, else the provider default. */
export function resolveModel(id: string, stored: string, cfg: RegistryConfig = APP_CONFIG): string {
  const models = providerModels(id, cfg);
  if (models.includes(stored)) return stored;
  return providerConfig(id, cfg)?.model ?? '';
}

/** Reference-only format check: the key starts with one of the configured prefixes (none → any non-empty key). */
export function keyFormatOk(id: string, key: string, cfg: RegistryConfig = APP_CONFIG): boolean {
  const k = key.trim();
  const prefixes = keyPrefixes(id, cfg);
  return prefixes.length === 0 ? k.length > 0 : prefixes.some((p) => k.startsWith(p) && k.length > p.length);
}

/** A client for a selectable provider. Unverified providers throw before anything is sent. */
export function createClient(id: string, key: string, model: string, opts: { fetch?: FetchFn; cfg?: RegistryConfig } = {}): LlmClient {
  const cfg = opts.cfg ?? APP_CONFIG;
  const config = providerConfig(id, cfg);
  const make = ADAPTERS[id];
  if (!config || !make) throw new LlmError('unknown');
  // An app-only provider never goes through the WebView fetch (its servers refuse browser CORS).
  const fetchFn = appOnly(id, cfg) ? (opts.fetch ?? nativeHttp ?? undefined) : opts.fetch;
  if (appOnly(id, cfg) && !fetchFn) throw new LlmError('unknown');
  return make({ key: key.trim(), model: resolveModel(id, model, cfg), config, timeoutMs: cfg.generation.timeout_seconds * 1000, fetch: fetchFn });
}
