// Single-choice group made of toggle buttons (aria-pressed). Used instead of native radios/selects
// so every target is ≥ 44px and no user-agent stylesheet conflicts with the CSP (see BookChapterPicker).

export interface Choice<T extends string | number> {
  value: T;
  label: string;
  /** Optional lang attribute for labels in another language (e.g. "English" on a Korean screen). */
  lang?: string;
  description?: string;
}

interface Props<T extends string | number> {
  value: T;
  options: Choice<T>[];
  onChange: (value: T) => void;
  labelledBy: string;
  testId: string;
  vertical?: boolean;
}

export function ChoiceGroup<T extends string | number>({ value, options, onChange, labelledBy, testId, vertical }: Props<T>) {
  return (
    <div className={vertical ? 'choices choices--vertical' : 'choices'} role="group" aria-labelledby={labelledBy} data-testid={testId}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className="choices__item"
          aria-pressed={o.value === value}
          lang={o.lang}
          onClick={() => onChange(o.value)}
          data-value={String(o.value)}
        >
          <span className="choices__label">{o.label}</span>
          {o.description && <span className="choices__desc">{o.description}</span>}
        </button>
      ))}
    </div>
  );
}
