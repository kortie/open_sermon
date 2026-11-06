// S02: font size setting (DESIGN 3.16) — immediate, persisted, no horizontal scroll at the largest size.
import { expect, test } from '@playwright/test';
import { choose, noHorizontalScroll, skipWizard, smallTargets } from '../helpers/ui';
import { nav } from '../helpers/menu';

const rootSize = (page: import('@playwright/test').Page) => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);

test('22px applies at once, persists after reload, and keeps layouts within the screen', async ({ page }) => {
  await skipWizard(page);
  expect(await rootSize(page)).toBe('16px');
  await nav(page, 'settings');
  await choose(page, 'settings-font', 22);
  expect(await rootSize(page)).toBe('22px');
  await expect(page.getByTestId('font-preview')).toBeVisible();
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);

  await page.reload();
  expect(await rootSize(page)).toBe('22px');
  await expect(page.getByTestId('settings-font').locator('[data-value="22"]')).toHaveAttribute('aria-pressed', 'true');

  await nav(page, 'home');
  await expect(page.getByTestId('today-text')).not.toBeEmpty({ timeout: 20_000 });
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);

  await nav(page, 'read');
  await expect(page.getByTestId('viewer')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('picker-toggle').click();
  await noHorizontalScroll(page);

  await nav(page, 'settings');
  await page.getByTestId('wizard-reopen').click();
  await expect(page.getByTestId('wizard-language')).toBeVisible();
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
});

test('every font option applies to the root only', async ({ page }) => {
  await skipWizard(page);
  await nav(page, 'settings');
  for (const px of [18, 20, 16]) {
    await choose(page, 'settings-font', px);
    expect(await rootSize(page)).toBe(`${px}px`);
  }
});
