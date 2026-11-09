// Step 4: provider cards (DESIGN 3.13). Only verified providers are choosable; others are disabled
// cards with their reason from config. The recommendation badge appears on choosable cards only.
import { providerCards, providerModels, modelI18nId } from '../../../core/llm';
import { t } from '../../../i18n';
import { ChoiceGroup } from '../../ChoiceGroup';
import { BackButton, goStep, NextButton, Shell, type LlmDraft } from '../Shell';

export function Provider({ draft, setDraft }: { draft: LlmDraft; setDraft: (d: LlmDraft) => void }) {
  const cards = providerCards();
  const models = providerModels(draft.provider);
  return (
    <Shell
      step="provider"
      title={t('wizard.provider.title')}
      hint={t('wizard.provider.hint')}
      actions={
        <>
          <BackButton to="llm_choice" />
          <NextButton onClick={() => goStep('get_key')} disabled={!draft.provider} />
        </>
      }
    >
      <div className="choices choices--vertical" role="group" aria-labelledby="wizard-title" data-testid="provider-cards">
        {cards.map((c) => {
          const name = t(`llm.provider_name.${c.id}`);
          if (!c.selectable) {
            return (
              <div key={c.id} className="provider-card provider-card--off" aria-disabled="true" data-testid={`provider-${c.id}`}>
                <span className="choices__label">{name}</span>
                <span className="provider-card__badge">{t('wizard.provider.unavailable')}</span>
                <span className="choices__desc" data-testid={`provider-${c.id}-reason`}>
                  {t(`wizard.provider.reason.${c.reason}`)}
                </span>
              </div>
            );
          }
          const sub = t(`wizard.provider.subscription.${c.id}`);
          return (
            <button
              key={c.id}
              type="button"
              className="choices__item"
              aria-pressed={draft.provider === c.id}
              onClick={() => setDraft({ ...draft, provider: c.id, model: providerModels(c.id)[0] ?? '' })}
              data-testid={`provider-${c.id}`}
            >
              <span className="choices__label">{name}</span>
              {c.recommended && (
                <span className="provider-card__badge provider-card__badge--on" data-testid={`provider-${c.id}-recommended`}>
                  {t('wizard.provider.recommended')}
                </span>
              )}
              <span className="choices__desc">{t(`wizard.provider.cost.${c.id}`)}</span>
              <span className="choices__desc">{sub}</span>
            </button>
          );
        })}
      </div>
      {models.length > 1 && (
        <>
          <h3 id="wizard-model" className="wizard__subtitle">
            {t('wizard.provider.model_title')}
          </h3>
          <p className="card__muted">{t('wizard.provider.model_hint')}</p>
          <ChoiceGroup
            labelledBy="wizard-model"
            testId="wizard-model-choices"
            vertical
            value={draft.model}
            options={models.map((m) => ({ value: m, label: t(`llm.model_name.${modelI18nId(m)}`), description: t(`llm.model_desc.${modelI18nId(m)}`) }))}
            onChange={(m) => setDraft({ ...draft, model: m })}
          />
        </>
      )}
    </Shell>
  );
}
