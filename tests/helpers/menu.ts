// S12 layout helpers: the menu opens from the floating button; the reference input sits in the
// reader's book panel.
import { expect, type Page } from '@playwright/test';

/** Open the side menu and go to a menu item (home, read, sermons, settings). */
export async function nav(page: Page, name: 'home' | 'read' | 'sermons' | 'settings') {
  await page.getByTestId('menu-open').click();
  await page.getByTestId(`nav-${name}`).click();
  await expect(page.getByTestId('menu')).toHaveCount(0);
}

/** Make sure the reader's book panel (picker + reference input) is open. */
export async function openBookPanel(page: Page) {
  const toggle = page.getByTestId('picker-toggle');
  await expect(toggle).toBeVisible({ timeout: 20_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(page.getByTestId('ref-input')).toBeVisible();
}

/** Choose the reading bible in the reader's toolbar. */
export async function chooseReaderBible(page: Page, value: string) {
  await page.getByTestId('reader-bible-toggle').click();
  await page.getByTestId('reader-bible').locator(`[data-value="${value}"]`).click();
  await expect(page.getByTestId('reader-bible-panel')).toHaveCount(0);
}
