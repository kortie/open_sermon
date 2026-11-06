// S16: About screen (DESIGN 3.17) — reachable from the side menu, shows the studio, version, license
// with its full text and the open-source notices (bundled files, same origin). The coffee card
// exists only in the Android app with the Billing plugin, so the browser build never shows it.
// Nothing is requested from outside the app.
import { expect, test } from '@playwright/test';
import { nav } from '../helpers/menu';

test.use({ serviceWorkers: 'block' });

test('splash shows the studio and gives way to the app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('wizard-skip')).toBeVisible();
  await expect(page.locator('.splash')).toHaveCount(0);
});

test('About: studio, license text, notices, no coffee in the browser, no external requests', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) external.push(r.url());
  });
  await page.goto('/');
  await page.getByTestId('wizard-skip').click();
  await expect(page.getByTestId('home')).toBeVisible();
  await nav(page, 'about');
  await expect(page).toHaveURL(/#\/about/);
  await expect(page.getByTestId('about-studio')).toContainText('JuanStudio');
  await expect(page.getByTestId('about-version')).toBeVisible();
  await expect(page.getByTestId('about-license')).toContainText('Apache-2.0');
  await expect(page.getByTestId('about-coffee')).toHaveCount(0);

  await page.getByTestId('about-show-app').click();
  await expect(page.getByTestId('about-license-app')).toContainText('Apache License');
  await expect(page.getByTestId('about-license-app')).toContainText('JuanStudio');
  await page.getByTestId('about-show-third_party').click();
  await expect(page.getByTestId('about-license-app')).toHaveCount(0);
  await expect(page.getByTestId('about-license-third_party')).toContainText('sql.js');
  await page.getByTestId('about-show-third_party').click();
  await expect(page.getByTestId('about-license-third_party')).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(external).toEqual([]);
});

test('About: the mail button appears only for a real address', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('wizard-skip').click();
  await page.goto('/#/about');
  await expect(page.getByTestId('about')).toBeVisible();
  const email = page.getByTestId('about-email');
  await expect(email.or(page.getByTestId('about-email-none'))).toBeVisible();
  if (await email.count()) {
    await expect(page.getByTestId('about-email-link')).toHaveAttribute('href', /^mailto:[^@\s]+@[^@\s]+$/);
  } else {
    await expect(page.getByTestId('about-email-link')).toHaveCount(0);
  }
});
