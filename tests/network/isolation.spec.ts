import { expect, test } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { blockExternalRequests, waitForServiceWorker } from '../helpers/network';
import { press, tap } from '../helpers/touch';
import { nav, openBookPanel } from '../helpers/menu';

// CLAUDE.md rule 2 / DESIGN 10장: no request leaves the app origin outside generation features.
test('loading the shell makes zero requests outside the app origin', async ({ page, baseURL }) => {
  const external = await blockExternalRequests(page, new URL(baseURL!).origin);
  await page.goto('/');
  await waitForServiceWorker(page);
  await page.reload();
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
});

test('viewer and search make zero requests outside the app origin', async ({ page, baseURL }) => {
  const external = await blockExternalRequests(page, new URL(baseURL!).origin);
  await page.goto('/#/read');
  await expect(page.getByTestId('viewer')).toBeVisible({ timeout: 20_000 });
  await openBookPanel(page);
  await page.getByTestId('ref-input').fill('요 3:16');
  await page.getByTestId('ref-go').click();
  await page.getByRole('button', { name: ko.viewer.tab_search }).click();
  await page.getByTestId('search-input').fill('사랑');
  await page.getByTestId('search-go').click();
  await expect(page.getByTestId('search-results')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
});

test('after install, chapter lookup and search work offline after a reload', async ({ page, context }) => {
  await page.goto('/#/read');
  await waitForServiceWorker(page);
  await expect(page.getByTestId('viewer')).toBeVisible({ timeout: 20_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('viewer')).toBeVisible({ timeout: 20_000 });
  await openBookPanel(page);
  await page.getByTestId('ref-input').fill('롬 8:28');
  await page.getByTestId('ref-go').click();
  await expect(page.getByTestId('chapter-title')).toHaveText('로마서 8장');
  await expect(page.locator('[data-verse="28"]')).toHaveClass(/verse--highlight/);
  await page.getByRole('button', { name: ko.viewer.tab_search }).click();
  await page.getByTestId('search-input').fill('믿음');
  await page.getByTestId('search-go').click();
  await expect(page.getByTestId('search-results')).toBeVisible();
  await context.setOffline(false);
});

test('wizard, home and settings make zero requests outside the app origin', async ({ page, baseURL }) => {
  const external = await blockExternalRequests(page, new URL(baseURL!).origin);
  await page.goto('/');
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-llm-use').click();
  // S08: steps 4–5 (provider cards, issuance guide with links not tapped) send nothing.
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('wizard-get_key')).toBeVisible();
  await page.getByTestId('wizard-skip').click();
  await expect(page.getByTestId('today-text')).not.toBeEmpty({ timeout: 20_000 });
  await nav(page, 'settings');
  await page.getByTestId('settings-language').locator('[data-value="en"]').click();
  await page.getByTestId('settings-font').locator('[data-value="22"]').click();
  await page.getByTestId('wizard-reopen').click();
  await expect(page.getByTestId('wizard-language')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
});

test('selection, copy and local stats make zero requests outside the app origin', async ({ page, baseURL }) => {
  const external = await blockExternalRequests(page, new URL(baseURL!).origin);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => undefined } });
  });
  await page.clock.install();
  await page.goto('/#/read');
  await expect(page.getByTestId('viewer')).toBeVisible({ timeout: 20_000 });
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  await press(page, page.locator('[data-verse="3"]'), 500);
  await tap(page, page.locator('[data-verse="4"]'));
  await page.getByTestId('action-copy').click();
  await expect(page.getByTestId('action-status')).toBeVisible();
  await page.getByTestId('action-clear-all').click();
  await page.getByTestId('check-5').click();
  // The menu button is hidden while the action bar is open (S12): clear the selection first.
  await expect(page.getByTestId('menu-open')).toBeHidden();
  await page.getByTestId('action-clear-all').click();
  await nav(page, 'settings');
  await expect(page.getByTestId('stats-entrySuccess')).toHaveText('100%');
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
});

// S04: upload → parse (txt, docx, PDF with worker and CMaps) → save → delete stays same-origin.
test('My Sermons upload, parse, save and delete make zero requests outside the app origin', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const external = await blockExternalRequests(page, origin);
  const sameOrigin: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(origin)) sameOrigin.push(new URL(r.url()).pathname);
  });
  await page.goto('/#/sermons');
  await expect(page.getByTestId('sermon-empty')).toBeVisible({ timeout: 20_000 });
  for (const file of ['sermon.txt', 'sermon.docx', 'sermon.pdf']) {
    await page.getByTestId('sermon-add').click();
    await page.getByTestId('sermon-file').setInputFiles(`tests/fixtures/sermons/${file}`);
    await page.getByTestId('sermon-consent').click();
    await page.getByTestId('sermon-next').click();
    await expect(page.getByTestId('sermon-text')).toHaveValue(/ZQX-표지-문장/, { timeout: 20_000 });
    await page.getByTestId('sermon-save').click();
    await expect(page.getByTestId('sermon-status')).toHaveText(ko.sermons.saved);
  }
  await expect(page.getByTestId('sermon-item')).toHaveCount(3);
  while ((await page.getByTestId('sermon-item').count()) > 0) {
    const before = await page.getByTestId('sermon-item').count();
    await page.getByTestId('sermon-delete').first().click();
    await page.getByTestId('sermon-delete-yes').click();
    await expect(page.getByTestId('sermon-item')).toHaveCount(before - 1);
  }
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  // The PDF worker was loaded from the app origin (no CDN).
  expect(sameOrigin.some((p) => /pdf\.worker.*\.mjs$/.test(p))).toBe(true);
});

test('after install, a text PDF can be added offline (worker and Korean CMaps precached)', async ({ page, context }) => {
  await page.goto('/#/sermons');
  await waitForServiceWorker(page);
  await expect(page.getByTestId('sermon-empty')).toBeVisible({ timeout: 20_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('sermon-empty')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('sermon-add').click();
  await page.getByTestId('sermon-file').setInputFiles('tests/fixtures/sermons/sermon.pdf');
  await page.getByTestId('sermon-consent').click();
  await page.getByTestId('sermon-next').click();
  await expect(page.getByTestId('sermon-text')).toHaveValue(/ZQX-표지-문장/, { timeout: 20_000 });
  await page.getByTestId('sermon-save').click();
  await expect(page.getByTestId('sermon-item')).toHaveCount(1);
  await context.setOffline(false);
});
