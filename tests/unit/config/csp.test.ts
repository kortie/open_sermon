// S07: CSP connect-src is generated from config, and only verified providers reach it.
// S07 test requirements (4 cases) plus the dist gate's "missing origin" case.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCsp, connectOriginsFromConfig, cspFromConfig } from '../../../scripts/build-csp.mjs';
import { checkConfig } from '../../../scripts/check-config.mjs';
import { checkCsp, parseCsp } from '../../../scripts/check-csp.mjs';

const schema = JSON.parse(readFileSync('config/app.config.schema.json', 'utf8'));
const repoConfig = () => JSON.parse(readFileSync('config/app.config.json', 'utf8'));
const html = (csp: string) => `<html><head><meta http-equiv="Content-Security-Policy" content="${csp}"></head></html>`;

/** Three providers: a and b verified, c not. */
function fixture() {
  const cfg = repoConfig();
  cfg.providers = {
    alpha: { endpoint: 'https://api.alpha.example/v1/generate', model: 'a-1', browser_direct_verified: true, verified_on: '2026-11-05' },
    beta: { endpoint: 'https://beta.example:8443/v2/chat', model: 'b-1', browser_direct_verified: true, verified_on: '2026-11-05' },
    gamma: { endpoint: 'https://api.gamma.example/v1', model: 'c-1', browser_direct_verified: false, unavailable_reason: 'pending_verification' },
  };
  cfg.wizard.providers_order = ['alpha', 'beta', 'gamma'];
  cfg.wizard.beginner_recommendation = 'alpha';
  return cfg;
}
const errorsOf = (cfg: object) => (checkConfig(cfg, { schema }) as { errors: string[] }).errors;

describe('CSP from config (S07)', () => {
  it('two verified + one unverified provider → connect-src has exactly the two verified origins', () => {
    const cfg = fixture();
    expect(errorsOf(cfg)).toEqual([]);
    expect(connectOriginsFromConfig(cfg)).toEqual(['https://api.alpha.example', 'https://beta.example:8443']);
    const connect = (parseCsp(cspFromConfig(cfg)) as Record<string, string[]>)['connect-src'];
    expect(connect).toEqual(["'self'", 'https://api.alpha.example', 'https://beta.example:8443']);
    expect(connect).not.toContain('https://api.gamma.example');
  });

  it('a verified provider whose endpoint is still a placeholder fails, and is kept out of connect-src', () => {
    const cfg = fixture();
    cfg.providers.beta.endpoint = '<공식 엔드포인트>';
    expect(errorsOf(cfg)).toContainEqual(expect.stringContaining('providers.beta is browser_direct_verified but endpoint/model is still a placeholder'));
    expect(connectOriginsFromConfig(cfg)).toEqual(['https://api.alpha.example']);
  });

  it('a verified provider without a verified_on date fails', () => {
    const cfg = fixture();
    delete (cfg.providers.beta as { verified_on?: string }).verified_on;
    expect(errorsOf(cfg)).toContainEqual('providers.beta is browser_direct_verified but has no verified_on (YYYY-MM-DD)');
  });

  it('a non-https endpoint fails and never reaches connect-src', () => {
    const cfg = fixture();
    cfg.providers.alpha.endpoint = 'http://api.alpha.example/v1/generate';
    expect(errorsOf(cfg).length).toBeGreaterThan(0);
    expect(connectOriginsFromConfig(cfg)).toEqual(['https://beta.example:8443']);
  });

  it('the built-file check fails when a verified origin is missing or an extra one is present', () => {
    const verified = ['https://api.alpha.example', 'https://beta.example:8443'];
    expect(checkCsp(html(buildCsp(verified)), verified)).toEqual([]);
    expect(checkCsp(html(buildCsp(['https://api.alpha.example'])), verified)).toContainEqual('connect-src is missing verified provider origin https://beta.example:8443');
    expect(checkCsp(html(buildCsp([...verified, 'https://api.gamma.example'])), verified)).toContainEqual(
      'connect-src contains unverified source https://api.gamma.example',
    );
  });

  it('the repository config: gemini (2026-11-06) and anthropic (2026-11-05) are verified, so connect-src is self + their two origins', () => {
    const cfg = repoConfig();
    expect(errorsOf(cfg)).toEqual([]);
    expect([cfg.providers.gemini.verified_on, cfg.providers.anthropic.verified_on]).toEqual(['2026-11-06', '2026-11-05']);
    expect(connectOriginsFromConfig(cfg)).toEqual(['https://generativelanguage.googleapis.com', 'https://api.anthropic.com']);
  });
});
