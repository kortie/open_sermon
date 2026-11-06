// S08: registry exposes verified providers only (rule 20, DESIGN 3.13 step 4).
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createClient, keyFormatOk, providerCards, providerConfig, providerModels, resolveModel, selectableProviders, type RegistryConfig } from '../../../src/core/llm/registry';
import { LlmError, type FetchFn } from '../../../src/core/llm/types';

const repo = JSON.parse(readFileSync('config/app.config.json', 'utf8')) as RegistryConfig;

function fixture(): RegistryConfig {
  const cfg = structuredClone(repo);
  // anthropic and gemini unverified, plus a verified provider without an adapter (openai).
  cfg.providers.anthropic = { ...cfg.providers.anthropic!, browser_direct_verified: false, unavailable_reason: 'pending_verification' };
  cfg.providers.gemini = { ...cfg.providers.gemini!, browser_direct_verified: false, unavailable_reason: 'pending_verification' };
  cfg.providers.openai = { ...cfg.providers.openai!, model: 'o-1', browser_direct_verified: true };
  cfg.wizard.beginner_recommendation = 'anthropic';
  return cfg;
}

describe('registry', () => {
  it('repository config: gemini (recommended) and anthropic are selectable; openai is a disabled card with its reason', () => {
    expect(selectableProviders(repo)).toEqual(['gemini', 'anthropic']);
    expect(providerCards(repo)).toEqual([
      { id: 'gemini', selectable: true, reason: undefined, recommended: true, keyPrefix: 'AIza' },
      { id: 'openai', selectable: false, reason: 'no_browser_access', recommended: false, keyPrefix: 'sk-' },
      { id: 'anthropic', selectable: true, reason: undefined, recommended: false, keyPrefix: 'sk-ant-' },
    ]);
    expect(providerConfig('openai', repo)).toBeNull();
    expect(providerModels('anthropic', repo)).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']);
    expect(providerModels('gemini', repo)).toEqual(['gemini-flash-latest', 'gemini-flash-lite-latest']);
  });

  it('never returns an unverified provider, even when it is the beginner recommendation', () => {
    const cfg = fixture();
    expect(selectableProviders(cfg)).toEqual([]); // openai verified but has no adapter
    const anth = providerCards(cfg).find((c) => c.id === 'anthropic')!;
    expect(anth).toMatchObject({ selectable: false, recommended: false, reason: 'pending_verification' });
    expect(providerModels('anthropic', cfg)).toEqual([]);
    expect(resolveModel('anthropic', 'claude-haiku-5-5', cfg)).toBe('');
  });

  it('createClient refuses unverified providers before any request', () => {
    const fetchFn = vi.fn<FetchFn>();
    expect(() => createClient('anthropic', 'sk-ant-x', 'claude-haiku-5-5', { fetch: fetchFn, cfg: fixture() })).toThrow(LlmError);
    expect(() => createClient('openai', 'sk-x', 'm', { fetch: fetchFn })).toThrow(LlmError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('a provider missing api headers in config fails closed (no request)', async () => {
    const cfg = structuredClone(repo);
    delete cfg.providers.anthropic!.api_version;
    const fetchFn = vi.fn<FetchFn>();
    await expect(createClient('anthropic', 'sk-ant-x', '', { fetch: fetchFn, cfg }).validateKey()).rejects.toMatchObject({ cause: 'unknown' });
    const cfg2 = structuredClone(repo);
    cfg2.providers.anthropic!.auth_header = 'x';
    await expect(createClient('anthropic', 'sk-ant-x', '', { fetch: fetchFn, cfg: cfg2 }).validateKey()).rejects.toMatchObject({ cause: 'unknown' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('model: stored choice if offered, else the config default; single-model providers', () => {
    expect(resolveModel('anthropic', 'claude-sonnet-5-5', repo)).toBe('claude-sonnet-5-5');
    expect(resolveModel('anthropic', '', repo)).toBe('claude-haiku-5-5');
    const cfg = structuredClone(repo);
    delete cfg.providers.anthropic!.models;
    expect(providerModels('anthropic', cfg)).toEqual(['claude-haiku-5-5']);
  });

  it('key format hint is a prefix check (trimmed, prefix alone is not a key)', () => {
    expect(keyFormatOk('anthropic', '  sk-ant-api03-abc ', repo)).toBe(true);
    expect(keyFormatOk('anthropic', 'sk-ant-', repo)).toBe(false);
    expect(keyFormatOk('anthropic', 'AIzaSy123', repo)).toBe(false);
    expect(keyFormatOk('anthropic', '', repo)).toBe(false);
  });
});
