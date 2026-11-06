// S08: wizard steps 4–9 and the settings connection panel against a mocked provider
// (DESIGN 3.13, 3.13.2, 3.13.3; CLAUDE.md rules 4, 18, 20). No real provider is contacted.
import { expect, test, type Page } from '@playwright/test';
import appConfig from '../../config/app.config.json' with { type: 'json' };
const { providers } = appConfig;
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { retrieveIntoOutline, selectWithChecks, uploadSermon } from '../helpers/flow';
import { AUTH_FAIL, DUMP_IDB, mockProvider, OK, PROVIDER_ORIGIN, type Reply } from '../helpers/provider';
import { noHorizontalScroll, smallTargets, smallText } from '../helpers/ui';

// A service worker that takes control mid-test makes WebKit skip context.route for cross-origin
// requests, so the mocked provider would be bypassed. The app's worker never touches those requests.
test.use({ serviceWorkers: 'block' });

const KEY = 'sk-ant-api03-E2E-SECRET-key-material-7Q9z';
const WRONG_FORMAT = 'AIzaSyE2E-SECRET-wrong-format-key';

async function toProviderStepAsIs(page: Page) {
  await page.goto('/');
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-llm-use').click();
  await expect(page.getByTestId('wizard-provider')).toBeVisible();
}

/** Provider step with Anthropic chosen (the mocked provider in these tests). */
async function toProviderStep(page: Page) {
  await toProviderStepAsIs(page);
  await page.getByTestId('provider-anthropic').click();
}

async function toVerifyStep(page: Page, key = KEY) {
  await toProviderStep(page);
  await page.getByTestId('wizard-next').click(); // provider (anthropic chosen)
  await page.getByTestId('wizard-next').click(); // get_key
  await page.getByTestId('key-input').fill(key);
  await page.getByTestId('wizard-next').click();
}

async function noKeyInBrowserState(page: Page, secret: string) {
  expect(await page.evaluate(() => document.body.innerText)).not.toContain(secret);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).not.toContain(secret);
  expect(await page.evaluate(DUMP_IDB)).not.toContain(secret);
}

test('step 4: verified providers are choosable, Gemini preselected and recommended; others are disabled cards with reasons', async ({ page }) => {
  await toProviderStepAsIs(page);
  await expect(page.getByTestId('provider-gemini')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('provider-gemini-recommended')).toHaveText(ko.wizard.provider.recommended);
  await expect(page.getByTestId('provider-anthropic-recommended')).toHaveCount(0);
  await expect(page.getByTestId('wizard-model-choices').locator('[data-value="gemini-flash-latest"]')).toHaveAttribute('aria-pressed', 'true');
  for (const [id, reason] of [['openai', ko.wizard.provider.reason.no_browser_access]] as const) {
    const card = page.getByTestId(`provider-${id}`);
    await expect(card).toHaveAttribute('aria-disabled', 'true');
    expect(await card.evaluate((el) => el.tagName)).toBe('DIV');
    await expect(card.locator('button')).toHaveCount(0);
    await expect(page.getByTestId(`provider-${id}-reason`)).toHaveText(reason);
    await expect(page.getByTestId(`provider-${id}-recommended`)).toHaveCount(0);
  }
  await page.getByTestId('provider-anthropic').click();
  await expect(page.getByTestId('provider-anthropic')).toHaveAttribute('aria-pressed', 'true');
  // Model choice: default first (Haiku), plain-language labels, no prices.
  const models = page.getByTestId('wizard-model-choices');
  await expect(models.locator('[data-value="claude-haiku-5-5"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(models).toContainText(ko.llm.model_desc['claude-opus-5-5']);
  expect(await models.innerText()).not.toMatch(/\$|원|₩/);
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
  expect(await smallText(page)).toEqual([]);
});

test('step 5: entering makes no provider request; links open a new tab only when tapped', async ({ page, context, baseURL }) => {
  const appOrigin = new URL(baseURL!).origin;
  const providerHits: string[] = [];
  context.on('request', (r) => {
    if (new URL(r.url()).origin !== appOrigin) providerHits.push(r.url());
  });
  await context.route('https://platform.claude.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>console</p>' }));
  await toProviderStep(page);
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('wizard-get_key')).toBeVisible();
  await expect(page.getByTestId('get-key-steps').locator('li')).toHaveCount(6);
  await page.waitForTimeout(500);
  expect(providerHits).toEqual([]);
  expect(context.pages()).toHaveLength(1);

  const link = page.getByTestId('get-key-link-keys_url');
  await expect(link).toHaveAttribute('href', providers.anthropic.keys_url);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  const [tab] = await Promise.all([context.waitForEvent('page'), link.click()]);
  await tab.waitForLoadState();
  expect(tab.url()).toBe(providers.anthropic.keys_url);
  // The only outside request is the page the user opened; nothing went to the API origin.
  expect(providerHits).toEqual([providers.anthropic.keys_url]);
  expect(providerHits.filter((u) => u.startsWith(PROVIDER_ORIGIN))).toEqual([]);
  await tab.close();

  // Checklist marks are local only.
  await page.getByTestId('get-key-s1').click();
  await expect(page.getByTestId('get-key-s1')).toHaveAttribute('aria-checked', 'true');
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
});

test('success: one tap → exactly one request, masked key, consent, done; no key in console/DOM/storage', async ({ page, context }) => {
  const consoleText: string[] = [];
  page.on('console', (m) => consoleText.push(m.text()));
  page.on('pageerror', (e) => consoleText.push(String(e)));
  const posts = await mockProvider(context, () => OK);

  await toProviderStep(page);
  await page.getByTestId('wizard-model-choices').locator('[data-value="claude-sonnet-5-5"]').click();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-next').click();
  const input = page.getByTestId('key-input');
  await expect(input).toHaveAttribute('type', 'password');
  await expect(input).toHaveAttribute('autocomplete', 'off');
  await input.fill(KEY);
  await noKeyInBrowserState(page, KEY);
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('verify-pending')).toHaveText(ko.wizard.verify.pending.replace('{masked}', '••••7Q9z'));
  expect(posts).toHaveLength(0);

  await page.getByTestId('verify-check').click();
  await expect(page.getByTestId('verify-success')).toBeVisible();
  await expect(page.getByTestId('verify-masked')).toHaveText(ko.wizard.verify.saved.replace('{masked}', '••••7Q9z'));
  expect(posts).toHaveLength(1);
  expect(posts[0]!.url).toBe(providers.anthropic.endpoint);
  expect(posts[0]!.url).not.toContain(KEY);
  expect(posts[0]!.body).not.toContain(KEY);
  expect(posts[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
  expect(JSON.parse(posts[0]!.body).model).toBe('claude-sonnet-5-5');
  await noKeyInBrowserState(page, KEY);

  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('wizard-consent')).toBeVisible();
  await expect(page.getByTestId('consent-send')).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('wizard-done')).toBeVisible();
  await expect(page.getByTestId('wizard-skip')).toHaveCount(0);
  await page.getByTestId('wizard-start').click();
  await expect(page.getByTestId('home')).toBeVisible();

  // Settings shows only provider, model and ••••last4.
  await page.goto('/#/settings?section=connection');
  await expect(page.getByTestId('connection-key')).toHaveText(ko.settings.connection.key.replace('{masked}', '••••7Q9z'));
  await expect(page.getByTestId('connection-model').locator('[data-value="claude-sonnet-5-5"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('connection-model').locator('[data-value="claude-haiku-5-5"]').click();
  await page.reload();
  await expect(page.getByTestId('connection-model').locator('[data-value="claude-haiku-5-5"]')).toHaveAttribute('aria-pressed', 'true');
  await noKeyInBrowserState(page, KEY);
  expect(posts).toHaveLength(1); // settings send nothing

  // Delete key: gone from storage and screen at once.
  await page.getByTestId('connection-delete').click();
  await page.getByTestId('connection-delete-yes').click();
  await expect(page.getByTestId('connection-deleted')).toHaveText(ko.settings.connection.deleted);
  await expect(page.getByTestId('connection-none')).toBeVisible();
  expect(await page.evaluate(DUMP_IDB)).not.toContain('7Q9z');
  expect(consoleText.join('\n')).not.toContain(KEY);
});

test('double tap on "check" sends one request (button disabled while checking)', async ({ page, context }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const posts: string[] = [];
  await context.route(`${PROVIDER_ORIGIN}/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    posts.push(route.request().url());
    await gate;
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify((OK as { body: unknown }).body) });
  });
  await toVerifyStep(page);
  await page.getByTestId('verify-check').click();
  await expect(page.getByTestId('verify-check')).toBeDisabled();
  await page.getByTestId('verify-check').click({ force: true }).catch(() => undefined);
  release();
  await expect(page.getByTestId('verify-success')).toBeVisible();
  expect(posts).toHaveLength(1);
});

test('format mismatch: notice before any request; "check anyway" lets the provider decide (auth failure)', async ({ page, context }) => {
  const posts = await mockProvider(context, () => AUTH_FAIL);
  await toVerifyStep(page, WRONG_FORMAT);
  await expect(page.getByTestId('key-format-notice')).toHaveText(ko.llm.error.format.replace('{provider}', ko.llm.provider_name.anthropic).replace('{prefix}', 'sk-ant-'));
  expect(posts).toHaveLength(0);
  await page.getByTestId('key-check-anyway').click();
  await page.getByTestId('verify-check').click();
  await expect(page.getByTestId('verify-error')).toHaveText(ko.llm.error.auth);
  expect(posts).toHaveLength(1);
  await noKeyInBrowserState(page, WRONG_FORMAT);
});

for (const [name, reply, message] of [
  ['auth failure', AUTH_FAIL, ko.llm.error.auth],
  ['network error', 'network', ko.llm.error.network],
  ['billing', { status: 402, body: { type: 'error', error: { type: 'billing_error', message: 'x' } } }, ko.llm.error.billing],
  ['unknown 500', { status: 500, body: { type: 'error', error: { type: 'api_error', message: 'x' } } }, ko.llm.error.unknown],
] as [string, Reply, string][]) {
  test(`${name}: cause notice, key not saved, "use without AI" goes home with independent features`, async ({ page, context }) => {
    const posts = await mockProvider(context, () => reply);
    await toVerifyStep(page);
    await page.getByTestId('verify-check').click();
    await expect(page.getByTestId('verify-error')).toHaveText(message);
    expect(posts).toHaveLength(1);
    await noKeyInBrowserState(page, KEY);
    expect(await page.evaluate(DUMP_IDB)).not.toContain('7Q9z');
    await expect(page.getByTestId('verify-repaste')).toBeVisible();
    await page.getByTestId('verify-no-ai').click();
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(page.getByTestId('today-text')).not.toBeEmpty({ timeout: 20_000 });
    await page.goto('/#/settings');
    await expect(page.getByTestId('connection-none')).toBeVisible();
    // Reconnect from settings reopens the wizard at step 4.
    await page.getByTestId('connection-connect').click();
    await expect(page.getByTestId('wizard-provider')).toBeVisible();
  });
}

test('"paste again" after a failure returns to step 6 with an empty field', async ({ page, context }) => {
  await mockProvider(context, () => AUTH_FAIL);
  await toVerifyStep(page);
  await page.getByTestId('verify-check').click();
  await expect(page.getByTestId('verify-error')).toBeVisible();
  await page.getByTestId('verify-repaste').click();
  await expect(page.getByTestId('wizard-paste_key')).toBeVisible();
  await expect(page.getByTestId('key-input')).toHaveValue('');
});

test('consent declined: sermons can still be saved and searched; consent records "not granted"', async ({ page, context }) => {
  await mockProvider(context, () => OK);
  await toVerifyStep(page);
  await page.getByTestId('verify-check').click();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-next').click(); // default: do not send
  await page.getByTestId('wizard-backup').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  const consents = await page.evaluate(DUMP_IDB);
  expect(consents).toContain('external_transfer');
  await uploadSermon(page);
  await selectWithChecks(page, '요 15', [1, 2]);
  await retrieveIntoOutline(page);
});
