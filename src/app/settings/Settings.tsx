// Settings (DESIGN ch. 8, 3.11, 3.12, 3.14, 3.16).
// #/settings?section=backup|connection|bibles scrolls to that panel (backup: target of the wizard done screen, S08).
import { useEffect, useState } from 'react';
import { bible_db, i18n, ui } from '../../../config/app.config.json';
import { rates, type SelectionRates } from '../../core/selection';
import { getRecentTotals, type Language } from '../../core/store';
import { t } from '../../i18n';
import { ChoiceGroup } from '../../ui/ChoiceGroup';
import { BackupPanel } from '../../ui/settings/BackupPanel';
import { BibleSettings } from '../../ui/settings/bibles/BibleSettings';
import { ConnectionPanel } from '../../ui/settings/ConnectionPanel';
import { DeviceAiPanel } from '../../ui/settings/DeviceAiPanel';
import { preferences, usePreferences } from '../preferences';
import { navigate, useRoute } from '../router';

export function Settings() {
  const prefs = usePreferences();
  const section = useRoute().params.get('section');
  useEffect(() => {
    if (section === 'backup' || section === 'connection' || section === 'bibles') document.getElementById(section)?.scrollIntoView({ block: 'start' });
  }, [section]);

  return (
    <div className="settings" data-testid="settings">
      <h2 className="page__title">{t('settings.title')}</h2>

      <section className="card" aria-labelledby="set-wizard">
        <h3 id="set-wizard" className="card__title">
          {t('settings.wizard_title')}
        </h3>
        <button
          type="button"
          className="button"
          onClick={() => {
            void preferences.setWizardStep('language');
            navigate('wizard');
          }}
          data-testid="wizard-reopen"
        >
          {t('settings.wizard_reopen')}
        </button>
      </section>

      <ConnectionPanel />

      <DeviceAiPanel />

      <section className="card" aria-labelledby="set-persona">
        <h3 id="set-persona" className="card__title">
          {t('settings.persona_title')}
        </h3>
        <p className="card__muted">{t('settings.persona_hint')}</p>
        <button type="button" className="button" onClick={() => navigate('persona')} data-testid="settings-persona">
          {t('settings.persona_open')}
        </button>
      </section>

      <section className="card" aria-labelledby="set-lang">
        <h3 id="set-lang" className="card__title">
          {t('settings.language_title')}
        </h3>
        <ChoiceGroup
          labelledBy="set-lang"
          testId="settings-language"
          value={prefs.ui_language}
          options={(i18n.supported_languages as Language[]).map((l) => ({ value: l, label: t(`language.${l}`), lang: l }))}
          onChange={(l) => void preferences.setLanguage(l)}
        />
      </section>

      <section className="card" aria-labelledby="set-font">
        <h3 id="set-font" className="card__title">
          {t('settings.font_title')}
        </h3>
        <ChoiceGroup
          labelledBy="set-font"
          testId="settings-font"
          value={prefs.font_size_px}
          options={ui.font_size_px.options.map((px) => ({ value: px, label: t(`settings.font_option.${px}`) }))}
          onChange={(px) => void preferences.setFontSize(px)}
        />
        <p className="settings__preview" data-testid="font-preview">
          {t('settings.font_preview')}
        </p>
      </section>

      <BibleSettings />

      <BackupPanel />

      <SelectionStats />

      <section className="card" aria-labelledby="set-source">
        <h3 id="set-source" className="card__title">
          {t('settings.source_title')}
        </h3>
        <p className="card__muted">{t('footer.source', { tag: bible_db.release_tag })}</p>
      </section>
    </div>
  );
}

const STATS_DAYS = 30;
const RATE_KEYS: (keyof SelectionRates)[] = ['entrySuccess', 'cancel', 'directInput'];
const RATE_LABEL: Record<keyof SelectionRates, string> = { entrySuccess: 'entry_success', cancel: 'cancel', directInput: 'direct_input' };

/** Local-only selection metrics (DESIGN 3.1.1 metrics). Read from local_stats; never sent anywhere. */
function SelectionStats() {
  const [r, setR] = useState<SelectionRates | null>(null);
  useEffect(() => {
    let live = true;
    getRecentTotals(STATS_DAYS)
      .then((c) => live && setR(rates(c)))
      .catch(() => live && setR({ entrySuccess: null, cancel: null, directInput: null }));
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="card" aria-labelledby="set-stats" data-testid="settings-stats">
      <h3 id="set-stats" className="card__title">
        {t('settings.stats.title')}
      </h3>
      <p className="card__muted">{t('settings.stats.hint')}</p>
      <dl className="stats">
        {RATE_KEYS.map((k) => {
          const v = r?.[k];
          return (
            <div key={k} className="stats__row">
              <dt>{t(`settings.stats.${RATE_LABEL[k]}`)}</dt>
              <dd data-testid={`stats-${k}`}>{v === null || v === undefined ? t('settings.stats.none') : t('settings.stats.percent', { n: Math.round(v * 100) })}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
