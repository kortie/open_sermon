import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { nativeDeviceAi } from './app/platform';
import { loadPreferences } from './app/preferences';
import { setDeviceAiBridge } from './core/llm';
import './app/app.css';

setDeviceAiBridge(nativeDeviceAi());

const root = document.getElementById('root');
if (root) {
  // Settings come from IndexedDB in a few ms; waiting avoids a flash of the wrong language or size.
  void loadPreferences().then(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
