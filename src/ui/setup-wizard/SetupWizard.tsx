// Setup wizard (DESIGN 3.13, skill setup-wizard). Steps come from config.wizard.steps.
// Every screen can be skipped; skipping never blocks the independent features (rule 18).
// Steps 1–3 make no request. Step 4 lists verified providers only (rule 20); step 5 links open
// only when tapped; step 7 sends one request per tap. The pasted key lives only in this
// component's memory until the check ends.
import { useState } from 'react';
import { i18n, ui, wizard } from '../../../config/app.config.json';
import { preferences, usePreferences } from '../../app/preferences';
import { selectableProviders, providerModels } from '../../core/llm';
import { availableBibles, type Language } from '../../core/store';
import { t } from '../../i18n';
import { ChoiceGroup } from '../ChoiceGroup';
import { BackButton, finish, goStep, NextButton, Shell, type LlmDraft, type StepId } from './Shell';
import { Consent } from './steps/Consent';
import { Done } from './steps/Done';
import { GetKey } from './steps/GetKey';
import { PasteKey } from './steps/PasteKey';
import { Provider } from './steps/Provider';
import { Verify } from './steps/Verify';

const BIBLES = availableBibles({ i18n, ui, wizard });
const LLM_STEPS: readonly StepId[] = ['provider', 'get_key', 'paste_key', 'verify', 'consent', 'done'];

function initialDraft(stored: string): LlmDraft {
  const choosable = selectableProviders();
  const provider = choosable.includes(stored) ? stored : (choosable[0] ?? '');
  return { provider, model: providerModels(provider)[0] ?? '', key: '' };
}

export function SetupWizard() {
  const prefs = usePreferences();
  const [draft, setDraft] = useState<LlmDraft>(() => initialDraft(prefs.llm_provider));
  const [ignoreFormat, setIgnoreFormat] = useState(false);
  // True once step 6 handed a key to step 7 in this session (the key itself is never persisted).
  const [verifyOpened, setVerifyOpened] = useState(false);
  const llmAvailable = selectableProviders().length > 0;

  let step: StepId = (wizard.steps as string[]).includes(prefs.wizard_step) ? (prefs.wizard_step as StepId) : 'language';
  // No verified provider: the AI steps do not exist (DESIGN 3.13 step 3).
  if (!llmAvailable && LLM_STEPS.includes(step) && step !== 'done') step = 'llm_choice';
  // The pasted key is memory-only: after a reload on the check screen, paste again.
  if (step === 'verify' && !verifyOpened) step = 'paste_key';

  if (step === 'language') {
    return (
      <Shell step="language" title={t('wizard.language.title')} hint={t('wizard.language.hint')} actions={<NextButton onClick={() => goStep('bible')} />}>
        <ChoiceGroup
          labelledBy="wizard-title"
          testId="wizard-language-choices"
          vertical
          value={prefs.ui_language}
          options={(i18n.supported_languages as Language[]).map((l) => ({ value: l, label: t(`language.${l}`), lang: l }))}
          onChange={(l) => void preferences.setLanguage(l)}
        />
      </Shell>
    );
  }

  if (step === 'bible') {
    const def = i18n.default_bible[prefs.ui_language];
    return (
      <Shell
        step="bible"
        title={t('wizard.bible.title')}
        hint={t('wizard.bible.hint', { lang: t(`language.${prefs.ui_language}`), bible: t(`bible.${def}`) })}
        actions={
          <>
            <BackButton to="language" />
            <NextButton onClick={() => goStep('llm_choice')} />
          </>
        }
      >
        <ChoiceGroup
          labelledBy="wizard-title"
          testId="wizard-bible-choices"
          vertical
          value={prefs.bible_id}
          options={BIBLES.map((b) => ({ value: b, label: t(`bible.${b}`) }))}
          onChange={(b) => void preferences.chooseBible(b, 'wizard')}
        />
      </Shell>
    );
  }

  if (step === 'provider') return <Provider draft={draft} setDraft={setDraft} />;
  if (step === 'get_key') return <GetKey provider={draft.provider} />;
  if (step === 'paste_key')
    return (
      <PasteKey
        draft={draft}
        setDraft={(d) => {
          setDraft(d);
          setIgnoreFormat(false);
        }}
        onNext={(anyway) => {
          setIgnoreFormat(anyway);
          setVerifyOpened(true);
          goStep('verify');
        }}
      />
    );
  if (step === 'verify') return <Verify draft={draft} setDraft={setDraft} ignoreFormat={ignoreFormat} />;
  if (step === 'consent') return <Consent provider={draft.provider} />;
  if (step === 'done') return <Done />;

  return (
    <Shell step="llm_choice" title={t('wizard.llm.title')} hint={t('wizard.llm.hint')} actions={<BackButton to="bible" />}>
      <div className="choices choices--vertical">
        <button type="button" className="choices__item" onClick={() => finish('done')} data-testid="wizard-llm-skip">
          <span className="choices__label">{t('wizard.llm.skip')}</span>
          <span className="choices__desc">{t('wizard.llm.skip_desc')}</span>
        </button>
        {llmAvailable && (
          <button type="button" className="choices__item" onClick={() => goStep('provider')} data-testid="wizard-llm-use">
            <span className="choices__label">{t('wizard.llm.use')}</span>
            <span className="choices__desc">{t('wizard.llm.use_desc')}</span>
          </button>
        )}
      </div>
    </Shell>
  );
}
