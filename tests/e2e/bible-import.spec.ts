// S11: txt bible import (5 steps), reading and searching the imported bible, deletion, the backup
// option and the version guide. Fixtures are synthetic text. No external request is made.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import sources from '../../config/bible-sources.json' with { type: 'json' };
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { blockExternalRequests } from '../helpers/network';
import { choose, noHorizontalScroll, skipWizard, smallTargets } from '../helpers/ui';

const FIX = 'tests/fixtures/bible-import';
const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(p[k]));
const NAME = '합성 시험 역본';

async function openImport(page: Page) {
  await page.goto('/#/settings');
  await page.getByTestId('open-bible-import').click();
  await expect(page.getByTestId('bible-import')).toHaveAttribute('data-step', '1');
}

/** Steps 1–3 with a file, then the check (step 4). */
async function toPreview(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }, name = NAME) {
  await page.getByTestId('import-file').setInputFiles(typeof file === 'string' ? `${FIX}/${file}` : file);
  await page.getByTestId('import-next').click();
  await page.getByTestId('import-name').fill(name);
  await page.getByTestId('import-next').click();
  await page.getByTestId('import-rights').click();
  await page.getByTestId('import-next').click();
  await expect(page.getByTestId('bible-import')).toHaveAttribute('data-step', '4');
}

async function importFixture(page: Page, file: string, name = NAME) {
  await openImport(page);
  await toPreview(page, file, name);
  await page.getByTestId('import-save').click();
  await expect(page.getByTestId('import-done')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await skipWizard(page);
});

test('sample → 5 steps → my imported version → chapter view and search; 0 external requests', async ({ page, baseURL }) => {
  const external = await blockExternalRequests(page, new URL(baseURL!).origin);
  await openImport(page);
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);

  // Blank sample: comment and blank lines only.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('import-sample').click()]);
  expect(download.suggestedFilename()).toBe('bible-template.txt');
  const path = test.info().outputPath('sample.txt');
  await download.saveAs(path);
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  expect(lines.every((l) => l === '' || l.startsWith('# '))).toBe(true);
  expect(lines.some((l) => l.includes(ko.bible_import.sample.l01))).toBe(true);

  // Step 1: next only after a file.
  await expect(page.getByTestId('import-next')).toBeDisabled();
  await page.getByTestId('import-file').setInputFiles(`${FIX}/format-a.txt`);
  await expect(page.getByTestId('import-file-name')).toContainText('format-a.txt');
  await page.getByTestId('import-next').click();

  // Step 2: name and language.
  await expect(page.getByTestId('import-step')).toHaveText(fill(ko.bible_import.wizard.step, { n: 2 }));
  await page.getByTestId('import-name').fill('   ');
  await expect(page.getByTestId('import-next')).toBeDisabled();
  await page.getByTestId('import-name').fill(NAME);
  await choose(page, 'import-language', 'ko');
  await page.getByTestId('import-next').click();

  // Step 3: next stays disabled without the rights check.
  await expect(page.getByTestId('import-next')).toBeDisabled();
  await page.getByTestId('import-rights').click();
  await expect(page.getByTestId('import-rights')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('import-rights').click();
  await expect(page.getByTestId('import-next')).toBeDisabled();
  await page.getByTestId('import-rights').click();
  await expect(page.getByTestId('import-next')).toBeEnabled();
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
  await page.getByTestId('import-next').click();

  // Step 4: check and preview.
  await expect(page.getByTestId('import-encoding')).toHaveText(fill(ko.bible_import.wizard.encoding, { encoding: 'UTF-8' }));
  await expect(page.getByTestId('import-format')).toHaveText(fill(ko.bible_import.wizard.format, { format: 'A' }));
  await expect(page.getByTestId('import-counts')).toHaveText(fill(ko.bible_import.wizard.counts, { books: 3, verses: 6 }));
  await expect(page.getByTestId('import-verses')).toContainText('시험 문장 첫째 줄입니다');
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
  await page.getByTestId('import-save').click();

  // Step 5 → read with it.
  await expect(page.getByTestId('import-done')).toContainText(fill(ko.bible_import.wizard.done_text, { name: NAME }));
  await page.getByTestId('import-read').click();
  await expect(page.getByTestId('viewer')).toBeVisible();
  await expect(page.getByTestId('chapter-missing')).toBeVisible(); // John 1 is not in this partial bible

  await page.goto('/#/read?ref=GEN%201:1');
  await expect(page.getByTestId('verses')).toContainText('시험 문장 첫째 줄입니다');
  await expect(page.getByTestId('verses').locator('li')).toHaveCount(3);
  // Next chapter skips to the next one present (Genesis 2).
  await page.getByTestId('next-chapter').click();
  await expect(page.getByTestId('verses')).toContainText('English name line for testing');

  await page.goto(`/#/search?q=${encodeURIComponent('약어로')}`);
  await expect(page.getByTestId('search-results')).toContainText('약어로 쓴 셋째 줄입니다');

  // Reader toolbar: listed as my imported version and selected (S12); settings list it for managing.
  await page.goto('/#/read');
  await expect(page.getByTestId('reader-bible-toggle')).toContainText(NAME, { timeout: 20_000 });
  await page.getByTestId('reader-bible-toggle').click();
  const option = page.getByTestId('reader-bible').getByRole('button', { name: fill(ko.bible_import.label, { name: NAME }) });
  await expect(option).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/#/settings');
  await expect(page.getByTestId('imported-bible')).toContainText(NAME);
  await noHorizontalScroll(page);
  expect(external).toEqual([]);
});

test('EUC-KR file reads like the UTF-8 one and shows its encoding', async ({ page }) => {
  await openImport(page);
  await toPreview(page, 'format-b-euckr.txt');
  await expect(page.getByTestId('import-encoding')).toHaveText(fill(ko.bible_import.wizard.encoding, { encoding: ko.bible_import.wizard.encoding_name['euc-kr'] }));
  await expect(page.getByTestId('import-format')).toHaveText(fill(ko.bible_import.wizard.format, { format: 'B' }));
  await expect(page.getByTestId('import-verses')).toContainText('시험 문장 첫째 줄입니다');
});

test('rejections: other file types at step 1, mixed layout, more than 20% warnings', async ({ page }) => {
  await openImport(page);
  await page.getByTestId('import-file').setInputFiles({ name: 'bible.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('PK') });
  await expect(page.getByTestId('import-error')).toHaveText(ko.bible_import.wizard.error.UNSUPPORTED_TYPE);
  await expect(page.getByTestId('import-next')).toBeDisabled();

  await toPreview(page, 'mixed.txt');
  await expect(page.getByTestId('import-error')).toHaveText(ko.bible_import.wizard.error.MIXED_FORMAT);
  await expect(page.getByTestId('import-save')).toBeDisabled();

  await openImport(page);
  const body = ['창세기 1:1 가', '창세기 1:2 나', '창세기 1:3 다', '창세기 99:1 라', '창세기 98:1 마'].join('\n');
  await toPreview(page, { name: 'warn.txt', mimeType: 'text/plain', buffer: Buffer.from(body) });
  await expect(page.getByTestId('import-too-many')).toHaveText(ko.bible_import.wizard.too_many);
  await expect(page.getByTestId('import-ratio')).toHaveText(fill(ko.bible_import.wizard.ratio, { n: 40 }));
  await expect(page.getByTestId('import-save')).toBeDisabled();
});

test('delete: the bible and its text go; the chosen bible returns to the default', async ({ page }) => {
  await importFixture(page, 'format-a.txt');
  await page.getByTestId('import-read').click();
  await expect(page.getByTestId('viewer')).toBeVisible();
  await page.goto('/#/settings');
  await page.getByTestId('imported-bible-delete').click();
  await expect(page.getByTestId('imported-bible-confirm')).toContainText(fill(ko.bible_import.delete_confirm, { name: NAME }));
  await page.getByTestId('imported-bible-delete-yes').click();
  await expect(page.getByTestId('imported-bible')).toHaveCount(0);
  await expect(page.getByTestId('imported-bibles-status')).toContainText(ko.settings.bible_reset_notice);
  await page.goto('/#/read');
  await expect(page.getByTestId('reader-bible-toggle')).toContainText(ko.bible_short.krv, { timeout: 20_000 });
  const verses = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const r = indexedDB.open('open_sermon');
        r.onsuccess = () => {
          const c = r.result.transaction('imported_verse').objectStore('imported_verse').count();
          c.onsuccess = () => resolve(c.result);
          c.onerror = () => reject(c.error);
        };
      }),
  );
  expect(verses).toBe(0);
  await page.goto('/#/read?ref=GEN%201:1');
  await expect(page.getByTestId('verses')).not.toContainText('시험 문장');
});

test('backup: imported bibles are left out unless chosen, with one more confirmation', async ({ page }) => {
  await importFixture(page, 'format-a.txt');
  await page.goto('/#/settings?section=backup');
  const option = page.getByTestId('backup-include-bibles');
  await expect(option).toHaveAttribute('aria-checked', 'false');
  await option.click();
  await expect(page.getByTestId('backup-bibles-confirm')).toContainText(ko.backup.bibles_confirm_text);
  await page.getByTestId('backup-bibles-yes').click();
  await expect(option).toHaveAttribute('aria-checked', 'true');
  await option.click();
  await expect(option).toHaveAttribute('aria-checked', 'false');
});

test('guide: read links for all with one, download only for verified public-domain entries; nothing is requested', async ({ page, baseURL }) => {
  const external = await blockExternalRequests(page, new URL(baseURL!).origin);
  await page.goto('/#/settings');
  await page.getByTestId('open-bible-guide').click();
  await expect(page.getByTestId('bible-guide')).toBeVisible();
  for (const s of sources) {
    const read = page.getByTestId(`guide-read-${s.id}`);
    const download = page.getByTestId(`guide-download-${s.id}`);
    if (s.read_url) {
      await expect(read).toHaveAttribute('href', s.read_url);
      await expect(read).toHaveAttribute('target', '_blank');
      await expect(read).toHaveAttribute('rel', 'noopener noreferrer');
    } else await expect(read).toHaveCount(0);
    const verified = s.rights === 'public_domain' && s.verified_on !== '' && s.download_url !== '';
    await expect(download).toHaveCount(verified ? 1 : 0);
    if (verified) await expect(download).toHaveAttribute('href', s.download_url);
  }
  await expect(page.getByTestId('guide-download-nkrv')).toHaveCount(0);
  await expect(page.getByTestId('guide-download-kjv')).toHaveCount(1);
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
  expect(external).toEqual([]);
});
