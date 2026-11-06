import { expect, test, type Page } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { openBookPanel } from '../helpers/menu';

async function openViewer(page: Page) {
  await page.goto('/#/read');
  await expect(page.getByTestId('viewer')).toBeVisible({ timeout: 20_000 });
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function goRef(page: Page, ref: string) {
  await openBookPanel(page);
  await page.getByTestId('ref-input').fill(ref);
  await page.getByTestId('ref-go').click();
}

test('opens John 1 by default and shows the source footer', async ({ page }) => {
  await openViewer(page);
  await expect(page.getByTestId('chapter-title')).toHaveText('요한복음 1장');
  await expect(page.getByTestId('footer')).toContainText('성경전서 개역한글판 (대한성서공회)');
  await expect(page.getByTestId('footer')).toContainText('crizin/bible-db v1.0.1');
});

test('reference input opens the chapter and highlights the verses', async ({ page }) => {
  await openViewer(page);
  await goRef(page, '요 3:16');
  await expect(page.getByTestId('chapter-title')).toHaveText('요한복음 3장');
  const v16 = page.locator('[data-verse="16"]');
  await expect(v16).toHaveClass(/verse--highlight/);
  await expect(v16).toContainText('하나님이 세상을 이처럼 사랑하사');
  await expect(v16).toBeInViewport();

  await goRef(page, '요한복음 15장 1-3절, 5');
  await expect(page.getByTestId('chapter-title')).toHaveText('요한복음 15장');
  await expect(page.locator('.verse--highlight')).toHaveCount(4);
});

test('reference errors are shown in plain words', async ({ page }) => {
  await openViewer(page);
  await goRef(page, '없는책 1:1');
  await expect(page.getByTestId('ref-error')).toHaveText(ko.reference.error.UNKNOWN_BOOK);
  await goRef(page, '요 22:1');
  await expect(page.getByTestId('ref-error')).toHaveText(ko.reference.error.OUT_OF_RANGE);
  await goRef(page, '요 3:16');
  await expect(page.getByTestId('ref-error')).toHaveCount(0);
});

test('previous and next chapter cross book boundaries', async ({ page }) => {
  await openViewer(page);
  await goRef(page, '창 50');
  await page.getByTestId('next-chapter').click();
  await expect(page.getByTestId('chapter-title')).toHaveText('출애굽기 1장');
  await page.getByTestId('prev-chapter').click();
  await expect(page.getByTestId('chapter-title')).toHaveText('창세기 50장');
  await goRef(page, '창 1');
  await expect(page.getByTestId('prev-chapter')).toBeDisabled();
  await goRef(page, '계 22');
  await expect(page.getByTestId('next-chapter')).toBeDisabled();
});

test('book and chapter picker', async ({ page }) => {
  await openViewer(page);
  await page.getByTestId('picker-toggle').click();
  await page.getByTestId('pick-book-19').click();
  await expect(page.getByTestId('picker-panel').getByRole('button')).toHaveCount(150 + 1);
  await page.getByTestId('pick-chapter-23').click();
  await expect(page.getByTestId('chapter-title')).toHaveText('시편 23장');
  await expect(page.getByTestId('picker-panel')).toHaveCount(0);
  await noHorizontalScroll(page);
});

test('keyword search → tap a result → that verse in its chapter', async ({ page }) => {
  await openViewer(page);
  await page.getByRole('button', { name: ko.viewer.tab_search }).click();
  await page.getByTestId('search-input').fill('독생자를 주셨으니');
  await page.getByTestId('search-go').click();
  const results = page.getByTestId('search-results').getByRole('button');
  await expect(results).toHaveCount(1);
  await expect(results.first()).toContainText('요한복음 3:16');
  await results.first().click();
  await expect(page.getByTestId('chapter-title')).toHaveText('요한복음 3장');
  await expect(page.locator('[data-verse="16"]')).toHaveClass(/verse--highlight/);
  await expect(page.locator('[data-verse="16"]')).toBeInViewport();
});

test('search pages with "show more" and handles special characters', async ({ page }) => {
  await openViewer(page);
  await page.getByRole('button', { name: ko.viewer.tab_search }).click();
  await page.getByTestId('search-input').fill('사랑');
  await page.getByTestId('search-go').click();
  const results = page.getByTestId('search-results').getByRole('button');
  await expect(results).toHaveCount(50);
  await page.getByRole('button', { name: ko.search.more }).click();
  await expect(results).toHaveCount(100);

  await page.getByTestId('search-input').fill("%' OR 1=1 --");
  await page.getByTestId('search-go').click();
  await expect(page.getByText(ko.search.no_results)).toBeVisible();
  await page.getByTestId('search-input').fill(' ');
  await page.getByTestId('search-go').click();
  await expect(page.getByTestId('search-error')).toHaveText(ko.search.error.EMPTY);
});

test('no horizontal scroll and buttons ≥ 44×44 px', async ({ page }) => {
  await openViewer(page);
  await goRef(page, '시 119');
  await page.getByTestId('picker-toggle').click();
  await noHorizontalScroll(page);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, select, input')]
      .map((el) => ({ el: (el as HTMLElement).dataset.testid ?? el.textContent ?? el.tagName, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
      .map(({ el, r }) => `${el} ${r.width}x${r.height}`),
  );
  expect(small).toEqual([]);
  await page.getByTestId('pick-book-52').click();
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: ko.viewer.tab_search }).click();
  await page.getByTestId('search-input').fill('사랑');
  await page.getByTestId('search-go').click();
  await expect(page.getByTestId('search-results')).toBeVisible();
  await noHorizontalScroll(page);
});

test('no CSP violations while loading the DB and searching', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content[- ]Security[- ]Policy|Refused to|WebAssembly/i.test(msg.text())) violations.push(msg.text());
  });
  await openViewer(page);
  await goRef(page, '요 3:16');
  await expect(page.locator('[data-verse="16"]')).toBeVisible();
  await page.getByTestId('picker-toggle').click();
  await page.getByTestId('pick-book-1').click();
  await page.getByRole('button', { name: ko.viewer.tab_search }).click();
  await page.getByTestId('search-input').fill('사랑');
  await page.getByTestId('search-go').click();
  await expect(page.getByTestId('search-results')).toBeVisible();
  expect(violations).toEqual([]);
});
