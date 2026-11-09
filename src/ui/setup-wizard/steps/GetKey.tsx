// Step 5: how to create a key (DESIGN 3.13.1). Links are plain anchors that open a new tab only
// when tapped; nothing is fetched or opened by the app (rule 18, CLAUDE.md 9).
import { useState } from 'react';
import { providerConfig } from '../../../core/llm';
import { t } from '../../../i18n';
import { ConsentCheck } from '../../ConsentCheck';
import { BackButton, goStep, NextButton, Shell } from '../Shell';

/** Issuance steps per provider (only verified providers reach this screen). */
const STEPS: Record<string, { items: string[]; links: { key: 'console_url' | 'billing_url' | 'keys_url'; label: string }[] }> = {
  anthropic: {
    items: ['s1', 's2', 's3', 's4', 's5', 's6'],
    links: [
      { key: 'console_url', label: 'open_console' },
      { key: 'billing_url', label: 'open_billing' },
      { key: 'keys_url', label: 'open_keys' },
    ],
  },
  gemini: {
    items: ['s1', 's2', 's3', 's4', 's5'],
    links: [{ key: 'console_url', label: 'open_console' }],
  },
  openai: {
    items: ['s1', 's2', 's3', 's4', 's5'],
    links: [
      { key: 'console_url', label: 'open_console' },
      { key: 'billing_url', label: 'open_billing' },
      { key: 'keys_url', label: 'open_keys' },
    ],
  },
};

export function GetKey({ provider }: { provider: string }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const guide = STEPS[provider];
  const cfg = providerConfig(provider);
  return (
    <Shell
      step="get_key"
      title={t('wizard.get_key.title')}
      hint={t('wizard.get_key.hint')}
      actions={
        <>
          <BackButton to="provider" />
          <NextButton onClick={() => goStep('paste_key')} />
        </>
      }
    >
      {guide && (
        <>
          <ol className="wizard__checklist" data-testid="get-key-steps">
            {guide.items.map((s) => (
              <li key={s}>
                <ConsentCheck
                  checked={done.has(s)}
                  onChange={(on) => {
                    const next = new Set(done);
                    if (on) next.add(s);
                    else next.delete(s);
                    setDone(next);
                  }}
                  label={t(`wizard.get_key.${provider}.${s}`)}
                  testId={`get-key-${s}`}
                />
              </li>
            ))}
          </ol>
          <div className="wizard__links">
            {guide.links.map(({ key, label }) =>
              cfg?.[key] ? (
                <a key={key} className="button button--secondary" href={cfg[key]} target="_blank" rel="noopener noreferrer" data-testid={`get-key-link-${key}`}>
                  {t(`wizard.get_key.${provider}.${label}`)}
                </a>
              ) : null,
            )}
          </div>
          <p className="wizard__notice">{t(`wizard.get_key.${provider}.note`)}</p>
        </>
      )}
      <p className="wizard__notice">{t('wizard.get_key.common')}</p>
    </Shell>
  );
}
