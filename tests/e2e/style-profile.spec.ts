// S10: style profile card on My Sermons against a mocked provider (DESIGN 3.9, 4.4). The profile is
// made only with a connection, the external_transfer consent and the confirmation screen; it
// goes stale (and out of the S09 prompt) when the sermons change. No real provider is contacted.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import appConfig from '../../config/app.config.json' with { type: 'json' };
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { selectWithChecks, visibleTextHasNoInternalTerms } from '../helpers/flow';
import { blockExternalRequests } from '../helpers/network';
import { connectThroughWizard, mockProvider, modelReply, OK, queue } from '../helpers/provider';
import { noHorizontalScroll, smallTargets } from '../helpers/ui';

// A service worker that takes control mid-test makes WebKit skip context.route for cross-origin
// requests, so the mocked provider would be bypassed. The app's worker never touches those requests.
test.use({ serviceWorkers: 'block' });

const { providers } = appConfig;
const fixture = (name: string): unknown => JSON.parse(readFileSync(`tests/fixtures/llm-responses/${name}.json`, 'utf8'));
const PHONE = '010-2345-6789';
const userMessage = (body: string) => (JSON.parse(body) as { messages: { content: string }[] }).messages[0]!.content;
const sermonText = (n: number) =>
  [
    `${n}번째 원고입니다. 궁금한 점은 ${PHONE}로 연락 주세요.`,
    '사랑하는 여러분, 오늘 우리는 포도나무와 가지의 비유를 함께 묵상합니다.',
    ...Array.from({ length: 10 }, (_, k) => `${n}번 원고 ${k}번째 문장입니다. 우리는 무엇을 배우나요? 함께 생각해 봅시다.`),
  ].join(' ');
const PROFILE = {
  illustration_freq: 'mid',
  structure: 'expository',
  tone_summary: ['차분하게 묻고 함께 답을 찾아갑니다', '짧은 문장으로 따뜻하게 권면합니다'],
  frequent_phrases: ['사랑하는 여러분', '함께 생각해 봅시다'],
};

async function pasteSermon(page: Page, n: number) {
  await page.goto('/#/sermons');
  await expect(page.getByTestId('sermon-add')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('sermon-add').click();
  await page.getByTestId('sermon-source').locator('[data-value="paste"]').click();
  await page.getByTestId('sermon-paste-title').fill(`원고 ${n}`);
  await page.getByTestId('sermon-paste-text').fill(sermonText(n));
  await page.getByTestId('sermon-consent').click();
  await page.getByTestId('sermon-next').click();
  await expect(page.getByTestId('sermon-text')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('sermon-save').click();
  await expect(page.getByTestId('sermon-status')).toHaveText(ko.sermons.saved);
}

test('2 sermons: limited notice → confirm → masked text sent → profile shown → used in drafts → deletion makes it stale', async ({ page, context }) => {
  const posts = await mockProvider(context, queue(OK, modelReply(PROFILE), modelReply(fixture('ok-ko'))));
  await connectThroughWizard(page, { consent: true });
  await pasteSermon(page, 1);
  await pasteSermon(page, 2);

  const card = page.getByTestId('style-profile');
  await expect(card.getByTestId('style-profile-state')).toHaveText(ko.sermons.style.none);
  await expect(card.getByTestId('style-profile-limited')).toHaveText(ko.sermons.style.limited);
  await expect(card.getByTestId('style-profile-make')).toHaveText(ko.sermons.style.make);
  await card.getByTestId('style-profile-make').click();

  // Confirmation first: nothing sent yet besides the key check.
  await expect(card.getByTestId('style-profile-confirm-body')).toHaveText(ko.sermons.style.confirm_body);
  await expect(card.getByTestId('style-profile-gemini-warning')).toHaveCount(0); // Anthropic connection
  expect(posts).toHaveLength(1);
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
  await card.getByTestId('style-profile-cancel').click();
  expect(posts).toHaveLength(1);

  await card.getByTestId('style-profile-make').click();
  await card.getByTestId('style-profile-send').click();
  await expect(card.getByTestId('style-profile-status')).toHaveText(ko.sermons.style.saved, { timeout: 20_000 });
  expect(posts).toHaveLength(2);
  expect(posts[1]!.url).toBe(providers.anthropic.endpoint);
  const sent = userMessage(posts[1]!.body);
  expect(sent).toContain('[데이터: 원고]');
  expect(sent).toContain('포도나무와 가지의 비유');
  expect(sent).not.toContain(PHONE); // masked bodies only

  await expect(card.getByTestId('style-profile-state')).toHaveAttribute('data-state', 'ready');
  await expect(card.getByTestId('style-profile-fields')).toContainText('차분하게 묻고 함께 답을 찾아갑니다');
  await expect(card.getByTestId('style-profile-fields')).toContainText(ko.sermons.style.structure.expository);
  await expect(card.getByTestId('style-profile-make')).toHaveText(ko.sermons.style.remake);
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
  await visibleTextHasNoInternalTerms(page);

  // S09: the fresh profile goes into the prompt, and the notice says so.
  await selectWithChecks(page, '요 15', [1, 2, 3, 4, 5]);
  await page.getByTestId('action-illustrations').click();
  await expect(page.getByTestId('generate-notice-style')).toHaveText(ko.generate.notice_body_style, { timeout: 20_000 });
  await page.getByTestId('generate-send').click();
  await expect(page.getByTestId('result-panel')).toBeVisible({ timeout: 20_000 });
  expect(posts).toHaveLength(3);
  const draftPrompt = userMessage(posts[2]!.body);
  expect(draftPrompt).toContain('[스타일 프로필]');
  expect(draftPrompt).toContain('사랑하는 여러분');

  // Deleting a sermon: stale, "make again", and no profile in the next prompt.
  await page.goto('/#/sermons');
  await page.getByTestId('sermon-delete').first().click();
  await page.getByTestId('sermon-delete-yes').click();
  await expect(page.getByTestId('sermon-item')).toHaveCount(1);
  await expect(card.getByTestId('style-profile-state')).toHaveText(ko.sermons.style.stale);
  await expect(card.getByTestId('style-profile-make')).toHaveText(ko.sermons.style.remake);
  await expect(card.getByTestId('style-profile-fields')).toHaveCount(0);

  await selectWithChecks(page, '요 15', [1, 2, 3, 4, 5]);
  await page.getByTestId('action-illustrations').click();
  await expect(page.getByTestId('generate-notice')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('generate-notice-style')).toHaveCount(0);
});

test('consent declined: sermon features work, no profile button, no request beyond the key check', async ({ page, context }) => {
  const posts = await mockProvider(context, queue(OK));
  await connectThroughWizard(page, { consent: false });
  await pasteSermon(page, 1);
  await expect(page.getByTestId('sermon-item')).toHaveCount(1);
  const card = page.getByTestId('style-profile');
  await expect(card.getByTestId('style-profile-no-consent')).toHaveText(ko.sermons.style.no_consent);
  await expect(card.getByTestId('style-profile-make')).toHaveCount(0);
  await page.getByTestId('sermon-delete').click();
  await page.getByTestId('sermon-delete-yes').click();
  await expect(page.getByTestId('sermon-empty')).toBeVisible();
  expect(posts).toHaveLength(1);
});

test('no connection: the card explains and nothing leaves the device', async ({ page, baseURL }) => {
  const external = await blockExternalRequests(page, new URL(baseURL!).origin);
  await page.goto('/');
  await page.getByTestId('wizard-skip').click();
  await pasteSermon(page, 1);
  await expect(page.getByTestId('style-profile-no-connection')).toHaveText(ko.sermons.style.no_connection);
  await expect(page.getByTestId('style-profile-make')).toHaveCount(0);
  expect(external).toEqual([]);
});

test('bad answers twice: nothing saved and the failure is explained', async ({ page, context }) => {
  const posts = await mockProvider(context, queue(OK, modelReply('not json'), modelReply('{"structure":"poem"}')));
  await connectThroughWizard(page, { consent: true });
  await pasteSermon(page, 1);
  const card = page.getByTestId('style-profile');
  await card.getByTestId('style-profile-make').click();
  await card.getByTestId('style-profile-send').click();
  await expect(card.getByTestId('style-profile-status')).toHaveText(ko.sermons.style.failed, { timeout: 20_000 });
  expect(posts).toHaveLength(3);
  await expect(card.getByTestId('style-profile-state')).toHaveText(ko.sermons.style.none);
});
