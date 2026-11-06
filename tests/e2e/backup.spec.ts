// S06: settings → export → save the file → fresh storage (another "device") → import → restored.
// Also: the lost-password notice gates export, password rules, wrong password, mobile layout.
import { expect, test, type Page } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { createPersona, uploadSermon } from '../helpers/flow';
import { noHorizontalScroll, smallTargets } from '../helpers/ui';

const PW = '백업암호-2026-안전';

async function openBackup(page: Page) {
  await page.goto('/#/settings?section=backup');
  await expect(page.getByTestId('settings-backup')).toBeVisible({ timeout: 20_000 });
}

async function exportFile(page: Page): Promise<string> {
  await openBackup(page);
  await page.getByTestId('backup-password').fill(PW);
  await page.getByTestId('backup-password2').fill(PW);
  await page.getByTestId('backup-lost-confirm').click();
  await page.getByTestId('backup-export').click();
  await expect(page.getByTestId('backup-save')).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-save').click()]);
  expect(download.suggestedFilename()).toMatch(/^open-sermon-\d{8}-\d{4}\.osbackup$/);
  const path = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(path);
  return path;
}

test('export, then restore into fresh storage: manuscripts and persona come back', async ({ page, browser, baseURL, locale, viewport, userAgent, isMobile, hasTouch, deviceScaleFactor }) => {
  await uploadSermon(page);
  await createPersona(page, '백업 성향');
  await expect(page.getByTestId('persona-status')).toHaveText(ko.persona.saved);
  const file = await exportFile(page);
  // The password fields are cleared after export.
  await expect(page.getByTestId('backup-password')).toHaveValue('');

  // Another device: a new context has empty IndexedDB and a new device key.
  const other = await browser.newContext({ baseURL, locale, viewport, userAgent, isMobile, hasTouch, deviceScaleFactor });
  const p2 = await other.newPage();
  await p2.goto('/#/sermons');
  await expect(p2.getByTestId('sermon-add')).toBeVisible({ timeout: 20_000 });
  await expect(p2.getByTestId('sermon-item')).toHaveCount(0);

  await openBackup(p2);
  await p2.getByTestId('backup-file').setInputFiles(file);
  await expect(p2.getByTestId('backup-import-password')).toBeVisible();
  await p2.getByTestId('backup-import-password').fill('틀린암호입니다만');
  await p2.getByTestId('backup-import').click();
  await expect(p2.getByTestId('backup-import-error')).toContainText(ko.backup.error.WRONG_PASSWORD, { timeout: 30_000 });
  await expect(p2.getByTestId('backup-import-error')).toContainText(ko.backup.unchanged);

  await p2.getByTestId('backup-import-password').fill(PW);
  await p2.getByTestId('backup-import').click();
  await expect(p2.getByTestId('backup-import-done')).toContainText(ko.backup.import_done.replace('{sermons}', '1').replace('{personas}', '1').replace('{library}', '0').replace('{outlines}', '0'), {
    timeout: 30_000,
  });
  await noHorizontalScroll(p2);

  await p2.goto('/#/sermons');
  await expect(p2.getByTestId('sermon-item')).toHaveCount(1);
  await expect(p2.getByTestId('sermon-item')).toContainText('포도나무 설교');
  await p2.goto('/#/persona');
  await expect(p2.getByText('백업 성향')).toBeVisible();

  // Importing the same file again with the default (keep) changes nothing.
  await openBackup(p2);
  await p2.getByTestId('backup-file').setInputFiles(file);
  await p2.getByTestId('backup-import-password').fill(PW);
  await p2.getByTestId('backup-import').click();
  await expect(p2.getByTestId('backup-import-done')).toContainText(ko.backup.import_skipped.replace('{n}', '2'), { timeout: 30_000 });
  await other.close();
});

test('the lost-password notice is always shown and must be confirmed; password rules', async ({ page }) => {
  await openBackup(page);
  await expect(page.getByTestId('backup-lost-notice')).toHaveText(ko.backup.lost_notice);
  await expect(page.getByTestId('backup-export')).toBeDisabled();
  await page.getByTestId('backup-lost-confirm').click();
  await expect(page.getByTestId('backup-lost-confirm')).toHaveAttribute('aria-checked', 'true');

  await page.getByTestId('backup-password').fill('1234567');
  await page.getByTestId('backup-password2').fill('1234567');
  await page.getByTestId('backup-export').click();
  await expect(page.getByTestId('backup-export-error')).toHaveText(ko.backup.error.too_short);

  await page.getByTestId('backup-password').fill('12345678');
  await page.getByTestId('backup-password2').fill('12345670');
  await page.getByTestId('backup-export').click();
  await expect(page.getByTestId('backup-export-error')).toHaveText(ko.backup.error.mismatch);
  await expect(page.getByTestId('backup-save')).toHaveCount(0);
  // No provider keys exist yet (S08), so the key option is not offered.
  await expect(page.getByTestId('backup-include-keys')).toHaveCount(0);
});

test('a non-backup file is refused with its own message', async ({ page }) => {
  await openBackup(page);
  await page.getByTestId('backup-file').setInputFiles({ name: 'photo.osbackup', mimeType: 'application/octet-stream', buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByTestId('backup-import-error')).toContainText(ko.backup.error.NOT_BACKUP);
  await expect(page.getByTestId('backup-import-password')).toHaveCount(0);
  await page.getByTestId('backup-file').setInputFiles({ name: 'cut.osbackup', mimeType: 'application/octet-stream', buffer: Buffer.from('{"format":"open-sermon-backup","vers') });
  await expect(page.getByTestId('backup-import-error')).toContainText(ko.backup.error.CORRUPTED);
});

test('backup panel: no horizontal scroll at the largest font, targets ≥ 44 px', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByTestId('settings-font').locator('[data-value="22"]').click();
  await openBackup(page);
  await page.getByTestId('backup-file').setInputFiles({ name: 'x.osbackup', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await expect(page.getByTestId('backup-import-error')).toBeVisible();
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
});
