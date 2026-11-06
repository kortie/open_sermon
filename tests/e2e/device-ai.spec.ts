// S15: on-device AI exists only in the app with the native plugin (DESIGN 3.6.1). In the browser
// build there is no bridge: no settings panel, and without a key the short kinds still open the
// library, the draft still shows the no-connection notice. Nothing is sent.
import { expect, test } from '@playwright/test';
import { nav } from '../helpers/menu';

test.use({ serviceWorkers: 'block' });

test('browser build: no on-device AI panel, short kinds without a key open the library', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) external.push(r.url());
  });
  await page.goto('/');
  await page.getByTestId('wizard-skip').click();
  await expect(page.getByTestId('home')).toBeVisible();
  await nav(page, 'settings');
  await expect(page.getByTestId('settings-connection')).toBeVisible();
  await expect(page.getByTestId('settings-device-ai')).toHaveCount(0);

  await page.goto('/#/generate?ref=JHN%2015%3A1-5&kind=example');
  await expect(page).toHaveURL(/#\/library/);
  await page.goto('/#/generate?ref=JHN%2015%3A1-5&kind=sermon');
  await expect(page.getByTestId('generate-no-connection')).toBeVisible();
  await expect(page.getByTestId('no-connection-device')).toHaveCount(0);
  expect(external).toEqual([]);
});
