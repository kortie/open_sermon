// Builds the app's CSP from config (CLAUDE.md 4.2, S07). Single producer: vite.config.ts injects
// buildCsp(connectOriginsFromConfig(cfg)) into dist/index.html, and scripts/check-csp.mjs checks the
// built file against the same origin list, so the two cannot drift apart.
// No imports from check-config.mjs (check-config imports this file).

const isPlaceholder = (v) => typeof v === 'string' && /^<.*>$/.test(v);

/**
 * Origins (scheme://host[:port]) of providers verified for browser-direct calls.
 * Only providers with browser_direct_verified: true and a real https endpoint are listed.
 * @param {{ providers?: Record<string, { endpoint: string, browser_direct_verified: boolean }> }} cfg
 * @returns {string[]}
 */
export function connectOriginsFromConfig(cfg) {
  const out = [];
  for (const p of Object.values(cfg.providers ?? {})) {
    if (p.browser_direct_verified !== true || isPlaceholder(p.endpoint)) continue;
    let url;
    try {
      url = new URL(p.endpoint);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:') continue;
    if (!out.includes(url.origin)) out.push(url.origin);
  }
  return out;
}

/**
 * The app's CSP (CLAUDE.md 4.2, DESIGN 5장).
 * @param {string[]} connectOrigins verified provider origins
 */
export function buildCsp(connectOrigins = []) {
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self'",
    `connect-src ${["'self'", ...connectOrigins].join(' ')}`,
    "img-src 'self' data: blob:",
    "style-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

/** CSP for a parsed app.config.json. */
export function cspFromConfig(cfg) {
  return buildCsp(connectOriginsFromConfig(cfg));
}
