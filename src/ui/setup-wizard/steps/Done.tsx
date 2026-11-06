// Step 9: done (DESIGN 3.13.5). Recommends a backup (S06 screen) and starts the app.
import { wizard } from '../../../../config/app.config.json';
import { navigate } from '../../../app/router';
import { preferences } from '../../../app/preferences';
import { t } from '../../../i18n';
import { finish, Shell } from '../Shell';

export function Done() {
  return (
    <Shell
      step="done"
      title={t('wizard.done.title')}
      hint={t('wizard.done.hint')}
      actions={
        <button type="button" className="button" onClick={() => finish('done')} data-testid="wizard-start">
          {t('wizard.done.start')}
        </button>
      }
    >
      <div className="card">
        <h3 className="card__title">{t('wizard.done.backup_title')}</h3>
        <p className="card__muted">{t('wizard.done.backup_body')}</p>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            void preferences.setWizard('done', wizard.steps[0]);
            navigate('settings', { section: 'backup' }, { replace: true });
          }}
          data-testid="wizard-backup"
        >
          {t('wizard.done.backup_go')}
        </button>
      </div>
    </Shell>
  );
}
