import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// Mobile-only app (CLAUDE.md rule 13): two mobile projects, no desktop project.
// Tests run against the production build (vite preview) so CSP and the service worker are real.
export default defineConfig({
  testDir: 'tests',
  testMatch: /(e2e|network)\/.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Primary audience is Korean; language specs override this per test.
    locale: 'ko-KR',
  },
  projects: [
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: 'webkit-mobile',
      use: {
        ...devices['iPhone 14'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
