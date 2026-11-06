// S05 deploy gate: the whole independent flow with every non-app request blocked, and again
// offline after a reload (service worker). Reader → search → selection → sermon upload →
// Search My Sermons → Message Outline → library → persona → sermon deletion.
import { expect, test, type Page } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import {
  addLibraryItem,
  createPersona,
  deleteAllSermons,
  fillAndSaveOutline,
  retrieveIntoOutline,
  selectWithChecks,
  uploadSermon,
} from '../helpers/flow';
import { blockExternalRequests, waitForServiceWorker } from '../helpers/network';

async function scenario(page: Page) {
  // Reader and verse search.
  await page.goto(`/#/read?ref=${encodeURIComponent('롬 8:28')}`);
  await expect(page.getByTestId('chapter-title')).toHaveText('로마서 8장', { timeout: 20_000 });
  await page.getByRole('button', { name: ko.viewer.tab_search }).click();
  await page.getByTestId('search-input').fill('포도나무');
  await page.getByTestId('search-go').click();
  await expect(page.getByTestId('search-results')).toBeVisible();
  // Upload, selection, Search My Sermons, outline.
  await uploadSermon(page);
  await selectWithChecks(page, '요 15', [1, 2, 5]);
  await retrieveIntoOutline(page);
  await fillAndSaveOutline(page, '오프라인 구성표');
  await page.goto('/#/outline');
  await expect(page.getByTestId('outline-item').filter({ hasText: '오프라인 구성표' })).toHaveCount(1);
  // Library from the action bar.
  await page.goto('/#/library');
  await addLibraryItem(page, 'one_liner', '붙어 있는 가지가 열매를 맺습니다.', '요 15:5');
  await selectWithChecks(page, '요 15', [5]);
  await page.getByTestId('action-remark').click();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  // Persona.
  await createPersona(page, '오프라인 성향');
  await expect(page.getByTestId('persona-status')).toHaveText(ko.persona.saved);
  await page.getByTestId('persona-use').first().click();
  await expect(page.getByTestId('persona-use').first()).toHaveAttribute('aria-pressed', 'true');
  // Sermon deletion also cleans the outline.
  await deleteAllSermons(page);
  await page.goto('/#/outline');
  await page.getByTestId('outline-open').first().click();
  await expect(page.getByTestId('outline-editor')).toBeVisible();
  await expect(page.getByTestId('outline-quote-excerpt')).toHaveCount(0);
}

test('independent flow makes zero requests outside the app origin', async ({ page, baseURL }) => {
  const external = await blockExternalRequests(page, new URL(baseURL!).origin);
  await scenario(page);
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
});

test('after install, the independent flow works offline after a reload', async ({ page, context }) => {
  await page.goto('/#/read');
  await waitForServiceWorker(page);
  await expect(page.getByTestId('viewer')).toBeVisible({ timeout: 20_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('viewer')).toBeVisible({ timeout: 20_000 });
  await scenario(page);
  await context.setOffline(false);
});
