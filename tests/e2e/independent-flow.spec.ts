// S05: independent features — Message Outline, Search My Sermons, library, persona (DESIGN 3.3–3.5, 3.8).
import { expect, test } from '@playwright/test';
import en from '../../src/i18n/en.json' with { type: 'json' };
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import {
  addLibraryItem,
  createPersona,
  deleteAllSermons,
  fillAndSaveOutline,
  retrieveIntoOutline,
  selectWithChecks,
  uploadSermon,
  visibleTextHasNoInternalTerms,
} from '../helpers/flow';
import { press, tap } from '../helpers/touch';
import { choose, noHorizontalScroll, smallTargets } from '../helpers/ui';

test('long press → Message Outline → write in a blank → save → reopen from the list', async ({ page }) => {
  await page.clock.install();
  await page.goto(`/#/read?ref=${encodeURIComponent('요 15')}`);
  await expect(page.getByTestId('chapter-title')).toHaveText('요한복음 15장', { timeout: 20_000 });
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  await press(page, page.locator('[data-verse="1"]'), 500);
  await tap(page, page.locator('[data-verse="2"]'));
  const texts = await Promise.all([1, 2].map((n) => page.locator(`[data-verse="${n}"] .verse__text`).textContent()));
  await page.clock.resume();
  await page.getByTestId('action-outline').click();

  await expect(page.getByTestId('outline-editor')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-testid^="outline-section-"] h3')).toHaveText(Object.values(ko.outline.section));
  // The quote is the DB text verbatim and is not editable.
  await expect(page.getByTestId('outline-quote-bible').locator('.quote__text')).toHaveText(`1 ${texts[0]}\n2 ${texts[1]}`);
  await expect(page.getByTestId('outline-quote-bible').locator('textarea, input')).toHaveCount(0);
  // Every blank starts empty.
  for (const k of ['title', 'intro', 'exposition', 'application', 'prayer']) await expect(page.getByTestId(`outline-blank-${k}`)).toHaveValue('');
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
  await visibleTextHasNoInternalTerms(page);

  await page.getByTestId('outline-blank-application').fill('이번 주에는 아침마다 본문을 읽겠습니다.');
  await fillAndSaveOutline(page, '머무는 삶');
  await expect(page.getByTestId('outline-copy-warning')).toHaveCount(0);
  await page.getByTestId('outline-to-list').click();
  await expect(page.getByTestId('outline-item')).toHaveCount(1);
  await expect(page.getByTestId('outline-item')).toContainText('머무는 삶');
  await page.getByTestId('outline-open').click();
  await expect(page.getByTestId('outline-blank-application')).toHaveValue('이번 주에는 아침마다 본문을 읽겠습니다.');
  await page.getByTestId('outline-blank-prayer').fill('주님 안에 머물게 하소서.');
  await page.getByTestId('outline-save').click();
  await expect(page.getByTestId('outline-saved')).toBeVisible();

  // Delete from the list.
  await page.goto('/#/outline');
  await page.getByTestId('outline-delete').click();
  await page.getByTestId('outline-delete-yes').click();
  await expect(page.getByTestId('outline-empty')).toBeVisible();
});

test('selection → Search My Sermons → top results → into an outline; copying an excerpt warns; deleting the sermon removes the quote', async ({ page }) => {
  await page.goto('/#/retrieve?ref=JHN%2015%3A1-5');
  await expect(page.getByTestId('retrieve-no-sermons')).toBeVisible({ timeout: 20_000 });
  await uploadSermon(page);
  await selectWithChecks(page, '요 15', [1, 2, 3, 5]);
  await page.getByTestId('action-my_sermons').click();
  await expect(page.getByTestId('retrieve-ref')).toHaveText('요한복음 15:1–3, 5');
  const results = page.getByTestId('retrieve-result');
  await expect(results.first()).toBeVisible({ timeout: 20_000 });
  expect(await results.count()).toBeLessThanOrEqual(3);
  await expect(results.first()).toContainText('포도나무 설교');
  await expect(page.getByTestId('retrieve-keywords')).not.toHaveValue('');
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
  await visibleTextHasNoInternalTerms(page);

  // Back to the selection and through the full path.
  await page.goBack();
  await expect(page.getByTestId('chapter-title')).toBeVisible();
  await selectWithChecks(page, '요 15', [1, 2, 3, 5]);
  await retrieveIntoOutline(page);
  const excerpt = (await page.getByTestId('outline-quote-excerpt').locator('.quote__text').textContent())!;
  await page.getByTestId('outline-blank-application').fill(`그대로 옮김: ${excerpt.slice(0, 40)}`);
  await page.getByTestId('outline-save').click();
  await expect(page.getByTestId('outline-saved')).toBeVisible();
  await expect(page.getByTestId('outline-copy-warning')).toHaveText(ko.outline.copy_warning);

  await deleteAllSermons(page);
  await page.goto('/#/outline');
  await page.getByTestId('outline-open').click();
  await expect(page.getByTestId('outline-editor')).toBeVisible();
  await expect(page.getByTestId('outline-quote-excerpt')).toHaveCount(0);
  await expect(page.getByTestId('outline-quote-bible')).toHaveCount(1);
});

test('selection → Light Remark → library filtered by verse; empty screen explains how to add', async ({ page }) => {
  await page.goto('/#/library');
  await expect(page.getByTestId('library-empty')).toContainText(ko.library.empty_howto);
  await visibleTextHasNoInternalTerms(page);
  await addLibraryItem(page, 'one_liner', '가지는 붙어만 있어도 일이 됩니다.', '요 15:5', '열매, 일상');
  await addLibraryItem(page, 'example', '정원의 포도나무를 손질하던 이웃 이야기', '요 15:2');
  await addLibraryItem(page, 'one_liner', '빛이 있으라 하시니 아침이 밝습니다.', '창 1:3');
  await expect(page.getByTestId('library-item')).toHaveCount(3);
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);

  await selectWithChecks(page, '요 15', [5]);
  await page.getByTestId('action-remark').click();
  await expect(page.getByTestId('library-ref')).toContainText('요 15:5');
  await expect(page.getByTestId('library-kind').locator('[data-value="one_liner"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  await expect(page.getByTestId('library-item')).toContainText('가지는 붙어만');
  await expect(page.getByTestId('library-item')).toContainText('#열매');

  await selectWithChecks(page, '요 15', [5]);
  await page.getByTestId('action-illustrations').click();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  await expect(page.getByTestId('library-item')).toContainText(ko.library.match.chapter);

  await page.getByTestId('library-ref-clear').click();
  await choose(page, 'library-kind', 'all');
  await page.getByTestId('library-tag').fill('일상');
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  await page.getByTestId('library-tag').fill('');

  // Edit and delete.
  await page.getByTestId('library-edit').first().click();
  await page.getByTestId('library-form-ref').fill('요 99:1x');
  await page.getByTestId('library-form-save').click();
  await expect(page.getByTestId('library-error-ref')).toHaveText(ko.library.error.ref);
  await page.getByTestId('library-form-ref').fill('창 1:3-5');
  await page.getByTestId('library-form-save').click();
  await expect(page.getByTestId('library-status')).toHaveText(ko.library.saved);
  await page.getByTestId('library-delete').first().click();
  await page.getByTestId('library-delete-yes').click();
  await expect(page.getByTestId('library-item')).toHaveCount(2);
});

test('persona: real-person label rejected, several saved, one selected; labels follow the language, codes stay', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByTestId('settings-persona').click();
  await expect(page.getByTestId('persona-empty')).toBeVisible({ timeout: 20_000 });
  await createPersona(page, '김철수 목사님 스타일');
  await expect(page.getByTestId('persona-error-name_person')).toHaveText(ko.persona.error.name_person);
  await page.getByTestId('persona-name').fill('주일 오전용');
  const emphasis = (v: string) => page.getByTestId('persona-emphasis').locator(`[data-value="${v}"]`);
  await emphasis('grace').click(); // unselect the default
  await emphasis('community').click(); // unselect: nothing left
  await page.getByTestId('persona-save').click();
  await expect(page.getByTestId('persona-error-emphasis')).toHaveText(ko.persona.error.emphasis);
  await emphasis('mission').click();
  await emphasis('community').click();
  await expect(page.getByTestId('persona-length')).toHaveText(ko.persona.length_fixed);
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
  await page.getByTestId('persona-save').click();
  await expect(page.getByTestId('persona-status')).toHaveText(ko.persona.saved);

  await createPersona(page, '청년부 수요일', ['practice']);
  await expect(page.getByTestId('persona-item')).toHaveCount(2);
  const item = page.getByTestId('persona-item').filter({ hasText: '주일 오전용' });
  await expect(item).toContainText(`${ko.persona.denomination.methodist} · ${ko.persona.style.expository}`);
  await expect(item).toContainText(`${ko.persona.emphasis.mission}, ${ko.persona.emphasis.community}`);
  await item.getByTestId('persona-use').click();
  await expect(item.getByTestId('persona-use')).toHaveAttribute('aria-pressed', 'true');
  await expect(item).toContainText(ko.persona.in_use);
  await visibleTextHasNoInternalTerms(page);

  // Language switch: labels change at once, stored codes (and the selection) stay.
  await page.goto('/#/settings');
  await choose(page, 'settings-language', 'en');
  await page.getByTestId('settings-persona').click();
  const enItem = page.getByTestId('persona-item').filter({ hasText: '주일 오전용' });
  await expect(enItem).toContainText(`${en.persona.denomination.methodist} · ${en.persona.style.expository}`);
  await expect(enItem).toContainText(`${en.persona.emphasis.mission}, ${en.persona.emphasis.community}`);
  await expect(enItem.getByTestId('persona-use')).toHaveAttribute('aria-pressed', 'true');
  await enItem.getByTestId('persona-edit').click();
  await expect(page.getByTestId('persona-denomination').locator('[data-value="methodist"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('persona-denomination').locator('[data-value="methodist"]')).toHaveText(en.persona.denomination.methodist);
});

test('home shows the outline and library entries; no internal terms on any S05 screen (en too)', async ({ page }) => {
  for (const lang of ['ko', 'en'] as const) {
    if (lang === 'en') {
      await page.goto('/#/settings');
      await choose(page, 'settings-language', 'en');
    }
    await page.goto('/#/');
    await page.goto('/#/');
    const home = page.getByTestId('home');
    if (await page.getByTestId('wizard-skip').isVisible().catch(() => false)) await page.getByTestId('wizard-skip').click();
    await expect(home).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('home-outlines')).toBeVisible();
    await expect(page.getByTestId('home-library')).toBeVisible();
    for (const route of ['/#/outline', '/#/library', '/#/persona', '/#/retrieve?ref=JHN%203%3A16', '/#/outline?ref=JHN%203%3A16']) {
      await page.goto(route);
      await expect(page.getByTestId('shell-main')).not.toBeEmpty();
      await page.waitForTimeout(200);
      await visibleTextHasNoInternalTerms(page);
      await noHorizontalScroll(page);
    }
  }
});
