import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkBibleSources, checkConfig, verifiedProviderOrigins } from '../../../scripts/check-config.mjs';

const schema = JSON.parse(readFileSync('config/app.config.schema.json', 'utf8'));
const base = () => JSON.parse(readFileSync('config/app.config.json', 'utf8'));
const run = (cfg: object, opts: Record<string, unknown> = {}) =>
  checkConfig(cfg, { schema, ...opts }) as { errors: string[]; warnings: string[] };

describe('check-config', () => {
  it('passes the repository config with no warnings', () => {
    const { errors, warnings } = run(base());
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('backup.pbkdf2_iterations must equal the confirmed S06 value', () => {
    const cfg = base();
    expect(cfg.backup.pbkdf2_iterations).toBe(600000);
    cfg.backup.pbkdf2_iterations = 310000;
    expect(run(cfg).errors).toContainEqual(expect.stringContaining('expected the confirmed 600000'));
  });

  it('fails when an available bible is not built into the derived DB, or an excluded one is', () => {
    const cfg = base();
    cfg.i18n.available_bibles.en.push('web');
    cfg.bible_db.sources.push('niv');
    const { errors } = run(cfg);
    expect(errors).toContainEqual('i18n.available_bibles.en "web" is not in bible_db.sources');
    expect(errors).toContainEqual('bible_db.sources contains excluded bible "niv"');
  });

  it('fails schema when the release hash is missing or not hex', () => {
    const cfg = base();
    cfg.bible_db.release_sha256 = '<해시>';
    expect(run(cfg).errors.some((e) => e.includes('release_sha256'))).toBe(true);
  });

  it('fails when an excluded bible (niv) is available', () => {
    const cfg = base();
    cfg.i18n.available_bibles.en.push('niv');
    expect(run(cfg).errors).toContainEqual(expect.stringContaining('excluded bible "niv"'));
  });

  it('fails when a verified provider still has placeholders', () => {
    const cfg = base();
    cfg.providers.gemini = { endpoint: '<엔드포인트>', model: '<모델>', browser_direct_verified: true };
    const { errors } = run(cfg);
    expect(errors).toContainEqual(expect.stringContaining('providers.gemini is browser_direct_verified but endpoint/model'));
    expect(errors).toContainEqual('providers.gemini is browser_direct_verified but has no verified_on (YYYY-MM-DD)');
  });

  it('passes a verified provider with real values and a verified_on date', () => {
    const cfg = base();
    cfg.providers.gemini = { endpoint: 'https://api.example.com/v1', model: 'model-x', browser_direct_verified: true, verified_on: '2026-11-04' };
    expect(run(cfg).errors).toEqual([]);
    expect(verifiedProviderOrigins(cfg)).toEqual(['https://api.example.com', 'https://api.anthropic.com']);
    expect(verifiedProviderOrigins(base())).toEqual(['https://generativelanguage.googleapis.com', 'https://api.anthropic.com']);
  });

  it('only a verified provider can be recommended; unverified wizard cards need a reason; model must be in models', () => {
    const cfg = base();
    cfg.providers.gemini.browser_direct_verified = false;
    cfg.providers.gemini.unavailable_reason = 'pending_verification';
    cfg.wizard.beginner_recommendation = 'gemini';
    delete cfg.providers.openai.unavailable_reason;
    cfg.providers.anthropic.model = 'claude-other';
    const { errors } = run(cfg);
    expect(errors).toContainEqual('wizard.beginner_recommendation "gemini" is not a browser_direct_verified provider');
    expect(errors).toContainEqual(expect.stringContaining('providers.openai is not browser_direct_verified and needs unavailable_reason'));
    expect(errors).toContainEqual('providers.anthropic.model "claude-other" is not in providers.anthropic.models');
  });

  it('fails while the DB hash or the PBKDF2 iterations are still placeholders', () => {
    const cfg = base();
    cfg.bible_db.sha256 = '<파생 DB 해시>';
    cfg.backup.pbkdf2_iterations = '<구현 시 현재 권장값 확인>';
    const { errors } = run(cfg);
    expect(errors).toContainEqual('bible_db.sha256 is still a placeholder');
    expect(errors).toContainEqual('backup.pbkdf2_iterations is still a placeholder');
  });

  it('fails a verified provider whose verified_on is not a date', () => {
    const cfg = base();
    cfg.providers.anthropic.verified_on = 'soon';
    expect(run(cfg).errors.some((e) => e.includes('verified_on'))).toBe(true);
  });

  it('fails schema violations (e.g. unknown key, font size below 16px)', () => {
    const cfg = base();
    cfg.ui.font_size_px.options = [14, 16];
    cfg.extra = true;
    const { errors } = run(cfg);
    expect(errors.some((e) => e.startsWith('schema:'))).toBe(true);
  });

  it('fails when the default font size is not one of the options', () => {
    const cfg = base();
    cfg.ui.font_size_px.default = 17;
    expect(run(cfg).errors).toContainEqual(expect.stringContaining('font_size_px.default 17'));
  });

  it('bible-sources: download_url only for public_domain with verified_on', () => {
    expect(
      checkBibleSources([
        { id: 'kjv', rights: 'public_domain', download_url: 'https://x', verified_on: '2026-10-30' },
        { id: 'nkrv', rights: 'copyrighted', download_url: 'https://y' },
        { id: 'web', rights: 'public_domain', download_url: 'https://z' },
      ]),
    ).toEqual([
      'bible-sources nkrv: download_url only allowed for public_domain',
      'bible-sources nkrv: download_url requires verified_on (YYYY-MM-DD)',
      'bible-sources web: download_url requires verified_on (YYYY-MM-DD)',
    ]);
  });

  it('bible-sources: the repository registry passes schema, link and i18n rules', () => {
    const doc = JSON.parse(readFileSync('config/bible-sources.json', 'utf8'));
    const opts = {
      schema: JSON.parse(readFileSync('config/bible-sources.schema.json', 'utf8')),
      i18n: { ko: JSON.parse(readFileSync('src/i18n/ko.json', 'utf8')), en: JSON.parse(readFileSync('src/i18n/en.json', 'utf8')) },
    };
    expect(checkBibleSources(doc, opts)).toEqual([]);
    // Only verified public-domain entries carry a download link.
    for (const e of doc) if (e.download_url) expect(e).toMatchObject({ rights: 'public_domain', verified_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it('bible-sources: rule violations fail', () => {
    const schema = JSON.parse(readFileSync('config/bible-sources.schema.json', 'utf8'));
    expect(checkBibleSources([{ id: 'x', rights: 'public_domain' }], { schema })[0]).toMatch(/^bible-sources schema:/);
    expect(
      checkBibleSources([
        { id: 'a', rights: 'unverified', read_url: 'https://r', verified_on: '2026-11-05' },
        { id: 'a', rights: 'public_domain', read_url: 'http://plain' , verified_on: '2026-11-05' },
        { id: 'b', rights: 'copyrighted', read_url: 'https://r' },
        { id: 'c', rights: 'public_domain', note: 'nope' },
      ], { i18n: { ko: { bible_guide: { name: { a: 'A', b: 'B' }, note: {} } }, en: { bible_guide: { name: { a: 'A', b: 'B', c: 'C' }, note: {} } } } }),
    ).toEqual([
      'bible-sources a: unverified entries have no links',
      'bible-sources a: duplicate id',
      'bible-sources a: read_url must be an https URL',
      'bible-sources b: read_url requires verified_on (YYYY-MM-DD)',
      'bible-sources c: missing i18n ko bible_guide.name.c',
      'bible-sources c: missing i18n ko bible_guide.note.nope',
      'bible-sources c: missing i18n en bible_guide.note.nope',
    ]);
  });
});
