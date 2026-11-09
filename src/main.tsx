import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { BACK_EVENT, installBackKey } from './app/back';
import { connectBackKey, nativeDeviceAi, nativeHttp, signalLaunchReady, webSplashMinMs } from './app/platform';
import { loadPreferences } from './app/preferences';
import { setDeviceAiBridge, setNativeHttp } from './core/llm';
import './app/app.css';

setDeviceAiBridge(nativeDeviceAi());
// OpenAI refuses browser CORS; in the app it is called over native HTTP (user decision 2026-11-09).
setNativeHttp(nativeHttp());

// Android back key: one press undoes one thing (DESIGN 8장). In the browser nothing sends the event
// and there is no app to leave.
let leaveApp: (() => void) | null = null;
installBackKey(() => leaveApp?.());
void connectBackKey(BACK_EVENT).then((exit) => {
  leaveApp = exit;
});

// Launch splash (DESIGN 3.17): browser → the index.html splash for a moment; app → the native splash
// stays until the first screen has rendered, then it is told to go (one splash, no blank screen).
const splashShown = new Promise<void>((resolve) => setTimeout(resolve, webSplashMinMs()));

function LaunchReady({ children }: { children: ReactNode }) {
  useEffect(() => {
    signalLaunchReady().catch(() => undefined);
  }, []);
  return children;
}

const root = document.getElementById('root');
if (root) {
  // Settings come from IndexedDB in a few ms; waiting avoids a flash of the wrong language or size.
  void Promise.all([loadPreferences(), splashShown]).then(() => {
    createRoot(root).render(
      <StrictMode>
        <LaunchReady>
          <App />
        </LaunchReady>
      </StrictMode>,
    );
  });
}
