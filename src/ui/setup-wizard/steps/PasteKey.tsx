// Step 6: paste the key (DESIGN 3.13 step 6, 3.13.2). password field, autocomplete off. A prefix
// mismatch shows a notice before any request; the user may still check anyway.
import { useState } from 'react';
import { keyFormatOk, providerCards } from '../../../core/llm';
import { t } from '../../../i18n';
import { BackButton, NextButton, Shell, type LlmDraft } from '../Shell';

export function PasteKey({ draft, setDraft, onNext }: { draft: LlmDraft; setDraft: (d: LlmDraft) => void; onNext: (ignoreFormat: boolean) => void }) {
  const [formatNotice, setFormatNotice] = useState(false);
  const [empty, setEmpty] = useState(false);
  const prefix = providerCards().find((c) => c.id === draft.provider)?.keyPrefix ?? '';
  const provider = t(`llm.provider_name.${draft.provider}`);

  const next = () => {
    if (!draft.key.trim()) return setEmpty(true);
    if (!keyFormatOk(draft.provider, draft.key)) return setFormatNotice(true);
    onNext(false);
  };

  return (
    <Shell
      step="paste_key"
      title={t('wizard.paste_key.title')}
      hint={t('wizard.paste_key.hint', { provider, prefix })}
      actions={
        formatNotice ? (
          <>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setDraft({ ...draft, key: '' });
                setFormatNotice(false);
                document.getElementById('wizard-key')?.focus();
              }}
              data-testid="key-repaste"
            >
              {t('wizard.paste_key.repaste')}
            </button>
            <button type="button" className="button" onClick={() => onNext(true)} data-testid="key-check-anyway">
              {t('wizard.paste_key.check_anyway')}
            </button>
          </>
        ) : (
          <>
            <BackButton to="get_key" />
            <NextButton onClick={next} />
          </>
        )
      }
    >
      <label className="field__label" htmlFor="wizard-key">
        {t('wizard.paste_key.label')}
      </label>
      <input
        id="wizard-key"
        className="field__input"
        type="password"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={`${prefix}…`}
        value={draft.key}
        onChange={(e) => {
          setDraft({ ...draft, key: e.target.value });
          setFormatNotice(false);
          setEmpty(false);
        }}
        data-testid="key-input"
      />
      {empty && (
        <p className="field__error" role="alert">
          {t('wizard.paste_key.empty')}
        </p>
      )}
      {formatNotice && (
        <p className="wizard__notice wizard__notice--error" role="alert" data-testid="key-format-notice">
          {t('llm.error.format', { provider, prefix })}
        </p>
      )}
      <p className="card__muted">{t('llm.key_stored_note')}</p>
    </Shell>
  );
}
