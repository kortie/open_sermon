import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { nativeDeviceAi } from './app/platform';
import { loadPreferences } from './app/preferences';
import { setDeviceAiBridge } from './core/llm';
import './app/app.css';

setDeviceAiBridge(nativeDeviceAi());

/** The splash in index.html stays at least this long so it reads as a screen, not a flicker (DESIGN 3.17). */
const SPLASH_MIN_MS = 600;
const splashShown = new Promise<void>((resolve) => setTimeout(resolve, SPLASH_MIN_MS));

const root = document.getElementById('root');
if (root) {
  // Settings come from IndexedDB in a few ms; waiting avoids a flash of the wrong language or size.
  void Promise.all([loadPreferences(), splashShown]).then(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
