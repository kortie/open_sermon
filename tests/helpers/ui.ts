import { expect, type Page } from '@playwright/test';

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Visible buttons, inputs and links smaller than 44×44 px (CLAUDE.md 4.3). Inline text links are excluded. */
export async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('button, input, select, a.button, a.shell__nav-item')]
      .map((el) => ({ el: (el as HTMLElement).dataset.testid ?? el.textContent ?? el.tagName, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
      .map(({ el, r }) => `${el} ${Math.round(r.width)}x${Math.round(r.height)}`),
  );
}

/** Skip the first-run wizard from its first screen and land on home. */
export async function skipWizard(page: Page) {
  await page.goto('/');
  await page.getByTestId('wizard-skip').click();
  await expect(page.getByTestId('home')).toBeVisible();
}

export async function choose(page: Page, group: string, value: string | number) {
  const btn = page.getByTestId(group).locator(`[data-value="${value}"]`);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

/** Visible text elements whose computed font size is below `min` px (S02: wizard and home text ≥ 16px). */
export async function smallText(page: Page, min = 16): Promise<string[]> {
  return page.evaluate((min) =>
    [...document.querySelectorAll('[data-testid="shell-main"] :is(p, h2, h3, button, span, a, input, label, li)')]
      .filter((el) => (el as HTMLElement).offsetParent !== null && el.textContent?.trim())
      .map((el) => ({ t: el.textContent!.trim().slice(0, 20), s: parseFloat(getComputedStyle(el).fontSize) }))
      .filter(({ s }) => s < min)
      .map(({ t, s }) => `${t} ${s}px`),
  min);
}
