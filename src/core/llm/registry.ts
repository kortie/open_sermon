// Providers the app may use (DESIGN 3.13 step 4, rule 20). Only browser_direct_verified providers
// with an adapter are selectable; unverified ones are listed for disabled cards only and can never
// produce a client.
import { generation, providers, wizard } from '../../../config/app.config.json';
import { createAnthropicClient } from './providers/anthropic';
import { createGeminiClient } from './providers/gemini';
import { LlmError, type FetchFn, type LlmClient, type ProviderConfig } from './types';

export interface RegistryConfig {
  providers: Record<string, ProviderConfig>;
  wizard: { providers_order: string[]; beginner_recommendation?: string; key_format_hints: Record<string, string> };
  generation: { timeout_seconds: number };
}

const APP_CONFIG = { providers, wizard, generation } as unknown as RegistryConfig;

const ADAPTERS: Record<string, (p: Parameters<typeof createAnthropicClient>[0]) => LlmClient> = {
  anthropic: createAnthropicClient,
  gemini: createGeminiClient,
};

export interface ProviderCard {
  id: string;
  selectable: boolean;
  /** Present on disabled cards only. */
  reason?: 'pending_verification' | 'no_browser_access';
  recommended: boolean;
  /** Key prefix hint (wizard.key_format_hints), may be ''. */
  keyPrefix: string;
}

function isSelectable(id: string, cfg: RegistryConfig): boolean {
  return cfg.providers[id]?.browser_direct_verified === true && id in ADAPTERS;
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
        reason: selectable ? undefined : (cfg.providers[id]?.unavailable_reason ?? 'pending_verification'),
        recommended: selectable && cfg.wizard.beginner_recommendation === id,
        keyPrefix: cfg.wizard.key_format_hints[id] ?? '',
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

/** A stored model choice if still offered, else the provider default. */
export function resolveModel(id: string, stored: string, cfg: RegistryConfig = APP_CONFIG): string {
  const models = providerModels(id, cfg);
  if (models.includes(stored)) return stored;
  return providerConfig(id, cfg)?.model ?? '';
}

/** Reference-only format check: the key starts with the configured prefix (no prefix → passes). */
export function keyFormatOk(id: string, key: string, cfg: RegistryConfig = APP_CONFIG): boolean {
  const prefix = cfg.wizard.key_format_hints[id] ?? '';
  return key.trim().startsWith(prefix) && key.trim().length > prefix.length;
}

/** A client for a selectable provider. Unverified providers throw before anything is sent. */
export function createClient(id: string, key: string, model: string, opts: { fetch?: FetchFn; cfg?: RegistryConfig } = {}): LlmClient {
  const cfg = opts.cfg ?? APP_CONFIG;
  const config = providerConfig(id, cfg);
  const make = ADAPTERS[id];
  if (!config || !make) throw new LlmError('unknown');
  return make({ key: key.trim(), model: resolveModel(id, model, cfg), config, timeoutMs: cfg.generation.timeout_seconds * 1000, fetch: opts.fetch });
}
