// S06: export and import make no external request (CLAUDE.md rule 2, skill local-backup §3).
// Every non-app request is recorded and blocked; the app must still finish both flows.
import { expect, test } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { uploadSermon } from '../helpers/flow';
import { blockExternalRequests } from '../helpers/network';

const PW = '네트워크-백업-암호';

test('export → import with external requests blocked: 0 external requests', async ({ page, baseURL }) => {
  const external = await blockExternalRequests(page, new URL(baseURL!).origin);
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await uploadSermon(page);
  await page.goto('/#/settings?section=backup');
  await page.getByTestId('backup-password').fill(PW);
  await page.getByTestId('backup-password2').fill(PW);
  await page.getByTestId('backup-lost-confirm').click();
  const before = requests.length;
  await page.getByTestId('backup-export').click();
  await expect(page.getByTestId('backup-save')).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-save').click()]);
  const path = test.info().outputPath('net.osbackup');
  await download.saveAs(path);
  // Export itself fetches nothing (the blob: link is local).
  expect(requests.slice(before).filter((u) => !u.startsWith('blob:'))).toEqual([]);

  const mid = requests.length;
  await page.getByTestId('backup-file').setInputFiles(path);
  await page.getByTestId('backup-import-password').fill(PW);
  await page.getByTestId('backup-import').click();
  await expect(page.getByTestId('backup-import-done')).toContainText(ko.backup.import_skipped.replace('{n}', '1'), { timeout: 30_000 });
  expect(requests.slice(mid)).toEqual([]);
  expect(external).toEqual([]);
});
