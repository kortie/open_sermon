// S09: generation from the action bar against a mocked provider (DESIGN 3.7, 4.4, 7; CLAUDE.md
// rules 9, 10, 15). No real provider is contacted.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import appConfig from '../../config/app.config.json' with { type: 'json' };
import en from '../../src/i18n/en.json' with { type: 'json' };
import ko from '../../src/i18n/ko.json' with { type: 'json' };
import { selectWithChecks, uploadSermon, visibleTextHasNoInternalTerms } from '../helpers/flow';
import { blockExternalRequests } from '../helpers/network';
import { connectThroughWizard, mockProvider, modelReply, OK, queue } from '../helpers/provider';
import { noHorizontalScroll, smallTargets } from '../helpers/ui';

// A service worker that takes control mid-test makes WebKit skip context.route for cross-origin
// requests, so the mocked provider would be bypassed. The app's worker never touches those requests.
test.use({ serviceWorkers: 'block' });

const { providers } = appConfig;
const fixture = (name: string): unknown => JSON.parse(readFileSync(`tests/fixtures/llm-responses/${name}.json`, 'utf8'));
const PASSAGE = [1, 2, 3, 4, 5];
const userMessage = (body: string) => (JSON.parse(body) as { messages: { content: string }[] }).messages[0]!.content;

test('selection → everyday examples → transfer notice → result with AI notice and working verse links', async ({ page, context }) => {
  const posts = await mockProvider(context, queue(OK, modelReply(fixture('ok-ko'))));
  await connectThroughWizard(page);
  await selectWithChecks(page, '요 15', PASSAGE);
  await page.getByTestId('action-illustrations').click();

  await expect(page.getByTestId('generate-notice')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('generate-notice-body')).toHaveText(ko.generate.notice_body.replace('{provider}', ko.llm.provider_name.anthropic));
  await expect(page.getByTestId('generate-keywords')).not.toHaveValue('');
  expect(posts).toHaveLength(1); // the key check only: nothing sent before "보내기"
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);

  await page.getByTestId('generate-send').click();
  await expect(page.getByTestId('result-panel')).toBeVisible({ timeout: 20_000 });
  expect(posts).toHaveLength(2);
  expect(posts[1]!.url).toBe(providers.anthropic.endpoint);
  const sent = userMessage(posts[1]!.body);
  expect(sent).toContain('[데이터: 본문]');
  expect(sent).toContain('JHN 15:5 ');
  expect(sent).not.toContain('[데이터: 참고 발췌]');

  await expect(page.getByTestId('result-notice-top')).toHaveText(ko.result.ai_notice);
  await expect(page.getByTestId('result-notice-bottom')).toHaveText(ko.result.ai_notice);
  await expect(page.getByTestId('result-title')).toHaveText('포도나무에 붙어 있는 삶');
  await expect(page.getByTestId('result-example')).toHaveCount(1);
  await expect(page.getByTestId('result-humor')).toHaveCount(1);
  // The quote is the bundled 개역한글 text, not model text.
  const quote = page.getByTestId('result-quote').first();
  await expect(quote).toContainText(ko.result.quote.replace('{bible}', ko.bible.krv));
  await expect(quote).toContainText('나는 포도나무요');
  await noHorizontalScroll(page);
  expect(await smallTargets(page)).toEqual([]);
  await visibleTextHasNoInternalTerms(page);

  await page.getByTestId('result-example').first().getByTestId('result-ref').click();
  await expect(page.getByTestId('chapter-title')).toHaveText('요한복음 15장');
  await expect(page).toHaveURL(/#\/read\?ref=JHN\+15%3A4/);
});

test('XSS reply: <script> and <img onerror> are shown as text and never run', async ({ page, context }) => {
  await mockProvider(context, queue(OK, modelReply(fixture('xss'))));
  await connectThroughWizard(page);
  await selectWithChecks(page, '요 15', PASSAGE);
  await page.getByTestId('action-remark').click();
  await page.getByTestId('generate-send').click();
  await expect(page.getByTestId('result-title')).toHaveText('<script>window.__xss=1</script>', { timeout: 20_000 });
  await expect(page.getByTestId('result-example').first()).toContainText('<img src=x onerror="window.__xss=1">');
  expect(await page.getByTestId('result-panel').locator('script, img').count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
});

test('no key: light remark opens the library and makes 0 external requests', async ({ page, baseURL }) => {
  const external = await blockExternalRequests(page, new URL(baseURL!).origin);
  await page.goto('/');
  await page.getByTestId('wizard-skip').click();
  await selectWithChecks(page, '요 15', [5]);
  await page.getByTestId('action-remark').click();
  await expect(page.getByTestId('library')).toBeVisible({ timeout: 20_000 });
  expect(page.url()).toContain('#/library');
  expect(external).toEqual([]);
});

test('English UI + KJV: English result, KJV quote', async ({ page, context }) => {
  const posts = await mockProvider(context, queue(OK, modelReply(fixture('ok-en'))));
  await connectThroughWizard(page, { lang: 'en' });
  await selectWithChecks(page, 'John 15', PASSAGE);
  await page.getByTestId('action-illustrations').click();
  await expect(page.getByTestId('generate-notice-body')).toHaveText(en.generate.notice_body.replace('{provider}', en.llm.provider_name.anthropic), { timeout: 20_000 });
  await page.getByTestId('generate-send').click();
  await expect(page.getByTestId('result-notice-top')).toHaveText(en.result.ai_notice, { timeout: 20_000 });
  await expect(page.getByTestId('result-title')).toHaveText('Abiding in the Vine');
  await expect(page.getByTestId('result-quote').first()).toContainText('I am the vine');
  expect(userMessage(posts[1]!.body)).toContain('[Data: Passage]');
  expect(userMessage(posts[1]!.body)).toContain('Write the body as introduction');
});

test('Korean UI + KJV: Korean explanation, KJV quote', async ({ page, context }) => {
  const posts = await mockProvider(context, queue(OK, modelReply(fixture('ok-ko'))));
  await connectThroughWizard(page, { bible: 'kjv' });
  await selectWithChecks(page, '요 15', PASSAGE);
  await page.getByTestId('action-illustrations').click();
  await page.getByTestId('generate-send').click();
  await expect(page.getByTestId('result-notice-top')).toHaveText(ko.result.ai_notice, { timeout: 20_000 });
  await expect(page.getByTestId('result-quote').first()).toContainText(ko.result.quote.replace('{bible}', ko.bible.kjv));
  await expect(page.getByTestId('result-quote').first()).toContainText('I am the vine');
  const sent = userMessage(posts[1]!.body);
  expect(sent).toContain('[데이터: 본문]');
  expect(sent).toContain('I am the vine');
});

test('two failed replies: no model text shown; outline and library instead; exactly 2 generation requests', async ({ page, context }) => {
  const posts = await mockProvider(context, queue(OK, modelReply(fixture('ko-799')), modelReply(fixture('ko-1201')), modelReply(fixture('ok-ko'))));
  await connectThroughWizard(page);
  await selectWithChecks(page, '요 15', PASSAGE);
  await page.getByTestId('action-illustrations').click();
  await page.getByTestId('generate-send').click();
  await expect(page.getByTestId('fallback')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('fallback-reason')).toHaveText(ko.fallback.validation);
  await expect(page.getByTestId('result-panel')).toHaveCount(0);
  expect(posts).toHaveLength(3);
  expect(userMessage(posts[2]!.body)).toContain('[다시 쓰기]');
  await page.getByTestId('fallback-outline').click();
  await expect(page.getByTestId('outline-editor')).toBeVisible({ timeout: 20_000 });
});

test('401 during generation: cause message, outline and library; one request', async ({ page, context }) => {
  const posts = await mockProvider(context, queue(OK, { status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid' } } }));
  await connectThroughWizard(page);
  await selectWithChecks(page, '요 15', PASSAGE);
  await page.getByTestId('action-remark').click();
  await page.getByTestId('generate-send').click();
  await expect(page.getByTestId('fallback-reason')).toHaveText(ko.llm.error.auth, { timeout: 20_000 });
  await expect(page.getByTestId('fallback-outline')).toBeVisible();
  expect(posts).toHaveLength(2);
});

test('with transfer consent the excerpts go along; turning the notice off sends right away', async ({ page, context }) => {
  const posts = await mockProvider(context, queue(OK, modelReply(fixture('ok-ko')), modelReply(fixture('ok-en'))));
  await uploadSermon(page);
  await connectThroughWizard(page, { consent: true });
  await selectWithChecks(page, '요 15', PASSAGE);
  await page.getByTestId('action-illustrations').click();
  await expect(page.getByTestId('generate-notice-body')).toHaveText(ko.generate.notice_body_excerpts.replace('{provider}', ko.llm.provider_name.anthropic), { timeout: 20_000 });
  await page.getByTestId('generate-send').click();
  await expect(page.getByTestId('result-panel')).toBeVisible({ timeout: 20_000 });
  expect(userMessage(posts[1]!.body)).toContain('[데이터: 참고 발췌]');
  expect(userMessage(posts[1]!.body)).toContain('ZQX-표지-문장');

  await page.goto('/#/settings?section=connection');
  await page.getByTestId('connection-transfer-notice').click();
  await expect(page.getByTestId('connection-transfer-notice')).toHaveAttribute('aria-checked', 'false');
  await selectWithChecks(page, 'John 15', PASSAGE);
  await page.getByTestId('action-remark').click();
  // Same passage and keywords as before: served from the encrypted cache, no request, no notice.
  await expect(page.getByTestId('result-panel')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('generate-notice')).toHaveCount(0);
  await expect(page.getByTestId('result-from-cache')).toHaveText(ko.result.from_cache);
  expect(posts).toHaveLength(2);
});

test('a slow request can be cancelled and the screen stays usable', async ({ page, context }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => (release = r));
  let n = 0;
  await mockProvider(context, () => (n++ === 0 ? OK : modelReply(fixture('ok-ko'))));
  // Hold generation requests (after the key check) until released.
  await context.route(`${new URL(providers.anthropic.endpoint).origin}/**`, async (route) => {
    if (route.request().method() === 'POST' && n >= 1) {
      await held;
      return route.fallback();
    }
    return route.fallback();
  });
  await connectThroughWizard(page);
  await selectWithChecks(page, '요 15', PASSAGE);
  await page.getByTestId('action-illustrations').click();
  await page.getByTestId('generate-send').click();
  await expect(page.getByTestId('generate-sending')).toBeVisible();
  await page.getByTestId('generate-cancel').click();
  await expect(page.getByTestId('generate-cancelled')).toHaveText(ko.generate.cancelled);
  await expect(page.getByTestId('generate-send')).toBeEnabled();
  release();
  await expect(page.getByTestId('result-panel')).toHaveCount(0);
});
