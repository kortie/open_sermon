// Step 7: one check per tap (DESIGN 3.13.2). The button is disabled while the request runs; there
// is no automatic retry. On failure: cause-specific notice + "paste again" / "use without AI".
// A failed key is never saved; the pasted key is dropped from memory after every attempt.
import { useState } from 'react';
import { DAILY_LIMIT, LlmError, providerCards, verifyAndSaveKey } from '../../../core/llm';
import { last4, maskKey } from '../../../core/vault';
import { t } from '../../../i18n';
import { finish, goStep, NextButton, Shell, type LlmDraft } from '../Shell';

type Phase = { s: 'idle' } | { s: 'checking' } | { s: 'ok'; last4: string } | { s: 'failed'; messageKey: string };

export function Verify({ draft, setDraft, ignoreFormat }: { draft: LlmDraft; setDraft: (d: LlmDraft) => void; ignoreFormat: boolean }) {
  const [phase, setPhase] = useState<Phase>({ s: 'idle' });
  const provider = t(`llm.provider_name.${draft.provider}`);
  const prefix = providerCards().find((c) => c.id === draft.provider)?.keyPrefix ?? '';

  const check = async () => {
    if (phase.s === 'checking') return;
    setPhase({ s: 'checking' });
    const key = draft.key;
    try {
      const info = await verifyAndSaveKey(draft.provider, draft.model, key, { ignoreFormat });
      setPhase({ s: 'ok', last4: info.key_last4 });
    } catch (err) {
      setPhase({ s: 'failed', messageKey: err instanceof LlmError ? err.messageKey : 'llm.error.unknown' });
    } finally {
      setDraft({ ...draft, key: '' });
    }
  };

  const repaste = () => {
    setDraft({ ...draft, key: '' });
    goStep('paste_key');
  };

  let actions;
  if (phase.s === 'ok') actions = <NextButton onClick={() => goStep('consent')} />;
  else if (phase.s === 'failed')
    actions = (
      <>
        <button type="button" className="button button--secondary" onClick={repaste} data-testid="verify-repaste">
          {t('wizard.verify.repaste')}
        </button>
        <button type="button" className="button" onClick={() => finish('skipped')} data-testid="verify-no-ai">
          {t('wizard.verify.no_ai')}
        </button>
      </>
    );
  else
    actions = (
      <>
        <button type="button" className="button button--secondary" onClick={repaste} disabled={phase.s === 'checking'} data-testid="wizard-back">
          {t('wizard.back')}
        </button>
        <button type="button" className="button" onClick={() => void check()} disabled={phase.s === 'checking' || !draft.key} data-testid="verify-check">
          {phase.s === 'checking' ? t('wizard.verify.checking') : t('wizard.verify.check')}
        </button>
      </>
    );

  return (
    <Shell step="verify" title={t('wizard.verify.title')} hint={t('wizard.verify.hint', { provider })} actions={actions}>
      {draft.key && phase.s !== 'ok' && <p data-testid="verify-pending">{t('wizard.verify.pending', { masked: maskKey(last4(draft.key)) })}</p>}
      <div aria-live="polite">
        {phase.s === 'checking' && <p className="card__muted">{t('wizard.verify.checking')}</p>}
        {phase.s === 'ok' && (
          <div className="wizard__success" data-testid="verify-success">
            <p>{t('wizard.verify.success')}</p>
            <p data-testid="verify-masked">{t('wizard.verify.saved', { masked: maskKey(phase.last4) })}</p>
          </div>
        )}
        {phase.s === 'failed' && (
          <p className="wizard__notice wizard__notice--error" role="alert" data-testid="verify-error">
            {t(phase.messageKey, { provider, prefix, n: DAILY_LIMIT })}
          </p>
        )}
      </div>
    </Shell>
  );
}
