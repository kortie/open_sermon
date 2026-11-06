// Mocked LLM provider for E2E (S08). Intercepts the configured endpoint origin only; answers CORS
// preflights and records each POST. No real provider is contacted.
import type { BrowserContext, Route } from '@playwright/test';
import appConfig from '../../config/app.config.json' with { type: 'json' };
const { providers } = appConfig;

export const PROVIDER_ORIGIN = new URL(providers.anthropic.endpoint).origin;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export type Reply = { status: number; body: unknown } | 'network';

export const OK: Reply = { status: 200, body: { id: 'msg_test', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'o' }] } };
export const AUTH_FAIL: Reply = { status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } };

/** Route provider calls to `reply()`. Returns the live list of POSTs (url, headers, body). */
export async function mockProvider(context: BrowserContext, reply: () => Reply) {
  const posts: { url: string; headers: Record<string, string>; body: string }[] = [];
  await context.route(`${PROVIDER_ORIGIN}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    posts.push({ url: req.url(), headers: await req.allHeaders(), body: req.postData() ?? '' });
    const r = reply();
    if (r === 'network') return route.abort('internetdisconnected');
    return route.fulfill({ status: r.status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(r.body) });
  });
  return posts;
}

/** Every value in the app's IndexedDB as text (ArrayBuffers decoded), for leak checks. */
export const DUMP_IDB = async (): Promise<string> => {
  const db: IDBDatabase = await new Promise((res, rej) => {
    const r = indexedDB.open('open_sermon');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const names = Array.from(db.objectStoreNames);
  const tx = db.transaction(names, 'readonly');
  const out: string[] = [];
  const dec = new TextDecoder();
  const walk = (v: unknown): void => {
    if (v instanceof ArrayBuffer) out.push(dec.decode(new Uint8Array(v)));
    else if (ArrayBuffer.isView(v)) out.push(dec.decode(new Uint8Array(v.buffer)));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object' && !(v instanceof CryptoKey)) Object.values(v).forEach(walk);
    else out.push(String(v));
  };
  for (const n of names) {
    const all: unknown[] = await new Promise((res, rej) => {
      const r = tx.objectStore(n).getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    walk(all);
  }
  db.close();
  return out.join('\n');
};

/** A Messages API reply whose text is the given model output (S09 fixtures). */
export const modelReply = (output: unknown): Reply => ({
  status: 200,
  body: { id: 'msg_gen', type: 'message', role: 'assistant', content: [{ type: 'text', text: typeof output === 'string' ? output : JSON.stringify(output) }] },
});

/** Replies in order (the key check first); a missing reply fails loudly as a 500. */
export function queue(...replies: Reply[]): () => Reply {
  return () => replies.shift() ?? { status: 500, body: { type: 'error', error: { type: 'api_error', message: 'unexpected extra request' } } };
}

/**
 * Walk the wizard with a mocked provider: language → bible → AI → provider → key → check →
 * consent (send or not) → done. The first queued reply must answer the key check.
 */
export async function connectThroughWizard(page: import('@playwright/test').Page, opts: { lang?: 'ko' | 'en'; bible?: string; consent?: boolean } = {}) {
  const { expect } = await import('@playwright/test');
  await page.goto('/');
  if (opts.lang) await page.getByTestId('wizard-language-choices').locator(`[data-value="${opts.lang}"]`).click();
  await page.getByTestId('wizard-next').click();
  if (opts.bible) await page.getByTestId('wizard-bible-choices').locator(`[data-value="${opts.bible}"]`).click();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-llm-use').click();
  await page.getByTestId('provider-anthropic').click();
  await page.getByTestId('wizard-next').click(); // provider
  await page.getByTestId('wizard-next').click(); // get_key
  await page.getByTestId('key-input').fill('sk-ant-api03-E2E-generate-key-K3y9');
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('verify-check').click();
  await expect(page.getByTestId('verify-success')).toBeVisible();
  await page.getByTestId('wizard-next').click();
  if (opts.consent) await page.getByTestId('consent-send').click();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-start').click();
  await expect(page.getByTestId('home')).toBeVisible();
}
