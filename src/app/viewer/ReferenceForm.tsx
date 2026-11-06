import { useId, useState, type FormEvent } from 'react';
import { MAX_REFERENCE_LENGTH, parseReference, type BibleSource, type ReferenceError, type BookNo, type VerseRange } from '../../core/bible';
import { t, type Lang } from '../../i18n';
import { recordStats } from './useSelection';

interface Props {
  repo: BibleSource;
  bible: string;
  lang: Lang;
  onGo: (book: BookNo, chapter: number, highlight: VerseRange[]) => void;
}

export function ReferenceForm({ repo, bible, onGo }: Props) {
  const id = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<ReferenceError | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = parseReference(value);
    if (!r.ok) return setError(r.error);
    const outOfRange = repo.checkReference(bible, r.ref);
    if (outOfRange) return setError(outOfRange);
    setError(null);
    recordStats(['ref_input']);
    onGo(r.ref.book, r.ref.chapter, r.ref.ranges);
  };

  return (
    <form className="ref-form" onSubmit={submit} noValidate>
      <label htmlFor={`${id}-ref`} className="field__label">
        {t('reference.label')}
      </label>
      <div className="field__row">
        <input
          id={`${id}-ref`}
          className="field__input"
          type="text"
          inputMode="text"
          enterKeyHint="go"
          autoComplete="off"
          maxLength={MAX_REFERENCE_LENGTH}
          placeholder={t('reference.placeholder')}
          value={value}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => setValue(e.target.value)}
          data-testid="ref-input"
        />
        <button type="submit" className="button" data-testid="ref-go">
          {t('reference.go')}
        </button>
      </div>
      {error && (
        <p id={`${id}-err`} className="field__error" role="alert" data-testid="ref-error">
          {t(`reference.error.${error}`)}
        </p>
      )}
    </form>
  );
}
