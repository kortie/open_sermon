// Google Play store screenshots (S16). Not a test suite: `npm run store:screenshots` drives the
// production build like the E2E tests do (mocked provider, nothing sent anywhere) and writes
// 1080×1920 (9:16) portrait PNGs to store/google-play/screenshots/<lang>/.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
  testDir: '.',
  testMatch: /screenshots\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: '../test-results/store',
  use: {
    ...devices['Pixel 7'],
    baseURL: `http://localhost:${PORT}`,
    // 360×640 CSS px at 3× = 1080×1920 px, the 9:16 size Play asks for.
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    serviceWorkers: 'block',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    cwd: '..',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
