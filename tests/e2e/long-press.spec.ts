// S03: long-press multi-block selection, action bar, check area, local stats (DESIGN 3.1.1).
// Time is controlled with Playwright's fake clock; touches are dispatched directly.
import { expect, test, type Page } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { press, pointOn, tap, touch } from '../helpers/touch';
import { noHorizontalScroll, smallTargets } from '../helpers/ui';
import { nav, openBookPanel } from '../helpers/menu';

const verse = (page: Page, n: number) => page.locator(`[data-verse="${n}"]`);
const check = (page: Page, n: number) => page.getByTestId(`check-${n}`);
const ref = (page: Page) => page.getByTestId('action-ref').locator('span').first();

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __copied?: string };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          w.__copied = text;
        },
      },
    });
  });
  await page.clock.install();
  await page.goto(`/#/read?ref=${encodeURIComponent('GEN 1')}`);
  await expect(page.getByTestId('chapter-title')).toHaveText('창세기 1장', { timeout: 20_000 });
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
});

test('449 ms does not enter; 450 ms enters with aria-pressed and the action bar', async ({ page }) => {
  await press(page, verse(page, 5), 449);
  await expect(check(page, 5)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('action-bar')).toHaveCount(0);

  const p = await press(page, verse(page, 5), 450, false);
  await expect(check(page, 5)).toHaveAttribute('aria-pressed', 'true');
  await expect(check(page, 5)).toHaveAttribute('aria-label', '선택됨, 5절');
  await expect(page.getByTestId('action-bar')).toBeVisible();
  await expect(ref(page)).toHaveText('창 1:5');
  await touch(page, 'touchend', p.x, p.y);
  await expect(check(page, 5)).toHaveAttribute('aria-pressed', 'true');
});

test('moving 15 px before 450 ms cancels and leaves scrolling alone', async ({ page }) => {
  const p = await pointOn(verse(page, 5));
  await touch(page, 'touchstart', p.x, p.y);
  await page.clock.runFor(200);
  const notPrevented = await touch(page, 'touchmove', p.x, p.y - 15);
  expect(notPrevented).toBe(true);
  await page.clock.runFor(400);
  await touch(page, 'touchend', p.x, p.y - 15);
  await expect(check(page, 5)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('action-bar')).toHaveCount(0);
});

test('adjacent tap extends, distant tap adds a block, middle tap splits, tapping between merges', async ({ page }) => {
  await press(page, verse(page, 3), 500);
  await tap(page, verse(page, 4));
  await expect(ref(page)).toHaveText('창 1:3–4');
  await tap(page, verse(page, 2));
  await expect(ref(page)).toHaveText('창 1:2–4');
  await tap(page, verse(page, 7));
  await expect(ref(page)).toHaveText('창 1:2–4, 7');
  await tap(page, verse(page, 6));
  await tap(page, verse(page, 5));
  await expect(ref(page)).toHaveText('창 1:2–7');
  await tap(page, verse(page, 4));
  await expect(ref(page)).toHaveText('창 1:2–3, 5–7');
  await expect(check(page, 4)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('action-ref')).toContainText('5절 선택됨');
});

test('clear last, clear all, and tap on empty space end the selection', async ({ page }) => {
  await press(page, verse(page, 1), 500);
  await tap(page, verse(page, 2));
  await tap(page, verse(page, 6));
  await expect(ref(page)).toHaveText('창 1:1–2, 6');
  await page.getByTestId('action-clear-last').click();
  await expect(ref(page)).toHaveText('창 1:1–2');
  await page.getByTestId('action-clear-all').click();
  await expect(page.getByTestId('action-bar')).toHaveCount(0);

  await press(page, verse(page, 3), 500);
  await expect(page.getByTestId('action-bar')).toBeVisible();
  await tap(page, page.getByTestId('chapter-title'));
  await expect(page.getByTestId('action-bar')).toHaveCount(0);
  await expect(check(page, 3)).toHaveAttribute('aria-pressed', 'false');
});

test('dragging after the long press changes the range verse by verse', async ({ page }) => {
  const start = await press(page, verse(page, 3), 450, false);
  const to6 = await verse(page, 6).boundingBox();
  const prevented = !(await touch(page, 'touchmove', start.x, to6!.y + to6!.height / 2));
  expect(prevented).toBe(true);
  await expect(ref(page)).toHaveText('창 1:3–6');
  const to2 = await verse(page, 2).boundingBox();
  await touch(page, 'touchmove', start.x, to2!.y + to2!.height / 2);
  await expect(ref(page)).toHaveText('창 1:2–3');
  await touch(page, 'touchend', start.x, to2!.y + to2!.height / 2);
  await expect(ref(page)).toHaveText('창 1:2–3');
});

test('moving to another chapter clears the selection', async ({ page }) => {
  await press(page, verse(page, 3), 500);
  await expect(page.getByTestId('action-bar')).toBeVisible();
  await page.getByTestId('next-chapter').click();
  await expect(page.getByTestId('chapter-title')).toHaveText('창세기 2장');
  await expect(page.getByTestId('action-bar')).toHaveCount(0);
});

test('contextmenu is blocked in the reader only', async ({ page }) => {
  const fire = (selector: string) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel)!;
      return el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    }, selector);
  expect(await fire('[data-verse="3"] .verse__text')).toBe(false);
  await openBookPanel(page);
  expect(await fire('[data-testid="ref-input"]')).toBe(true);
});

test('the check area alone selects and clears (no long press)', async ({ page }) => {
  await check(page, 3).click();
  await expect(check(page, 3)).toHaveAttribute('aria-pressed', 'true');
  await expect(check(page, 3)).toHaveAccessibleName('선택됨, 3절');
  await check(page, 4).click();
  await check(page, 6).click();
  await expect(ref(page)).toHaveText('창 1:3–4, 6');
  await check(page, 4).click();
  await expect(ref(page)).toHaveText('창 1:3, 6');
  await check(page, 3).click();
  await check(page, 6).click();
  await expect(page.getByTestId('action-bar')).toHaveCount(0);
  await expect(check(page, 3)).toHaveAccessibleName('3절 선택');
});

test('copy puts the reference and the verse text on the clipboard; the other actions are enabled', async ({ page }) => {
  await check(page, 1).click();
  await check(page, 2).click();
  await check(page, 4).click();
  await expect(ref(page)).toHaveText('창 1:1–2, 4');
  await page.getByTestId('action-copy').click();
  await expect(page.getByTestId('action-status')).toHaveText(ko.selection.copied);
  const texts = await Promise.all([1, 2, 4].map((n) => verse(page, n).locator('.verse__text').textContent()));
  const copied = await page.evaluate(() => (window as unknown as { __copied?: string }).__copied);
  expect(copied).toBe(['창 1:1–2, 4', `1 ${texts[0]}`, `2 ${texts[1]}`, `4 ${texts[2]}`].join('\n'));
  for (const k of ['outline', 'my_sermons', 'illustrations', 'remark'] as const) {
    const b = page.getByTestId(`action-${k}`);
    await expect(b).toBeEnabled();
    await expect(b).toHaveText(ko.selection.action[k]);
  }
});

test('no horizontal scroll; check area and action bar buttons are at least 44×44 px', async ({ page }) => {
  await noHorizontalScroll(page);
  await press(page, verse(page, 3), 500);
  await tap(page, verse(page, 8));
  await expect(page.getByTestId('action-bar')).toBeVisible();
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
  const bar = await page.getByTestId('action-bar').boundingBox();
  const vw = page.viewportSize()!.width;
  expect(bar!.x).toBeGreaterThanOrEqual(0);
  expect(bar!.x + bar!.width).toBeLessThanOrEqual(vw + 0.5);
  // The last verse can still be scrolled above the bar.
  const last = page.locator('[data-verse]').last();
  await last.evaluate((n) => n.scrollIntoView({ block: 'end' }));
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const lastBox = await last.boundingBox();
  expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(bar!.y + 1);
});

test('settings shows local selection stats', async ({ page }) => {
  await press(page, verse(page, 3), 300); // cancelled attempt
  await press(page, verse(page, 3), 500); // entry
  await page.getByTestId('action-clear-all').click(); // abandoned
  await openBookPanel(page);
  await page.getByTestId('ref-input').fill('창 2:1');
  await page.getByTestId('ref-go').click();
  await nav(page, 'settings');
  await expect(page.getByTestId('stats-entrySuccess')).toHaveText('50%');
  await expect(page.getByTestId('stats-cancel')).toHaveText('100%');
  await expect(page.getByTestId('stats-directInput')).toHaveText('50%');
});
