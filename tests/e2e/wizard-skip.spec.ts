// S02/S08: setup wizard skipping and reopening (DESIGN 3.13, CLAUDE.md rule 18). Steps 4–9: wizard-llm.spec.ts.
import { expect, test, type Page } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { choose, noHorizontalScroll, smallTargets, smallText } from '../helpers/ui';
import { nav, openBookPanel } from '../helpers/menu';

async function independentFeaturesWork(page: Page) {
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.getByTestId('today-text')).not.toBeEmpty({ timeout: 20_000 });
  await page.getByTestId('home-search-input').fill('사랑');
  await page.getByTestId('home-search-go').click();
  await expect(page.getByTestId('search-results')).toBeVisible({ timeout: 20_000 });
  await nav(page, 'read');
  await openBookPanel(page);
  await page.getByTestId('ref-input').fill('요 3:16');
  await page.getByTestId('ref-go').click();
  await expect(page.getByTestId('chapter-title')).toHaveText('요한복음 3장');
}

test('first run opens the wizard at step 1', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('wizard-language')).toBeVisible();
  await expect(page.getByText(ko.wizard.language.title)).toBeVisible();
  await expect(page.getByTestId('menu-open')).toHaveCount(0);
});

for (const [n, step] of [
  [1, 'language'],
  [2, 'bible'],
  [3, 'llm_choice'],
] as const) {
  test(`skipping at step ${n} lands on home and independent features work`, async ({ page }) => {
    await page.goto('/');
    for (let i = 1; i < n; i++) await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId(`wizard-${step}`)).toBeVisible();
    await page.getByTestId('wizard-skip').click();
    await independentFeaturesWork(page);
    // Skipped wizard does not come back on the next launch.
    await page.goto('/');
    await expect(page.getByTestId('home')).toBeVisible();
  });
}

for (const [n, step] of [
  [4, 'provider'],
  [5, 'get_key'],
  [6, 'paste_key'],
] as const) {
  test(`"use AI" then skipping at step ${n} lands on home; independent features work`, async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-llm-use').click();
    for (let i = 4; i < n; i++) await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId(`wizard-${step}`)).toBeVisible();
    await expect(page.getByText(ko.wizard.step.replace('{n}', String(n)))).toBeVisible();
    await page.getByTestId('wizard-skip').click();
    await independentFeaturesWork(page);
  });
}

test('"skip for now" at step 3 finishes the wizard', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-llm-skip').click();
  await expect(page.getByTestId('home')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('home')).toBeVisible();
});

test('back returns to the previous step and the bible choice is kept', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('wizard-next').click();
  await choose(page, 'wizard-bible-choices', 'kjv');
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-back').click();
  await expect(page.getByTestId('wizard-bible')).toBeVisible();
  await expect(page.getByTestId('wizard-bible-choices').locator('[data-value="kjv"]')).toHaveAttribute('aria-pressed', 'true');
});

test('the wizard can be reopened from settings', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('wizard-skip').click();
  await nav(page, 'settings');
  await page.getByTestId('wizard-reopen').click();
  await expect(page.getByTestId('wizard-language')).toBeVisible();
  await page.getByTestId('wizard-skip').click();
  await expect(page.getByTestId('home')).toBeVisible();
});

test('wizard screens have no horizontal scroll and 44px targets', async ({ page }) => {
  await page.goto('/');
  for (const step of ['language', 'bible', 'llm_choice']) {
    await expect(page.getByTestId(`wizard-${step}`)).toBeVisible();
    await noHorizontalScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    expect(await smallText(page)).toEqual([]);
    if (step !== 'llm_choice') await page.getByTestId('wizard-next').click();
  }
  await page.getByTestId('wizard-llm-use').click();
  for (const step of ['provider', 'get_key', 'paste_key']) {
    await expect(page.getByTestId(`wizard-${step}`)).toBeVisible();
    await noHorizontalScroll(page);
    expect(await smallTargets(page)).toEqual([]);
    expect(await smallText(page)).toEqual([]);
    await page.getByTestId('wizard-next').click();
  }
});

test('home text is at least 16px', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('wizard-skip').click();
  await expect(page.getByTestId('today-text')).not.toBeEmpty({ timeout: 20_000 });
  expect(await smallText(page)).toEqual([]);
});
