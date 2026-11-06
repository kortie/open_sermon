// Step 8: manuscript transfer consent (DESIGN 3.13.4). Default is "do not send". The choice is
// recorded in consent_log (kind external_transfer). Declining changes nothing else.
import { useState } from 'react';
import { recordConsent } from '../../../core/store';
import { t } from '../../../i18n';
import { ConsentCheck } from '../../ConsentCheck';
import { goStep, NextButton, Shell } from '../Shell';

export function Consent({ provider }: { provider: string }) {
  const [send, setSend] = useState(false);
  const next = async () => {
    try {
      await recordConsent({ id: crypto.randomUUID(), kind: 'external_transfer', target_id: provider, granted: send, at: Date.now() });
    } catch {
      // storage unavailable: nothing is sent anyway (default is "do not send")
    }
    goStep('done');
  };
  return (
    <Shell
      step="consent"
      title={t('wizard.consent.title')}
      hint={t('wizard.consent.hint')}
      actions={
<NextButton onClick={() => void next()} />
      }
    >
      <ConsentCheck checked={send} onChange={setSend} label={t('wizard.consent.label')} note={t('wizard.consent.note')} testId="consent-send" />
      {provider === 'gemini' && <p className="wizard__notice">{t('wizard.consent.free_tier')}</p>}
    </Shell>
  );
}
