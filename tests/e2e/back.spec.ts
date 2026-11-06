// S17: back key (DESIGN 8장). The Android back key arrives as the window event `app:back`; here the
// test sends that event the way src/app/platform.ts does. One press undoes one thing: the newest
// in-screen state first, then the previous screen.
import { expect, test, type Page } from '@playwright/test';
import { selectWithChecks } from '../helpers/flow';
import { nav, openBookPanel } from '../helpers/menu';

test.use({ serviceWorkers: 'block' });

const back = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('app:back')));

async function skipWizard(page: Page) {
  await page.goto('/');
  await page.getByTestId('wizard-skip').click();
  await expect(page.getByTestId('home')).toBeVisible();
}

test('wizard: back goes to the previous step; at the first step it stays', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('wizard-language-choices')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('wizard-bible-choices')).toBeVisible();
  await back(page);
  await expect(page.getByTestId('wizard-language-choices')).toBeVisible();
  await back(page); // first screen: the app would be left; the browser stays
  await expect(page.getByTestId('wizard-language-choices')).toBeVisible();
  await expect(page).toHaveURL(/#\/wizard/);
});

test('menu: back closes the menu; then back returns to the previous screen', async ({ page }) => {
  await skipWizard(page);
  await nav(page, 'settings');
  await page.getByTestId('menu-open').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  await back(page);
  await expect(page.getByTestId('menu')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/settings/);
  await back(page);
  await expect(page.getByTestId('home')).toBeVisible();
});

test('reader: back closes the book panel, then clears the selection, then leaves the reader', async ({ page }) => {
  await skipWizard(page);
  await selectWithChecks(page, '요 15', [1, 2]);
  await openBookPanel(page);
  await back(page);
  await expect(page.getByTestId('ref-input')).toHaveCount(0);
  await expect(page.getByTestId('action-bar')).toBeVisible();
  await back(page);
  await expect(page.getByTestId('action-bar')).toHaveCount(0);
  await expect(page.getByTestId('chapter-title')).toBeVisible();
  await back(page);
  await expect(page.getByTestId('home')).toBeVisible();
});

test('forms: back closes the add form before leaving the screen', async ({ page }) => {
  await skipWizard(page);
  await page.goto('/#/library');
  await page.getByTestId('library-add').click();
  await expect(page.getByTestId('library-add')).toHaveCount(0);
  await back(page);
  await expect(page.getByTestId('library-add')).toBeVisible();
  await expect(page).toHaveURL(/#\/library/);

  await nav(page, 'sermons');
  await page.getByTestId('sermon-add').click();
  await expect(page.getByTestId('sermon-cancel')).toBeVisible();
  await back(page);
  await expect(page.getByTestId('sermon-add')).toBeVisible();
  await back(page);
  await expect(page).toHaveURL(/#\/library/);
});

test('about: back folds the open license text first', async ({ page }) => {
  await skipWizard(page);
  await nav(page, 'about');
  await page.getByTestId('about-show-app').click();
  await expect(page.getByTestId('about-license-app')).toBeVisible();
  await back(page);
  await expect(page.getByTestId('about-license-app')).toHaveCount(0);
  await back(page);
  await expect(page.getByTestId('home')).toBeVisible();
});
