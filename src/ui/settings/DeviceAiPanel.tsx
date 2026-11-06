// Settings → on-device AI (DESIGN 3.6.1, S15). Shown only in the app on a platform with the native
// plugin. The OS model is downloaded only when the user taps the button; turning it on is a
// separate tap. Android shows the ML Kit diagnostics disclosure (CLAUDE.md rule 2 exception).
import { useCallback, useEffect, useState } from 'react';
import { on_device_ai } from '../../../config/app.config.json';
import { deviceAiBridge, deviceAiStatus, isDeviceAiEnabled, setDeviceAiEnabled, watchDeviceAiDownload, type DeviceAiStatus } from '../../core/llm';
import { t } from '../../i18n';

type Download = { s: 'idle' } | { s: 'running'; bytes: number } | { s: 'failed' };

const MB = 1024 * 1024;

export function DeviceAiPanel() {
  const bridge = deviceAiBridge();
  const [status, setStatus] = useState<DeviceAiStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [download, setDownload] = useState<Download>({ s: 'idle' });

  const load = useCallback(async () => {
    const [info, on] = await Promise.all([deviceAiStatus(), isDeviceAiEnabled().catch(() => false)]);
    setStatus(info.status);
    setEnabled(on);
  }, []);

  const refresh = async () => {
    setStatus(null);
    await load();
  };

  useEffect(() => {
    if (!bridge) return;
    let live = true;
    Promise.all([deviceAiStatus(), isDeviceAiEnabled().catch(() => false)]).then(
      ([info, on]) => {
        if (!live) return;
        setStatus(info.status);
        setEnabled(on);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [bridge]);

  // While the OS downloads the model, keep asking so the card turns to "ready" without a tap.
  const watching = status === 'downloading' && download.s !== 'running';
  useEffect(() => {
    if (!bridge || !watching) return;
    return watchDeviceAiDownload(setStatus, bridge);
  }, [bridge, watching]);

  if (!bridge) return null;

  const startDownload = async () => {
    setDownload({ s: 'running', bytes: 0 });
    try {
      await bridge.download((bytes) => setDownload({ s: 'running', bytes }));
      setDownload({ s: 'idle' });
      await refresh();
    } catch {
      setDownload({ s: 'failed' });
    }
  };

  const toggle = async () => {
    const next = !enabled;
    await setDeviceAiEnabled(next);
    setEnabled(next);
  };

  return (
    <section className="card" id="device-ai" aria-labelledby="set-device-ai" data-testid="settings-device-ai">
      <h3 id="set-device-ai" className="card__title">
        {t('settings.device_ai.title')}
      </h3>
      <p>{t('settings.device_ai.hint')}</p>
      <p className="card__muted">{t('settings.device_ai.scope_note')}</p>
      <p role="status" aria-live="polite" data-testid="device-ai-status">
        {status === null ? t('settings.device_ai.status_checking') : t(`settings.device_ai.status_${status}`)}
      </p>
      {/* The OS gives no total size, so an indeterminate bar shows that the download is under way. */}
      {(status === 'downloading' || download.s === 'running') && (
        <div className="device-ai__bar" role="progressbar" aria-label={t('settings.device_ai.downloading_label')} data-testid="device-ai-downloading">
          <span className="device-ai__bar-fill" />
        </div>
      )}
      {(status === 'downloadable' || status === 'downloading') && <p className="card__muted">{t('settings.device_ai.model_note')}</p>}
      {download.s === 'running' && (
        <p className="card__muted" data-testid="device-ai-progress">
          {t('settings.device_ai.download_progress', {
            mb: Math.floor(download.bytes / MB),
          })}
        </p>
      )}
      {download.s === 'failed' && (
        <p className="field__error" role="alert" data-testid="device-ai-download-failed">
          {t('settings.device_ai.download_failed')}
        </p>
      )}
      <div className="stack-actions">
        {/* While the OS is already downloading, the same call joins that download and reports progress. */}
        {(status === 'downloadable' || status === 'downloading') && download.s !== 'running' && (
          <button type="button" className="button" onClick={() => void startDownload()} data-testid="device-ai-download">
            {t(status === 'downloading' ? 'settings.device_ai.download_follow' : 'settings.device_ai.download')}
          </button>
        )}
        {status === 'available' && (
          <>
            <p data-testid="device-ai-state">{t(enabled ? 'settings.device_ai.state_on' : 'settings.device_ai.state_off')}</p>
            <button type="button" className={enabled ? 'button button--secondary' : 'button'} aria-pressed={enabled} onClick={() => void toggle()} data-testid="device-ai-toggle">
              {t(enabled ? 'settings.device_ai.turn_off' : 'settings.device_ai.turn_on')}
            </button>
          </>
        )}
        {status !== null && status !== 'available' && download.s !== 'running' && (
          <button type="button" className="button button--secondary" onClick={() => void refresh()} data-testid="device-ai-refresh">
            {t('settings.device_ai.check_again')}
          </button>
        )}
      </div>
      <p className="card__muted">{t('settings.device_ai.connected_note')}</p>
      {bridge.platform === 'android' && (
        <>
          <p className="card__muted" data-testid="device-ai-diagnostics">
            {t('settings.device_ai.diagnostics')}
          </p>
          <a className="button button--secondary" href={on_device_ai.diagnostics_disclosure_url} target="_blank" rel="noopener noreferrer" data-testid="device-ai-diagnostics-link">
            {t('settings.device_ai.diagnostics_link')}
          </a>
        </>
      )}
    </section>
  );
}
