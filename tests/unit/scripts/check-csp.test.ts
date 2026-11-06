import { describe, expect, it } from 'vitest';
import { buildCsp, checkCsp } from '../../../scripts/check-csp.mjs';

const html = (csp: string) => `<html><head><meta http-equiv="Content-Security-Policy" content="${csp}"></head></html>`;
const GOOD = buildCsp([]);

describe('check-csp', () => {
  it('passes the policy produced by the build plugin', () => {
    expect(checkCsp(html(GOOD), [])).toEqual([]);
  });

  it('decodes HTML entities the way the browser does (Vite writes &#39;)', () => {
    expect(checkCsp(html(GOOD.replace(/'/g, '&#39;')), [])).toEqual([]);
    expect(checkCsp(html(GOOD.replace(/'/g, '&#39;').replace(' &#39;wasm-unsafe-eval&#39;', '')), [])).toContainEqual(
      expect.stringContaining('script-src must be exactly'),
    );
  });

  it('passes a verified provider origin in connect-src', () => {
    expect(checkCsp(html(buildCsp(['https://api.example.com'])), ['https://api.example.com'])).toEqual([]);
  });

  it("fails on 'unsafe-inline'", () => {
    const errors = checkCsp(html(GOOD.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")), []);
    expect(errors).toContainEqual(expect.stringContaining("forbidden source 'unsafe-inline'"));
  });

  it("fails when 'wasm-unsafe-eval' is missing", () => {
    const errors = checkCsp(html(GOOD.replace(" 'wasm-unsafe-eval'", '')), []);
    expect(errors).toContainEqual(expect.stringContaining('script-src must be exactly'));
  });

  it('fails on an unverified origin in connect-src', () => {
    const errors = checkCsp(html(buildCsp(['https://api.example.com'])), []);
    expect(errors).toContainEqual(expect.stringContaining('unverified source https://api.example.com'));
  });

  it('fails when there is no CSP meta or a directive is missing', () => {
    expect(checkCsp('<html></html>', [])).toEqual(['no Content-Security-Policy <meta> found']);
    expect(checkCsp(html(GOOD.replace("; object-src 'none'", '')), [])).toContainEqual('missing directive object-src');
  });
});
