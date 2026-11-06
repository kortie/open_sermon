// Store screenshots, Korean and English (S16). Same app build and mocked provider as the E2E tests.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { selectWithChecks } from '../tests/helpers/flow';
import { connectThroughWizard, mockProvider, modelReply, OK, queue } from '../tests/helpers/provider';

const fixture = (name: string): unknown => JSON.parse(readFileSync(`tests/fixtures/llm-responses/${name}.json`, 'utf8'));

const LANGS = [
  { lang: 'ko', chapter: '요 15', reply: 'ok-ko', title: '포도나무에 붙어 있는 삶', intro: '가지는 나무에 붙어 있을 때 열매를 맺습니다. 오늘 우리는 어디에 붙어 있나요?' },
  { lang: 'en', chapter: 'John 15', reply: 'ok-en', title: 'Staying Connected to the Vine', intro: 'A branch bears fruit only while it stays on the vine. Where are we staying today?' },
] as const;

async function shot(page: Page, lang: string, name: string) {
  const dir = `store/google-play/screenshots/${lang}`;
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(400); // let fonts and transitions settle
  await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled', caret: 'hide' });
}

for (const { lang, chapter, reply, title, intro } of LANGS) {
  test(`screenshots ${lang}`, async ({ page, context }) => {
    test.setTimeout(120_000);

    await mockProvider(context, queue(OK, modelReply(fixture(reply))));
    await connectThroughWizard(page, { lang });
    await expect(page.getByTestId('today-text')).toBeVisible({ timeout: 20_000 });
    await shot(page, lang, '01-home');

    await selectWithChecks(page, chapter, [1, 2, 3]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, lang, '02-select-verses');

    await page.getByTestId('action-clear-all').click();
    await selectWithChecks(page, chapter, [1, 2, 3, 4, 5]); // the sample reply cites verses 4 and 5
    await page.getByTestId('action-illustrations').click();
    await expect(page.getByTestId('generate-send')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('generate-send').click();
    await expect(page.getByTestId('result-panel')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('result-example').first().evaluate((el) => el.closest('section')?.scrollIntoView({ block: 'start' }));
    await shot(page, lang, '03-examples-and-remarks');

    await page.goto(`/#/read?ref=${encodeURIComponent(chapter)}`);
    await expect(page.getByTestId('chapter-title')).toBeVisible({ timeout: 20_000 });
    await shot(page, lang, '04-reader');

    await selectWithChecks(page, chapter, [1, 2, 3, 4, 5]);
    await page.getByTestId('action-outline').click();
    await expect(page.getByTestId('outline-editor')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('outline-blank-title').fill(title);
    await page.getByTestId('outline-blank-intro').fill(intro);
    await page.getByTestId('outline-blank-intro').blur();
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, lang, '05-message-outline');

    await page.goto('/#/about');
    await expect(page.getByTestId('about')).toBeVisible();
    await shot(page, lang, '06-about');
  });
}
