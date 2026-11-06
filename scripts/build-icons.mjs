#!/usr/bin/env node
// Builds every app icon and splash image from assets/brand/mark.svg (S16). Developer tool, run by
// hand after changing the mark: `node scripts/build-icons.mjs`. Renders with the Playwright Chromium
// already used for E2E (no extra dependency). Outputs are committed.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = { background: '#1F3A5F', studio: 'JuanStudio', studioColor: '#E8DCC2' };
const mark = readFileSync(join(root, 'assets/brand/mark.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const markUri = `data:image/svg+xml;base64,${Buffer.from(mark).toString('base64')}`;
// Studio name in a light, wide-spaced sans. Ubuntu Sans (Ubuntu Font Licence 1.0, fonts-ubuntu package) is
// embedded only while rendering; the PNGs carry the shapes, not the font.
const STUDIO_FONT_FILE = '/usr/share/fonts/truetype/ubuntu/UbuntuSans[wdth,wght].ttf';
const studioFontFace = `@font-face{font-family:Studio;src:url(data:font/ttf;base64,${readFileSync(STUDIO_FONT_FILE).toString('base64')}) format('truetype');font-weight:100 800}`;
const studioFont = (px) => `font-family:Studio;font-weight:300;font-size:${px}px;line-height:1;letter-spacing:0.22em`;

/** One image: w×h px, optional background shape, mark at `scale` of the short side, optional studio line. */
function html({ w, h, bg = null, shape = 'square', scale = 1, studio = false }) {
  const side = Math.min(w, h);
  const markPx = Math.round(side * scale);
  const radius = shape === 'circle' ? '50%' : shape === 'rounded' ? `${Math.round(side * 0.18)}px` : '0';
  const studioLine = studio
    ? `<div style="position:absolute;left:0;right:0;bottom:${Math.round(h * 0.08)}px;text-align:center;color:${BRAND.studioColor};${studioFont(Math.round(side * 0.03))}">${BRAND.studio}</div>`
    : '';
  return `<!doctype html><html><head><style>${studioFontFace}</style></head><body style="margin:0;width:${w}px;height:${h}px;background:transparent">
<div style="position:relative;width:${w}px;height:${h}px;overflow:hidden;${bg ? `background:${bg};border-radius:${radius};` : ''}">
<img src="${markUri}" style="position:absolute;width:${markPx}px;height:${markPx}px;left:${(w - markPx) / 2}px;top:${(h - markPx) / 2}px">${studioLine}</div></body></html>`;
}

/** Branding image for the Android 12+ system splash: the studio name only. */
function brandingHtml(w, h) {
  return `<!doctype html><html><head><style>${studioFontFace}</style></head><body style="margin:0;width:${w}px;height:${h}px;background:transparent">
<div style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;color:${BRAND.studioColor};${studioFont(Math.round(h * 0.22))}">${BRAND.studio}</div></body></html>`;
}

const jobs = [];
const android = 'android/app/src/main/res';
const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [d, k] of Object.entries(DPI)) {
  const legacy = Math.round(48 * k);
  const fg = Math.round(108 * k);
  // Legacy icons: the mark is drawn on a 108 grid, so it fills the 48dp icon at 108/66 of the safe zone.
  jobs.push({ out: `${android}/mipmap-${d}/ic_launcher.png`, w: legacy, h: legacy, bg: BRAND.background, shape: 'rounded', scale: 108 / 76 });
  jobs.push({ out: `${android}/mipmap-${d}/ic_launcher_round.png`, w: legacy, h: legacy, bg: BRAND.background, shape: 'circle', scale: 108 / 76 });
  jobs.push({ out: `${android}/mipmap-${d}/ic_launcher_foreground.png`, w: fg, h: fg, scale: 1, transparent: true });
  // Legacy splash (Android below 12): the window background of the launch theme, same sizes as the template.
  const [pw, ph] = SPLASH[d];
  jobs.push({ out: `${android}/drawable-port-${d}/splash.png`, w: pw, h: ph, bg: BRAND.background, scale: 0.55, studio: true });
  jobs.push({ out: `${android}/drawable-land-${d}/splash.png`, w: ph, h: pw, bg: BRAND.background, scale: 0.55, studio: true });
}
jobs.push({ out: `${android}/drawable/splash.png`, w: 480, h: 320, bg: BRAND.background, scale: 0.55, studio: true });
// Android 12+ system splash: icon 240dp (content inside the 160dp circle), drawn at xxxhdpi.
jobs.push({ out: `${android}/drawable-xxxhdpi/splash_icon.png`, w: 960, h: 960, scale: (160 / 240) * (108 / 66), transparent: true });
jobs.push({ out: `${android}/drawable-xxxhdpi/splash_branding.png`, w: 800, h: 320, branding: true });
// iOS
jobs.push({ out: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', w: 1024, h: 1024, bg: BRAND.background, scale: 108 / 76, opaque: true });
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
  jobs.push({ out: `ios/App/App/Assets.xcassets/Splash.imageset/${f}`, w: 2732, h: 2732, bg: BRAND.background, scale: 0.3, studio: true, opaque: true });
// Browser build (PWA) and the in-app splash
jobs.push({ out: 'public/icons/icon-192.png', w: 192, h: 192, bg: BRAND.background, shape: 'rounded', scale: 108 / 76 });
jobs.push({ out: 'public/icons/icon-512.png', w: 512, h: 512, bg: BRAND.background, shape: 'rounded', scale: 108 / 76 });
jobs.push({ out: 'public/icons/icon-512-maskable.png', w: 512, h: 512, bg: BRAND.background, scale: 1 });
jobs.push({ out: 'public/icons/apple-touch-icon.png', w: 180, h: 180, bg: BRAND.background, scale: 108 / 76, opaque: true });
jobs.push({ out: 'public/icons/splash-mark.png', w: 256, h: 256, scale: 1, transparent: true });

const browser = await chromium.launch();
try {
  for (const j of jobs) {
    const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
    await page.setContent(j.branding ? brandingHtml(j.w, j.h) : html(j), { waitUntil: 'load' });
    await page.evaluate("document.fonts.ready");
    await page.screenshot({ path: join(root, j.out), omitBackground: !j.opaque, clip: { x: 0, y: 0, width: j.w, height: j.h } });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`build-icons: ${jobs.length} images`);
