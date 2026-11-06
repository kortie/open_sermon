// Shared steps of the independent (no-LLM) flow, used by the S05 E2E and network specs.
import { expect, type Page } from '@playwright/test';
import ko from '../../src/i18n/ko.json' with { type: 'json' };

/** Internal terms that must never appear on screen (CLAUDE.md rule 14). */
export const FORBIDDEN_TERMS = ['설교 생성', '예문', '유머', '골격', '발췌 검색'];

export async function visibleTextHasNoInternalTerms(page: Page) {
  const text = await page.evaluate(() => document.body.innerText);
  for (const term of FORBIDDEN_TERMS) expect(text, term).not.toContain(term);
}

/** Upload the synthetic sermon fixture (txt) with consent and save it. */
export async function uploadSermon(page: Page, file = 'sermon.txt') {
  await page.goto('/#/sermons');
  await expect(page.getByTestId('sermon-add')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('sermon-add').click();
  await page.getByTestId('sermon-file').setInputFiles(`tests/fixtures/sermons/${file}`);
  await page.getByTestId('sermon-consent').click();
  await page.getByTestId('sermon-next').click();
  await expect(page.getByTestId('sermon-text')).toHaveValue(/ZQX-표지-문장/, { timeout: 20_000 });
  await page.getByTestId('sermon-title').fill('포도나무 설교');
  await page.getByTestId('sermon-save').click();
  await expect(page.getByTestId('sermon-status')).toHaveText(ko.sermons.saved);
}

/** Open a chapter in the reader and select verses with the check area (no long press). */
export async function selectWithChecks(page: Page, chapterRef: string, verses: number[]) {
  await page.goto(`/#/read?ref=${encodeURIComponent(chapterRef)}`);
  await expect(page.getByTestId('chapter-title')).toBeVisible({ timeout: 20_000 });
  for (const v of verses) await page.getByTestId(`check-${v}`).click();
  await expect(page.getByTestId('action-bar')).toBeVisible();
}

/** Search My Sermons from a selection, pick the first result and open an outline with it. */
export async function retrieveIntoOutline(page: Page) {
  await page.getByTestId('action-my_sermons').click();
  await expect(page.getByTestId('retrieve-result').first()).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('retrieve-pick').first().click();
  await expect(page.getByTestId('retrieve-pick').first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('retrieve-make-outline').click();
  await expect(page.getByTestId('outline-editor')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('outline-quote-excerpt')).toHaveCount(1);
}

export async function fillAndSaveOutline(page: Page, title: string) {
  await page.getByTestId('outline-blank-title').fill(title);
  await page.getByTestId('outline-blank-intro').fill('제 말로 쓴 도입입니다.');
  await page.getByTestId('outline-save').click();
  await expect(page.getByTestId('outline-saved')).toHaveText(ko.outline.saved);
}

export async function addLibraryItem(page: Page, kind: 'example' | 'one_liner', body: string, ref: string, tags = '') {
  await page.getByTestId('library-add').click();
  await page.getByTestId('library-form-kind').locator(`[data-value="${kind}"]`).click();
  await page.getByTestId('library-form-body').fill(body);
  await page.getByTestId('library-form-ref').fill(ref);
  if (tags) await page.getByTestId('library-form-tags').fill(tags);
  await page.getByTestId('library-form-save').click();
  await expect(page.getByTestId('library-status')).toHaveText(ko.library.saved);
}

export async function createPersona(page: Page, name: string, emphasis: string[] = ['community']) {
  await page.goto('/#/persona');
  await page.getByTestId('persona-add').click();
  await page.getByTestId('persona-name').fill(name);
  await page.getByTestId('persona-denomination').locator('[data-value="methodist"]').click();
  for (const e of emphasis) await page.getByTestId('persona-emphasis').locator(`[data-value="${e}"]`).click();
  await page.getByTestId('persona-save').click();
}

export async function deleteAllSermons(page: Page) {
  await page.goto('/#/sermons');
  await expect(page.getByTestId('sermon-add')).toBeVisible({ timeout: 20_000 });
  while ((await page.getByTestId('sermon-item').count()) > 0) {
    const before = await page.getByTestId('sermon-item').count();
    await page.getByTestId('sermon-delete').first().click();
    await page.getByTestId('sermon-delete-yes').click();
    await expect(page.getByTestId('sermon-item')).toHaveCount(before - 1);
  }
}
