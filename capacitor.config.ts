// Capacitor app wrapper (DESIGN 2.1.2, v0.18; S13). The app ships the static build in `dist/` and
// never loads web assets from a remote server (no `server.url`). Requests stay WebView `fetch`
// calls under the page CSP (CapacitorHttp does not patch fetch), so the only external calls are the
// LLM provider's. OpenAI, which refuses browser CORS, is called through CapacitorHttp.request
// directly, only to its configured endpoint (src/app/platform.ts nativeHttpFor; 2026-11-09).
// Logging is off in every build: Capacitor logs plugin call options, and those carry the key header.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.juanstudio.open_sermon',
  appName: '말씀 묵상',
  webDir: 'dist',
  loggingBehavior: 'none',
  plugins: {
    CapacitorHttp: { enabled: false },
    CapacitorCookies: { enabled: false },
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
