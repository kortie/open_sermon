// Consent checkbox as a full-width button (role="checkbox"): a ≥ 44px target with the whole
// sentence tappable, instead of a small native checkbox. Used for rights consent (S04) and later
// consents (S10, S11).

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  note?: string;
  testId: string;
}

export function ConsentCheck({ checked, onChange, label, note, testId }: Props) {
  return (
    <div className="consent">
      <button type="button" role="checkbox" aria-checked={checked} className="consent__check" onClick={() => onChange(!checked)} data-testid={testId}>
        <span className="consent__box" aria-hidden="true">
          {checked ? '✓' : ''}
        </span>
        <span className="consent__label">{label}</span>
      </button>
      {note && <p className="card__muted consent__note">{note}</p>}
    </div>
  );
}
