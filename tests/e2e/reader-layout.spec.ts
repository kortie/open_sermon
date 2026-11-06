// S12: screen restructure (DESIGN 3.1, 3.1.1, 3.12, 8장 v0.18) — floating side menu, one-row reader
// toolbar with the bible choice, and the Reflection Draft as the primary selection action.
import { expect, test } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { selectWithChecks, visibleTextHasNoInternalTerms } from '../helpers/flow';
import { chooseReaderBible, nav } from '../helpers/menu';
import { blockExternalRequests } from '../helpers/network';
import { connectThroughWizard, mockProvider, OK, queue } from '../helpers/provider';
import { noHorizontalScroll, skipWizard, smallTargets } from '../helpers/ui';

test.use({ serviceWorkers: 'block' });

test.describe('360×640', () => {
  test.use({ viewport: { width: 360, height: 640 } });
  test('the first verse shows without scrolling; only one toolbar row above it', async ({ page }) => {
    await page.goto('/#/read?ref=JHN%203');
    const first = page.locator('[data-verse="1"]');
    await expect(first).toBeVisible({ timeout: 20_000 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const box = (await first.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(640);
    const bar = (await page.getByTestId('reader-bar').boundingBox())!;
    expect(bar.height).toBeLessThan(80);
    expect(box.y).toBeLessThan(bar.y + bar.height + 40);
    await expect(page.getByTestId('picker-toggle')).toContainText('요한복음 3장');
    await expect(page.getByTestId('reader-bible-toggle')).toContainText(ko.bible_short.krv);
    await noHorizontalScroll(page);
    expect(await smallTargets(page)).toEqual([]);
  });
});

test('menu: floating button opens the side menu; backdrop, Escape and items close it', async ({ page }) => {
  await skipWizard(page);
  await expect(page.getByTestId('home')).toBeVisible();
  const open = page.getByTestId('menu-open');
  await expect(open).toHaveAttribute('aria-expanded', 'false');
  await open.click();
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(open).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('nav-home')).toHaveAttribute('aria-current', 'page');
  for (const n of ['home', 'read', 'sermons', 'settings'] as const) await expect(page.getByTestId(`nav-${n}`)).toHaveText(ko.nav[n]);
  expect(await smallTargets(page)).toEqual([]);
  await page.getByTestId('menu-backdrop').click({ position: { x: 340, y: 400 } });
  await expect(page.getByTestId('menu')).toHaveCount(0);
  await open.click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('menu')).toHaveCount(0);

  await nav(page, 'sermons');
  await expect(page).toHaveURL(/#\/sermons/);
  await nav(page, 'settings');
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.getByTestId('menu-open').click();
  await expect(page.getByTestId('nav-settings')).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('nav-read').click();
  await expect(page.getByTestId('viewer')).toBeVisible();
});

test('the reading bible is chosen in the reader; settings only manage versions', async ({ page }) => {
  await page.goto('/#/read?ref=GEN%201');
  await expect(page.locator('[data-verse="1"]')).toContainText('태초에', { timeout: 20_000 });
  await chooseReaderBible(page, 'kjv');
  await expect(page.locator('[data-verse="1"]')).toContainText('In the beginning');
  await expect(page.getByTestId('reader-bible-toggle')).toContainText(ko.bible_short.kjv);
  await page.reload();
  await expect(page.locator('[data-verse="1"]')).toContainText('In the beginning', { timeout: 20_000 });

  await page.getByTestId('reader-bible-toggle').click();
  await page.getByTestId('reader-bible-manage').click();
  await expect(page.getByTestId('settings-bibles')).toBeVisible();
  await expect(page.getByTestId('settings-bible')).toHaveCount(0);
});

test('book panel: picker and reference input open from the toolbar and close after moving', async ({ page }) => {
  await page.goto('/#/read');
  await expect(page.getByTestId('picker-toggle')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('ref-input')).toHaveCount(0);
  await page.getByTestId('picker-toggle').click();
  await expect(page.getByTestId('picker-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.getByTestId('ref-input').fill('롬 8:28');
  await page.getByTestId('ref-go').click();
  await expect(page.getByTestId('chapter-title')).toHaveText('로마서 8장');
  await expect(page.getByTestId('picker-panel')).toHaveCount(0);
  await expect(page.getByTestId('picker-toggle')).toContainText('로마서 8장');
});

test('selection → Reflection Draft without a connection: choices shown, outline opens, nothing sent', async ({ page, baseURL }) => {
  const external = await blockExternalRequests(page, new URL(baseURL!).origin);
  await selectWithChecks(page, '요 15', [1, 2, 3]);
  const draft = page.getByTestId('action-draft');
  await expect(draft).toHaveText(ko.selection.action.draft);
  await expect(page.getByTestId('menu-open')).toBeHidden();
  await draft.click();
  await expect(page.getByTestId('generate-no-connection')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: ko.generate.no_connection_title })).toBeVisible();
  await visibleTextHasNoInternalTerms(page);
  expect(await smallTargets(page)).toEqual([]);
  await page.getByTestId('no-connection-outline').click();
  await expect(page).toHaveURL(/#\/outline\?ref=JHN\+15%3A1-3/);
  await page.goBack();
  await page.getByTestId('no-connection-connect').click();
  await expect(page).toHaveURL(/#\/settings\?section=connection/);
  expect(external).toEqual([]);
});

test('selection → Reflection Draft with a connection opens the transfer notice (nothing sent yet)', async ({ page, context }) => {
  const posts = await mockProvider(context, queue(OK));
  await connectThroughWizard(page);
  await selectWithChecks(page, '요 15', [1, 2, 3]);
  await page.getByTestId('action-draft').click();
  await expect(page.getByTestId('generate-notice')).toBeVisible({ timeout: 20_000 });
  expect(posts).toHaveLength(1); // the key check only
});
