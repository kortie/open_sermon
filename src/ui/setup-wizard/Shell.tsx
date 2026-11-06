// Common frame of every wizard screen: step number, title, hint, actions and the skip button
// (rule 18: every screen can be skipped and the independent features keep working).
import type { ReactNode } from 'react';
import { wizard } from '../../../config/app.config.json';
import { navigate } from '../../app/router';
import { preferences } from '../../app/preferences';
import { t } from '../../i18n';

export type StepId = 'language' | 'bible' | 'llm_choice' | 'provider' | 'get_key' | 'paste_key' | 'verify' | 'consent' | 'done';

/** Leave the wizard for home. "skipped" and "done" both keep every independent feature. */
export function finish(state: 'skipped' | 'done') {
  void preferences.setWizard(state, wizard.steps[0]);
  navigate('home', undefined, { replace: true });
}

export function goStep(next: StepId) {
  void preferences.setWizardStep(next);
}

export function Shell({ step, title, hint, children, actions }: { step: StepId; title: string; hint?: string; children?: ReactNode; actions: ReactNode }) {
  return (
    <section className="wizard" aria-labelledby="wizard-title" data-testid={`wizard-${step}`}>
      <p className="wizard__step">{t('wizard.step', { n: wizard.steps.indexOf(step) + 1 })}</p>
      <h2 id="wizard-title" className="wizard__title">
        {title}
      </h2>
      {hint && <p className="wizard__hint">{hint}</p>}
      {children}
      <div className="wizard__actions">{actions}</div>
      {step !== 'done' && (
        <button type="button" className="button button--link wizard__skip" onClick={() => finish('skipped')} data-testid="wizard-skip">
          {t('wizard.skip')}
        </button>
      )}
    </section>
  );
}

export function BackButton({ to }: { to: StepId }) {
  return (
    <button type="button" className="button button--secondary" onClick={() => goStep(to)} data-testid="wizard-back">
      {t('wizard.back')}
    </button>
  );
}

export function NextButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="button" onClick={onClick} disabled={disabled} data-testid="wizard-next">
      {t('wizard.next')}
    </button>
  );
}

/** Draft kept in memory while the wizard is open. The key is never persisted here. */
export interface LlmDraft {
  provider: string;
  model: string;
  /** Pasted key, held only until the check finishes. */
  key: string;
}
