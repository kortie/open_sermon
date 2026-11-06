import { expect, test } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { waitForServiceWorker } from '../helpers/network';

test('shell opens with the Korean title and has no horizontal scroll', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ko.app.title);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('base font size is 16px (DESIGN 3.16)', async ({ page }) => {
  await page.goto('/');
  const size = await page.evaluate(() => getComputedStyle(document.body).fontSize);
  expect(size).toBe('16px');
});

test('CSP meta is present in the served page', async ({ page }) => {
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
});

test('no CSP violations while loading the shell', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content[- ]Security[- ]Policy|Refused to/i.test(msg.text())) violations.push(msg.text());
  });
  await page.goto('/');
  await expect(page.getByTestId('shell-main')).toBeVisible();
  expect(violations).toEqual([]);
});

test('shell opens offline after the service worker is installed', async ({ page, context }) => {
  await page.goto('/');
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ko.app.title);
  await expect(page.getByTestId('shell-main')).toBeVisible();
  await context.setOffline(false);
});
