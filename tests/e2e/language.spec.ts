// S02: language switching, default bible rules, persistence (DESIGN 3.12).
import { expect, test } from '@playwright/test';
import en from '../../src/i18n/en.json' with { type: 'json' };
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { choose, skipWizard } from '../helpers/ui';
import { chooseReaderBible, nav } from '../helpers/menu';

test.describe('device language en-US', () => {
  test.use({ locale: 'en-US' });
  test('recommends English and KJV on first run', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(en.wizard.language.title)).toBeVisible();
    await expect(page.getByTestId('wizard-language-choices').locator('[data-value="en"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('wizard-bible-choices').locator('[data-value="kjv"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test('switching language in the wizard updates the screen at once', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(ko.wizard.language.title)).toBeVisible();
  await choose(page, 'wizard-language-choices', 'en');
  await expect(page.getByText(en.wizard.language.title)).toBeVisible();
  await expect(page.getByTestId('wizard-skip')).toHaveText(en.wizard.skip);
  await page.getByTestId('wizard-next').click();
  // Language changed without a direct bible choice → English default.
  await expect(page.getByTestId('wizard-bible-choices').locator('[data-value="kjv"]')).toHaveAttribute('aria-pressed', 'true');
});

test('settings: language switch is immediate, changes the default bible, and persists', async ({ page }) => {
  await skipWizard(page);
  await nav(page, 'settings');
  await choose(page, 'settings-language', 'en');
  await expect(page.getByTestId('menu-open')).toHaveAttribute('aria-label', en.menu.open);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.getByTestId('menu-open')).toHaveAttribute('aria-label', en.menu.open);
  await nav(page, 'read');
  await expect(page.getByTestId('chapter-title')).toHaveText('John 1', { timeout: 20_000 });
  // The language default changed the reading bible to KJV (shown in the reader toolbar).
  await expect(page.getByTestId('reader-bible-toggle')).toContainText(en.bible_short.kjv);
});

test('a bible chosen directly in the reader is kept when the language changes', async ({ page }) => {
  await skipWizard(page);
  await nav(page, 'read');
  await expect(page.getByTestId('chapter-title')).toHaveText('요한복음 1장', { timeout: 20_000 });
  await chooseReaderBible(page, 'kjv');
  await expect(page.locator('[data-verse="1"]')).toContainText('In the beginning');
  await nav(page, 'settings');
  await choose(page, 'settings-language', 'en');
  await choose(page, 'settings-language', 'ko');
  await page.reload();
  await nav(page, 'read');
  await expect(page.getByTestId('chapter-title')).toHaveText('요한복음 1장', { timeout: 20_000 });
  await expect(page.locator('[data-verse="1"]')).toContainText('In the beginning');
  await page.getByTestId('reader-bible-toggle').click();
  await expect(page.getByTestId('reader-bible').locator('[data-value="kjv"]')).toHaveAttribute('aria-pressed', 'true');
});
