// Sharing profiles (internal: persona, DESIGN 3.8). Choices only; the label is the one text
// field and is checked against real-person patterns. Labels come from i18n, so switching the
// language changes them at once while the stored codes stay the same.
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import {
  defaultPersona,
  optionLabelKey,
  PERSONA_NAME_MAX,
  PERSONA_OPTIONS,
  type Emphasis,
  type Persona,
  type PersonaError,
  type PersonaField,
} from '../../core/persona';
import { deletePersona, getActivePersona, listPersonas, savePersona, setActivePersona } from '../../core/store';
import { t } from '../../i18n';
import { ChoiceGroup } from '../../ui/ChoiceGroup';

const label = (f: PersonaField, code: string) => t(optionLabelKey(f, code));

export function Personas() {
  const [items, setItems] = useState<Persona[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Persona | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const reload = useCallback(() => {
    Promise.all([listPersonas(), getActivePersona()]).then(
      ([list, a]) => {
        setItems(list);
        setActive(a?.id ?? null);
      },
      () => setFailed(true),
    );
  }, []);
  useEffect(reload, [reload]);

  const act = (fn: () => Promise<unknown>, msg = '') =>
    fn().then(
      () => {
        setConfirming(null);
        setMessage(msg);
        reload();
      },
      () => setFailed(true),
    );

  if (editing)
    return (
      <PersonaForm
        initial={editing}
        onDone={(saved) => {
          setEditing(null);
          if (saved) {
            setMessage(t('persona.saved'));
            reload();
          }
        }}
      />
    );

  return (
    <div className="personas" data-testid="personas">
      <h2 className="page__title">{t('persona.title')}</h2>
      <p className="card__muted">{t('persona.intro')}</p>
      <button type="button" className="button sermons__add" onClick={() => setEditing(defaultPersona(crypto.randomUUID(), ''))} data-testid="persona-add">
        {t('persona.add')}
      </button>
      <p className="sermons__status" role="status" data-testid="persona-status">
        {message}
      </p>
      {failed && (
        <p className="field__error" role="alert">
          {t('common.load_failed')}
        </p>
      )}
      {items && items.length === 0 && (
        <p className="card__muted" data-testid="persona-empty">
          {t('persona.empty')}
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="sermon-list">
          {items.map((p) => (
            <li key={p.id} className="sermon-list__item" data-testid="persona-item">
              <p className="sermon-list__title">
                {p.name}
                {active === p.id && <span className="persona__active"> · {t('persona.in_use')}</span>}
              </p>
              <p className="card__muted" data-testid="persona-summary">
                {t('persona.summary', {
                  denomination: label('denomination', p.denomination),
                  style: label('style', p.style),
                  tone: label('tone', p.tone),
                  audience: label('audience', p.audience),
                })}
              </p>
              <p className="card__muted">{p.emphasis.map((e) => label('emphasis', e)).join(', ')}</p>
              {confirming === p.id ? (
                <div className="sermon-list__confirm" role="alertdialog" aria-label={t('common.delete')}>
                  <p>{t('persona.delete_confirm', { name: p.name })}</p>
                  <div className="sermons__actions">
                    <button type="button" className="button" onClick={() => void act(() => deletePersona(p.id), t('persona.deleted'))} data-testid="persona-delete-yes">
                      {t('common.delete_yes')}
                    </button>
                    <button type="button" className="button button--secondary" onClick={() => setConfirming(null)}>
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="sermons__actions">
                  <button
                    type="button"
                    className="button"
                    aria-pressed={active === p.id}
                    onClick={() => void act(() => setActivePersona(p.id))}
                    data-testid="persona-use"
                  >
                    {active === p.id ? t('persona.in_use') : t('persona.use')}
                  </button>
                  <button type="button" className="button button--secondary" onClick={() => setEditing(p)} data-testid="persona-edit">
                    {t('common.edit')}
                  </button>
                  <button type="button" className="button button--secondary" onClick={() => setConfirming(p.id)} data-testid="persona-delete">
                    {t('common.delete')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SINGLES = ['denomination', 'style', 'tone', 'audience'] as const;

function PersonaForm({ initial, onDone }: { initial: Persona; onDone: (saved: boolean) => void }) {
  const id = useId();
  const [p, setP] = useState<Persona>(initial);
  const [errors, setErrors] = useState<PersonaError[]>([]);
  const [failed, setFailed] = useState(false);

  const toggleEmphasis = (e: Emphasis) =>
    setP((cur) => ({ ...cur, emphasis: cur.emphasis.includes(e) ? cur.emphasis.filter((x) => x !== e) : [...cur.emphasis, e] }));

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    try {
      const r = await savePersona(p);
      if (r.ok) onDone(true);
      else setErrors(r.errors);
    } catch {
      setFailed(true);
    }
  };

  return (
    <form className="persona-form" onSubmit={(e) => void submit(e)} noValidate data-testid="persona-form">
      <h2 className="page__title">{t('persona.title')}</h2>
      <label htmlFor={`${id}-name`} className="field__label">
        {t('persona.name_label')}
      </label>
      <input
        id={`${id}-name`}
        className="field__input"
        autoComplete="off"
        maxLength={PERSONA_NAME_MAX}
        value={p.name}
        onChange={(e) => setP({ ...p, name: e.target.value })}
        data-testid="persona-name"
      />
      {SINGLES.map((f) => (
        <div key={f}>
          <p id={`${id}-${f}`} className="field__label">
            {t(`persona.field.${f}`)}
          </p>
          <ChoiceGroup
            labelledBy={`${id}-${f}`}
            testId={`persona-${f}`}
            value={p[f] as string}
            options={PERSONA_OPTIONS[f].map((code) => ({ value: code as string, label: label(f, code) }))}
            onChange={(v) => setP({ ...p, [f]: v })}
          />
        </div>
      ))}
      <p id={`${id}-emphasis`} className="field__label">
        {t('persona.field.emphasis')}
      </p>
      <div className="choices" role="group" aria-labelledby={`${id}-emphasis`} data-testid="persona-emphasis">
        {PERSONA_OPTIONS.emphasis.map((e) => (
          <button key={e} type="button" className="choices__item" aria-pressed={p.emphasis.includes(e)} onClick={() => toggleEmphasis(e)} data-value={e}>
            <span className="choices__label">{label('emphasis', e)}</span>
          </button>
        ))}
      </div>
      <p className="field__label">{t('persona.field.length')}</p>
      <p className="card__muted" data-testid="persona-length">
        {t('persona.length_fixed')}
      </p>
      {errors.map((er) => (
        <p key={er} className="field__error" role="alert" data-testid={`persona-error-${er}`}>
          {t(`persona.error.${er}`)}
        </p>
      ))}
      {failed && (
        <p className="field__error" role="alert">
          {t('common.save_failed')}
        </p>
      )}
      <div className="sermons__actions">
        <button type="submit" className="button" data-testid="persona-save">
          {t('common.save')}
        </button>
        <button type="button" className="button button--secondary" onClick={() => onDone(false)}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
