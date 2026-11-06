// S09: during generation, the only request leaving the device goes to the verified provider
// endpoint (CLAUDE.md rule 2, CSP connect-src). Every other external request is recorded and blocked.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import appConfig from '../../config/app.config.json' with { type: 'json' };
import { selectWithChecks } from '../helpers/flow';
import { connectThroughWizard, mockProvider, modelReply, OK, PROVIDER_ORIGIN, queue } from '../helpers/provider';

// A service worker that takes control mid-test makes WebKit skip context.route for cross-origin
// requests, so the mocked provider would be bypassed. The app's worker never touches those requests.
test.use({ serviceWorkers: 'block' });

const { providers } = appConfig;
const verified = Object.values(providers)
  .filter((p) => p.browser_direct_verified)
  .map((p) => p.endpoint);

test('generation sends requests to the verified provider endpoint only', async ({ page, context, baseURL }) => {
  const appOrigin = new URL(baseURL!).origin;
  const external: string[] = [];
  page.on('request', (r) => {
    const origin = new URL(r.url()).origin;
    if (origin !== appOrigin && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(`${r.method()} ${r.url()}`);
  });
  // Anything that is neither the app nor the provider is blocked (registered first, so it runs last).
  await context.route('**/*', (route) => {
    const origin = new URL(route.request().url()).origin;
    return origin === appOrigin ? route.continue() : route.abort('blockedbyclient');
  });
  const ok = JSON.parse(readFileSync('tests/fixtures/llm-responses/ok-ko.json', 'utf8')) as unknown;
  const posts = await mockProvider(context, queue(OK, modelReply(ok)));

  await connectThroughWizard(page);
  await selectWithChecks(page, '요 15', [1, 2, 3, 4, 5]);
  await page.getByTestId('action-illustrations').click();
  await page.getByTestId('generate-send').click();
  await expect(page.getByTestId('result-panel')).toBeVisible({ timeout: 20_000 });

  expect(posts).toHaveLength(2);
  expect(verified).toEqual([providers.gemini.endpoint, providers.anthropic.endpoint]);
  expect(external.length).toBeGreaterThan(0);
  // The connected provider (anthropic in this flow) is the only one contacted.
  for (const r of external) expect(r).toMatch(new RegExp(`^(POST|OPTIONS) ${providers.anthropic.endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  expect(external.every((r) => r.includes(PROVIDER_ORIGIN))).toBe(true);
});
