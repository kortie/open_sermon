// Independent result after a failed generation (DESIGN 3.7, 7.0): the model's answer is not shown.
// The user gets the cause, a way into the message outline (bundled passage quoted verbatim) and
// the library items for the passage.
import type { FallbackReason, IndependentResult } from '../../core/generate';
import { DAILY_LIMIT } from '../../core/llm';
import { navigate } from '../../app/router';
import { t } from '../../i18n';

interface Props {
  reason: FallbackReason;
  independent: IndependentResult;
  refText: string;
  kind: string;
  provider: string;
}

export function FallbackView({ reason, independent, refText, kind, provider }: Props) {
  const message =
    reason === 'validation' ? t('fallback.validation') : t(`llm.error.${reason}`, { n: DAILY_LIMIT, provider: t(`llm.provider_name.${provider}`), prefix: '' });
  return (
    <section className="result" data-testid="fallback">
      <p className="field__error" role="alert" data-testid="fallback-reason">
        {message}
      </p>
      <h3 className="card__title">{t('fallback.title')}</h3>
      <div className="card">
        <p className="card__muted">{t('fallback.outline_hint')}</p>
        <button type="button" className="button" onClick={() => navigate('outline', { ref: independent.outline.ref || refText })} data-testid="fallback-outline">
          {t('fallback.open_outline')}
        </button>
      </div>
      <div className="card">
        <h4 className="card__title">{t('fallback.library_title')}</h4>
        {independent.library.length === 0 ? (
          <p className="card__muted" data-testid="fallback-library-empty">
            {t('fallback.library_empty')}
          </p>
        ) : (
          <ul className="sermon-list" data-testid="fallback-library">
            {independent.library.map(({ item }) => (
              <li key={item.id} className="sermon-list__item" data-testid="fallback-library-item">
                <p className="excerpts__from">{t(`library.kind.${item.kind}`)}</p>
                <p className="library__body">{item.body}</p>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="button button--secondary" onClick={() => navigate('library', { ref: refText, kind })} data-testid="fallback-open-library">
          {t('fallback.open_library')}
        </button>
      </div>
    </section>
  );
}
