// Settings → AI connection (DESIGN 3.6, 3.13.5): reconnect, change provider, change model, delete key.
// Only the provider name, model and ••••last4 are shown. Reconnect / change provider reopen the
// wizard at step 4; nothing is sent from this panel.
import { useEffect, useState } from 'react';
import { navigate } from '../../app/router';
import { preferences, usePreferences } from '../../app/preferences';
import { disconnect, getConnection, providerModels, selectableProviders, setModel, type Connection, modelI18nId } from '../../core/llm';
import { maskKey } from '../../core/vault';
import { t } from '../../i18n';
import { ChoiceGroup } from '../ChoiceGroup';
import { ConsentCheck } from '../ConsentCheck';
import { useBackHandler } from '../../app/back';

function openWizardAtProvider() {
  void preferences.setWizardStep('provider');
  navigate('wizard');
}

export function ConnectionPanel() {
  const [conn, setConn] = useState<Connection | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  useBackHandler(confirming, () => setConfirming(false));
  const [deleted, setDeleted] = useState(false);
  const available = selectableProviders().length > 0;
  const { transfer_notice } = usePreferences();

  useEffect(() => {
    let live = true;
    getConnection()
      .then((c) => live && setConn(c))
      .catch(() => live && setConn(null));
    return () => {
      live = false;
    };
  }, []);

  const remove = async () => {
    if (!conn) return;
    await disconnect(conn.provider);
    setConn(null);
    setConfirming(false);
    setDeleted(true);
  };

  const models = conn ? providerModels(conn.provider) : [];

  return (
    <section className="card" id="connection" aria-labelledby="set-connection" data-testid="settings-connection">
      <h3 id="set-connection" className="card__title">
        {t('settings.connection.title')}
      </h3>
      {conn === null && (
        <>
          <p className="card__muted" data-testid="connection-none">
            {t('settings.connection.none')}
          </p>
          {deleted && (
            <p role="status" data-testid="connection-deleted">
              {t('settings.connection.deleted')}
            </p>
          )}
          {available && (
            <button type="button" className="button" onClick={openWizardAtProvider} data-testid="connection-connect">
              {t('settings.connection.connect')}
            </button>
          )}
        </>
      )}
      {conn && (
        <>
          <p data-testid="connection-provider">{t('settings.connection.connected', { provider: t(`llm.provider_name.${conn.provider}`) })}</p>
          <p data-testid="connection-key">{t('settings.connection.key', { masked: maskKey(conn.key_last4) })}</p>
          {models.length > 1 && (
            <>
              <h4 id="set-model" className="backup__subtitle">
                {t('settings.connection.model_title')}
              </h4>
              <ChoiceGroup
                labelledBy="set-model"
                testId="connection-model"
                vertical
                value={conn.model}
                options={models.map((m) => ({ value: m, label: t(`llm.model_name.${modelI18nId(m)}`), description: t(`llm.model_desc.${modelI18nId(m)}`) }))}
                onChange={(m) => {
                  // Shown as chosen once saved, so leaving right away cannot lose the choice.
                  void setModel(conn.provider, m).then(() => setConn({ ...conn, model: m }));
                }}
              />
            </>
          )}
          <ConsentCheck
            checked={transfer_notice}
            onChange={(on) => void preferences.setTransferNotice(on)}
            label={t('settings.connection.transfer_notice')}
            note={t('settings.connection.transfer_notice_note')}
            testId="connection-transfer-notice"
          />
          <div className="connection__actions">
            <button type="button" className="button" onClick={openWizardAtProvider} data-testid="connection-reconnect">
              {t('settings.connection.reconnect')}
            </button>
            <button type="button" className="button button--secondary" onClick={openWizardAtProvider} data-testid="connection-change-provider">
              {t('settings.connection.change_provider')}
            </button>
            <button type="button" className="button button--secondary" onClick={() => setConfirming(true)} data-testid="connection-delete">
              {t('settings.connection.delete')}
            </button>
          </div>
          {confirming && (
            <div className="backup__confirm" role="alertdialog" aria-labelledby="connection-delete-q">
              <p id="connection-delete-q">{t('settings.connection.delete_confirm')}</p>
              <div className="backup__actions">
                <button type="button" className="button button--secondary" onClick={() => setConfirming(false)} data-testid="connection-delete-cancel">
                  {t('common.cancel')}
                </button>
                <button type="button" className="button" onClick={() => void remove()} data-testid="connection-delete-yes">
                  {t('common.delete_yes')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <p className="card__muted">{t('llm.key_stored_note')}</p>
    </section>
  );
}
