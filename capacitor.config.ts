// Capacitor app wrapper (DESIGN 2.1.2, v0.18; S13). The app ships the static build in `dist/` and
// never loads web assets from a remote server (no `server.url`). Requests stay WebView `fetch`
// calls under the page CSP (CapacitorHttp off), so the only external calls are the LLM provider's.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.juanstudio.open_sermon',
  appName: '말씀 묵상',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: { enabled: false },
    CapacitorCookies: { enabled: false },
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
