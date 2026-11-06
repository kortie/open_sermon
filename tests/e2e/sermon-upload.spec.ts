// S04: My Sermons — upload (txt, docx, text PDF, paste) → consent → masked preview → save → list → delete.
import { expect, test, type Page } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { choose, noHorizontalScroll, smallTargets } from '../helpers/ui';
import { nav } from '../helpers/menu';

const FIX = 'tests/fixtures/sermons';
const t = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(p[k]));

async function open(page: Page) {
  await page.goto('/#/sermons');
  await expect(page.getByTestId('sermon-empty')).toBeVisible({ timeout: 20_000 });
}

async function upload(page: Page, file: string) {
  await page.getByTestId('sermon-add').click();
  await page.getByTestId('sermon-file').setInputFiles(`${FIX}/${file}`);
  await expect(page.getByTestId('sermon-file-name')).toContainText(file);
}

test('full flow: consent gate, masked preview, manual hiding, save, list, delete', async ({ page }) => {
  await open(page);
  await noHorizontalScroll(page);
  await upload(page, 'sermon.txt');
  // Next stays disabled until the rights consent is checked.
  await expect(page.getByTestId('sermon-next')).toBeDisabled();
  await page.getByTestId('sermon-consent').click();
  await expect(page.getByTestId('sermon-consent')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('sermon-consent')).toContainText(ko.sermons.consent);
  await page.getByTestId('sermon-consent').click();
  await expect(page.getByTestId('sermon-next')).toBeDisabled();
  await page.getByTestId('sermon-consent').click();
  await expect(page.getByTestId('sermon-next')).toBeEnabled();
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
  await page.getByTestId('sermon-next').click();

  // Preview: masking applied and summarised.
  await expect(page.getByTestId('sermon-mask-summary')).toHaveText(t(ko.sermons.masked_summary, { name: 2, church: 1, contact: 3, address: 1 }));
  const text = page.getByTestId('sermon-text');
  await expect(text).toHaveValue(/\[이름\] 집사님/);
  await expect(text).not.toHaveValue(/010-1234-5678|김철수|예시가상교회/);
  await expect(text).toHaveValue(/바울/);
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);

  // Hide a selected range by hand (select "바울" and tap the button).
  await page.getByTestId('sermon-mask-selection').click();
  await expect(page.getByRole('status').filter({ hasText: ko.sermons.mask_selection_none })).toBeVisible();
  await text.evaluate((el: HTMLTextAreaElement) => {
    const i = el.value.indexOf('바울');
    el.focus();
    el.setSelectionRange(i, i + 2);
  });
  await page.getByTestId('sermon-mask-selection').click();
  await expect(text).not.toHaveValue(/바울/);
  await expect(text).toHaveValue(/\[가림\]도 갈라디아/);

  await page.getByTestId('sermon-title').fill('포도나무 설교');
  await page.getByTestId('sermon-save').click();
  await expect(page.getByTestId('sermon-status')).toHaveText(ko.sermons.saved);
  await expect(page.getByTestId('sermon-item')).toHaveCount(1);
  await expect(page.getByTestId('sermon-item')).toContainText('포도나무 설교');
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);

  // The list survives a reload (stored in IndexedDB).
  await page.reload();
  await expect(page.getByTestId('sermon-item')).toHaveCount(1, { timeout: 20_000 });

  // Delete asks first; cancel keeps it, confirm removes it.
  await page.getByTestId('sermon-delete').click();
  await expect(page.getByRole('alertdialog')).toContainText('포도나무 설교');
  await page.getByTestId('sermon-delete-no').click();
  await expect(page.getByTestId('sermon-item')).toHaveCount(1);
  await page.getByTestId('sermon-delete').click();
  await page.getByTestId('sermon-delete-yes').click();
  await expect(page.getByTestId('sermon-status')).toHaveText(ko.sermons.deleted);
  await expect(page.getByTestId('sermon-item')).toHaveCount(0);
  await expect(page.getByTestId('sermon-empty')).toBeVisible();
});

for (const file of ['sermon.docx', 'sermon.pdf']) {
  test(`${file} is parsed on the device and masked`, async ({ page }) => {
    await open(page);
    await upload(page, file);
    await page.getByTestId('sermon-consent').click();
    await page.getByTestId('sermon-next').click();
    const text = page.getByTestId('sermon-text');
    await expect(text).toHaveValue(/ZQX-표지-문장/, { timeout: 20_000 });
    await expect(text).not.toHaveValue(/010-1234-5678|이영희|sample\.person/);
    await expect(page.getByTestId('sermon-title')).toHaveValue('sermon');
    await page.getByTestId('sermon-save').click();
    await expect(page.getByTestId('sermon-item')).toHaveCount(1);
  });
}

test('paste: title and text, saved and listed', async ({ page }) => {
  await open(page);
  await page.getByTestId('sermon-add').click();
  await choose(page, 'sermon-source', 'paste');
  await page.getByTestId('sermon-consent').click();
  await expect(page.getByTestId('sermon-next')).toBeDisabled();
  await page.getByTestId('sermon-paste-title').fill('붙여넣은 설교');
  await page.getByTestId('sermon-paste-text').fill('오늘은 시 23:1 말씀을 나눕니다. 연락은 010-2222-3333 으로 주세요.');
  await page.getByTestId('sermon-next').click();
  await expect(page.getByTestId('sermon-text')).toHaveValue('오늘은 시 23:1 말씀을 나눕니다. 연락은 [연락처] 으로 주세요.');
  await page.getByTestId('sermon-save').click();
  await expect(page.getByTestId('sermon-item')).toContainText('붙여넣은 설교');
});

test('image PDF and unsupported files show cause-specific messages', async ({ page }) => {
  await open(page);
  await upload(page, 'image-only.pdf');
  await page.getByTestId('sermon-consent').click();
  await page.getByTestId('sermon-next').click();
  await expect(page.getByTestId('sermon-error')).toHaveText(ko.sermons.error.IMAGE_PDF, { timeout: 20_000 });
  await page.getByTestId('sermon-file').setInputFiles(`${FIX}/not-a-sermon.png`);
  await page.getByTestId('sermon-next').click();
  await expect(page.getByTestId('sermon-error')).toHaveText(ko.sermons.error.UNSUPPORTED_TYPE);
  await page.getByTestId('sermon-cancel').click();
  await expect(page.getByTestId('sermon-empty')).toBeVisible();
});

test('home links to My Sermons; largest font has no horizontal scroll', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('wizard-skip').click();
  await nav(page, 'settings');
  await choose(page, 'settings-font', 22);
  await nav(page, 'home');
  await page.getByTestId('home-sermons').click();
  await expect(page.getByTestId('sermon-empty')).toBeVisible();
  await noHorizontalScroll(page);
  await upload(page, 'sermon.txt');
  await page.getByTestId('sermon-consent').click();
  await noHorizontalScroll(page);
  await page.getByTestId('sermon-next').click();
  await expect(page.getByTestId('sermon-text')).toBeVisible();
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
});
