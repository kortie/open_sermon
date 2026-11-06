import type { Page } from '@playwright/test';

/**
 * Record and block every request whose origin differs from the app's origin
 * (CLAUDE.md rule 2: only LLM provider calls may leave the device, and only from generation features).
 * Returns the live list of blocked URLs.
 */
export async function blockExternalRequests(page: Page, appOrigin: string): Promise<string[]> {
  const external: string[] = [];
  await page.context().route('**/*', (route) => {
    const url = route.request().url();
    const origin = new URL(url).origin;
    if (origin === appOrigin || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    external.push(url);
    return route.abort('blockedbyclient');
  });
  return external;
}

/** Wait until the service worker controls the page (precache done). */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  }
}
