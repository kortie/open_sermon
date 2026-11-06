import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import appConfig from './config/app.config.json' with { type: 'json' };
import pkg from './package.json' with { type: 'json' };
import { cspFromConfig } from './scripts/build-csp.mjs';
import { pdfCmapsPlugin } from './scripts/vite-pdf-cmaps';

// CSP meta (CLAUDE.md 4.2). Injected at build time only: the dev server needs inline HMR scripts,
// so dist/index.html is the CSP source of truth (scripts/check-csp.mjs checks dist only).
// connect-src lists only providers with browser_direct_verified: true.
function cspPlugin(): Plugin {
  return {
    name: 'open-sermon:csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: cspFromConfig(appConfig),
          },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}

// `--mode app` (npm run build:app) builds the assets packaged into the Capacitor app (DESIGN 2.1.2):
// no service worker there — the assets are already on the device and an old cache must not outlive
// an app update.
export default defineConfig(({ mode }) => ({
  base: '/',
  // App version for the About screen (S16).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    cspPlugin(),
    pdfCmapsPlugin(),
    VitePWA({
      // External registerSW.js (no inline script → passes script-src 'self').
      injectRegister: 'script',
      registerType: 'autoUpdate',
      // public/manifest.webmanifest is maintained by hand and linked from index.html.
      manifest: false,
      workbox: {
        // App shell + sql.js WASM + bundled bible DB (DESIGN 10장: offline after first visit),
        // plus the pdf.js worker (.mjs) and Korean CMaps (.bcmap) for offline PDF upload (S04).
        // No runtimeCaching: requests to other origins (LLM providers) are never intercepted.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest,wasm,sqlite,bcmap}'],
        // bible.sqlite is ~9.8MB (DESIGN 2.1.1); workbox skips files over 2MB by default.
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
      disable: mode === 'app',
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
}));
