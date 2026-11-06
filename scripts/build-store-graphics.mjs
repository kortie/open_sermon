#!/usr/bin/env node
// Google Play listing graphics (S16), rendered from assets/brand/mark.svg with the Playwright Chromium
// used for E2E (no extra dependency). Developer tool: `npm run store:graphics`. Outputs are committed.
//   store/google-play/icon-512.png                  512×512 PNG (Play applies its own corner mask)
//   store/google-play/feature-graphic-<lang>.png    1024×500 PNG, no alpha
// Specs: Play Console Help "Add preview assets to showcase your app" (answer 9866151), checked 2026-11-06.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = { background: '#1F3A5F', title: '#FBF7EE', tagline: '#C9D3E0', studio: '#E8C170' };
const mark = readFileSync(join(root, 'assets/brand/mark.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const markUri = `data:image/svg+xml;base64,${Buffer.from(mark).toString('base64')}`;
const appTitle = (lang) => JSON.parse(readFileSync(join(root, `src/i18n/${lang}.json`), 'utf8')).app.title;

/** Store-only copy (not shown in the app). Avoids the internal terms of CLAUDE.md rule 14. */
const TAGLINE = {
  ko: '본문을 읽고, 말씀 나눔을 준비하세요',
  en: 'Read the passage. Prepare to share it.',
};
const FONT = `'Noto Sans CJK KR', 'Noto Sans KR', sans-serif`;

// The mark is drawn on a 108 grid with padding; enlarge it like the launcher icon (108/76).
const ICON_MARK = Math.round(512 * (108 / 76));
const icon = `<!doctype html><html><body style="margin:0;width:512px;height:512px;overflow:hidden;background:${BRAND.background}">
<img src="${markUri}" style="position:absolute;width:${ICON_MARK}px;height:${ICON_MARK}px;left:${(512 - ICON_MARK) / 2}px;top:${(512 - ICON_MARK) / 2}px"></body></html>`;

const feature = (lang) => `<!doctype html><html lang="${lang}"><body style="margin:0;width:1024px;height:500px;background:${BRAND.background};font-family:${FONT}">
<div style="display:flex;align-items:center;gap:8px;width:1024px;height:500px;box-sizing:border-box;padding:0 80px 0 40px;overflow:hidden">
  <img src="${markUri}" style="width:420px;height:420px;flex:none;margin:-40px 0">
  <div style="min-width:0">
    <div style="color:${BRAND.title};font-size:${lang === 'ko' ? 68 : 56}px;font-weight:700;line-height:1.15">${appTitle(lang)}</div>
    <div style="color:${BRAND.tagline};font-size:${lang === 'ko' ? 28 : 25}px;font-weight:500;line-height:1.4;margin-top:18px;white-space:nowrap">${TAGLINE[lang]}</div>
    <div style="color:${BRAND.studio};font-size:22px;font-weight:600;letter-spacing:0.08em;margin-top:36px">JuanStudio</div>
  </div>
</div></body></html>`;

const out = join(root, 'store/google-play');
mkdirSync(out, { recursive: true });
const jobs = [
  { file: 'icon-512.png', w: 512, h: 512, html: icon },
  ...['ko', 'en'].map((lang) => ({ file: `feature-graphic-${lang}.png`, w: 1024, h: 500, html: feature(lang) })),
];
const browser = await chromium.launch();
try {
  for (const j of jobs) {
    const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
    await page.setContent(j.html, { waitUntil: 'load' });
    await page.evaluate(() => globalThis.document.fonts.ready);
    await page.screenshot({ path: join(out, j.file), clip: { x: 0, y: 0, width: j.w, height: j.h } });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`build-store-graphics: ${jobs.length} images`);
