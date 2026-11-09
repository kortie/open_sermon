// S08: registry exposes verified providers only (rule 20, DESIGN 3.13 step 4).
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createClient, keyFormatOk, providerCards, providerConfig, providerModels, resolveModel, selectableProviders, type RegistryConfig } from '../../../src/core/llm/registry';
import { LlmError, type FetchFn } from '../../../src/core/llm/types';

const repo = JSON.parse(readFileSync('config/app.config.json', 'utf8')) as RegistryConfig;

function fixture(): RegistryConfig {
  const cfg = structuredClone(repo);
  // anthropic and gemini unverified, plus a verified provider without an adapter (other).
  cfg.providers.anthropic = { ...cfg.providers.anthropic!, browser_direct_verified: false, unavailable_reason: 'pending_verification' };
  cfg.providers.gemini = { ...cfg.providers.gemini!, browser_direct_verified: false, unavailable_reason: 'pending_verification' };
  cfg.providers.other = { endpoint: 'https://other.test/v1', model: 'o-1', browser_direct_verified: true };
  cfg.wizard.providers_order = [...cfg.wizard.providers_order, 'other'];
  cfg.wizard.beginner_recommendation = 'anthropic';
  return cfg;
}

describe('registry', () => {
  it('repository config (browser build): gemini (recommended) and anthropic are selectable; openai is an "app only" card', () => {
    expect(selectableProviders(repo)).toEqual(['gemini', 'anthropic']);
    expect(providerCards(repo)).toEqual([
      { id: 'gemini', selectable: true, reason: undefined, recommended: true, keyPrefix: 'AQ.' },
      { id: 'openai', selectable: false, reason: 'app_only', recommended: false, keyPrefix: 'sk-' },
      { id: 'anthropic', selectable: true, reason: undefined, recommended: false, keyPrefix: 'sk-ant-' },
    ]);
    expect(providerConfig('openai', repo)).toBeNull();
    expect(providerModels('anthropic', repo)).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']);
    expect(providerModels('gemini', repo)).toEqual(['gemini-flash-latest', 'gemini-flash-lite-latest']);
  });

  it('never returns an unverified provider, even when it is the beginner recommendation', () => {
    const cfg = fixture();
    expect(selectableProviders(cfg)).toEqual([]); // "other" verified but has no adapter; openai needs the app
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

  it('gemini accepts the new AQ. keys and the older AIza keys', () => {
    expect(keyFormatOk('gemini', 'AQ.Ab8RN6Kexample', repo)).toBe(true);
    expect(keyFormatOk('gemini', ' AIzaSyExample ', repo)).toBe(true);
    expect(keyFormatOk('gemini', 'AQ.', repo)).toBe(false);
    expect(keyFormatOk('gemini', 'sk-ant-api03-abc', repo)).toBe(false);
    const none = structuredClone(repo);
    delete none.wizard.key_format_hints.gemini;
    expect(keyFormatOk('gemini', 'anything', none)).toBe(true);
    expect(keyFormatOk('gemini', '  ', none)).toBe(false);
  });
});

describe('model labels', () => {
  it('every configured model has a name and a description in both languages (dots become _)', async () => {
    const { modelI18nId } = await import('../../../src/core/llm/registry');
    const ko = JSON.parse(readFileSync('src/i18n/ko.json', 'utf8')) as { llm: Record<string, Record<string, string>> };
    const en = JSON.parse(readFileSync('src/i18n/en.json', 'utf8')) as { llm: Record<string, Record<string, string>> };
    expect(modelI18nId('gpt-6.1-terra')).toBe('gpt-6_1-terra');
    for (const p of Object.values(repo.providers)) {
      for (const m of p.models ?? []) {
        for (const dict of [ko, en]) {
          expect(dict.llm.model_name![modelI18nId(m)], m).toBeTruthy();
          expect(dict.llm.model_desc![modelI18nId(m)], m).toBeTruthy();
        }
      }
    }
  });
});
