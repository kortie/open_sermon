// Gemini (S14, docs/PROVIDERS.md "gemini" 2026-11-06): recommended by default, AI Studio guide, key
// check as one GET with the key in x-goog-api-key, cause message on failure, free-tier notice.
// The provider is mocked; nothing real is contacted.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import appConfig from '../../config/app.config.json' with { type: 'json' };
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { selectWithChecks } from '../helpers/flow';
import { DUMP_IDB } from '../helpers/provider';
import { noHorizontalScroll, smallTargets } from '../helpers/ui';

test.use({ serviceWorkers: 'block' });

const { gemini } = appConfig.providers;
const ORIGIN = new URL(gemini.endpoint).origin;
const KEY = 'AIzaSyE2E-SECRET-gemini-key-9Xw2';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };

async function mockGemini(context: BrowserContext, status = 200) {
  const calls: { method: string; url: string; headers: Record<string, string> }[] = [];
  await context.route(`${ORIGIN}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    calls.push({ method: req.method(), url: req.url(), headers: await req.allHeaders() });
    const body = status === 200
      ? { name: `models/${gemini.model}` }
      : { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } };
    return route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  });
  return calls;
}

async function toVerify(page: Page) {
  await page.goto('/');
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-llm-use').click();
  await expect(page.getByTestId('provider-gemini')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('get-key-steps').locator('li')).toHaveCount(5);
  await expect(page.getByTestId('get-key-s4')).toContainText('AIza');
  await expect(page.getByTestId('get-key-link-console_url')).toHaveAttribute('href', gemini.console_url);
  await expect(page.getByTestId('get-key-link-console_url')).toHaveAttribute('target', '_blank');
  await expect(page.getByText(ko.wizard.get_key.gemini.note)).toBeVisible();
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('key-input').fill(KEY);
  await page.getByTestId('wizard-next').click();
}

test('Gemini is the default: guide, one GET key check with the key in a header only, then the free-tier notice', async ({ page, context }) => {
  const calls = await mockGemini(context);
  await toVerify(page);
  expect(calls).toEqual([]); // nothing sent before the button
  await page.getByTestId('verify-check').click();
  await expect(page.getByTestId('verify-success')).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0]!.method).toBe('GET');
  expect(calls[0]!.url).toBe(`${gemini.endpoint}/${gemini.model}`);
  expect(calls[0]!.url).not.toContain(KEY);
  expect(calls[0]!.headers['x-goog-api-key']).toBe(KEY);
  expect(await page.evaluate(DUMP_IDB)).not.toContain(KEY);
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-start').click();
  await expect(page.getByTestId('home')).toBeVisible();

  await selectWithChecks(page, '요 15', [1, 2]);
  await page.getByTestId('action-draft').click();
  await expect(page.getByTestId('generate-notice')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('generate-notice-gemini')).toHaveText(ko.generate.notice_gemini);
  expect(calls).toHaveLength(1);
});

test('an invalid Gemini key shows the auth cause message and nothing is saved', async ({ page, context }) => {
  const calls = await mockGemini(context, 400);
  await toVerify(page);
  await page.getByTestId('verify-check').click();
  await expect(page.getByText(ko.llm.error.auth)).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(await page.evaluate(DUMP_IDB)).not.toContain(KEY);
  expect(await page.evaluate(() => document.body.innerText)).not.toContain(KEY);
});
