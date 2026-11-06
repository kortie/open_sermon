// S08: without a key, the wizard and settings make no external request (CLAUDE.md rules 2, 18).
// Every non-app request is recorded and blocked.
import { expect, test } from '@playwright/test';
import { blockExternalRequests } from '../helpers/network';
import { nav, openBookPanel } from '../helpers/menu';

test('walking steps 1–6 and skipping makes 0 external requests; independent features work', async ({ page, baseURL }) => {
  const external = await blockExternalRequests(page, new URL(baseURL!).origin);
  await page.goto('/');
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-llm-use').click();
  await page.getByTestId('provider-anthropic').click();
  await page.getByTestId('wizard-next').click(); // provider
  await page.getByTestId('wizard-next').click(); // get_key (links not tapped)
  await page.getByTestId('key-input').fill('sk-ant-api03-network-test-key');
  await page.getByTestId('wizard-skip').click();
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.getByTestId('today-text')).not.toBeEmpty({ timeout: 20_000 });
  await page.goto('/#/settings?section=connection');
  await expect(page.getByTestId('connection-none')).toBeVisible();
  await nav(page, 'read');
  await openBookPanel(page);
  await page.getByTestId('ref-input').fill('요 3:16');
  await page.getByTestId('ref-go').click();
  await expect(page.getByTestId('chapter-title')).toHaveText('요한복음 3장');
  expect(external).toEqual([]);
});
