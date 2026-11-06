// My Sermons (DESIGN 3.9, ch. 8 item 4): list, add (file or paste) with rights consent,
// masked preview with manual hiding, save, delete with confirmation, and the style profile card (S10).
// The unmasked text never enters React state: core/sermon returns masked drafts only.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { sermon_ingest } from '../../../config/app.config.json';
import {
  deleteSermon,
  IngestError,
  listSermons,
  maskRange,
  prepareSermon,
  saveSermon,
  type ConsentInput,
  type IngestDeps,
  type SermonDraft,
  type SermonMeta,
} from '../../core/sermon';
import { t, useLanguage } from '../../i18n';
import { ChoiceGroup } from '../../ui/ChoiceGroup';
import { ConsentCheck } from '../../ui/ConsentCheck';
import { StyleProfileCard } from '../../ui/sermons/StyleProfileCard';
import { useBackHandler } from '../back';

const ACCEPT = '.txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const deps: IngestDeps = {
  loadPdf: () => import('../../core/sermon/parse/pdf-browser').then((m) => m.browserPdfLoader),
};

function errorText(err: unknown): string {
  const code = err instanceof IngestError ? err.code : 'UNKNOWN';
  return t(`sermons.error.${code}`, { mb: sermon_ingest.max_upload_mb });
}

type View = { name: 'list'; status?: string } | { name: 'add' } | { name: 'preview'; draft: SermonDraft; consent: ConsentInput };

export function Sermons() {
  const [view, setView] = useState<View>({ name: 'list' });
  useBackHandler(view.name !== 'list', () => setView({ name: 'list' }));
  return (
    <div className="sermons" data-testid="sermons">
      {view.name === 'list' && <SermonList status={view.status} onAdd={() => setView({ name: 'add' })} />}
      {view.name === 'add' && (
        <AddSermon onCancel={() => setView({ name: 'list' })} onReady={(draft, consent) => setView({ name: 'preview', draft, consent })} />
      )}
      {view.name === 'preview' && (
        <Preview
          draft={view.draft}
          consent={view.consent}
          onCancel={() => setView({ name: 'list' })}
          onSaved={() => setView({ name: 'list', status: t('sermons.saved') })}
        />
      )}
    </div>
  );
}

function SermonList({ status, onAdd }: { status?: string; onAdd: () => void }) {
  const lang = useLanguage();
  const [items, setItems] = useState<SermonMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  useBackHandler(confirming !== null, () => setConfirming(null));
  const [message, setMessage] = useState(status ?? '');
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => {
    listSermons().then(
      (list) => {
        setItems(list);
        setVersion((v) => v + 1);
      },
      () => setFailed(true),
    );
  }, []);
  useEffect(reload, [reload]);

  const remove = async (id: string) => {
    try {
      await deleteSermon(id);
      setConfirming(null);
      setMessage(t('sermons.deleted'));
      reload();
    } catch {
      setFailed(true);
    }
  };
  const date = (ms: number) => new Date(ms).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US');

  return (
    <>
      <h2 className="page__title">{t('sermons.title')}</h2>
      <p className="card__muted">{t('sermons.intro')}</p>
      <button type="button" className="button sermons__add" onClick={onAdd} data-testid="sermon-add">
        {t('sermons.add')}
      </button>
      <p className="sermons__status" role="status" data-testid="sermon-status">
        {message}
      </p>
      {failed && (
        <p className="field__error" role="alert">
          {t('sermons.load_failed')}
        </p>
      )}
      {items && items.length === 0 && (
        <p className="card__muted" data-testid="sermon-empty">
          {t('sermons.empty')}
        </p>
      )}
      {items && items.length > 0 && (
        <>
          <p className="card__muted">{t('sermons.count', { n: items.length })}</p>
          <ul className="sermon-list" data-testid="sermon-list">
            {items.map((s) => (
              <li key={s.id} className="sermon-list__item" data-testid="sermon-item">
                <div className="sermon-list__head">
                  <div className="sermon-list__text">
                    <p className="sermon-list__title">{s.title}</p>
                    <p className="card__muted">{t('sermons.saved_on', { date: date(s.created_at) })}</p>
                  </div>
                  {confirming !== s.id && (
                    <button type="button" className="button button--secondary" onClick={() => setConfirming(s.id)} data-testid="sermon-delete">
                      {t('sermons.delete')}
                    </button>
                  )}
                </div>
                {confirming === s.id && (
                  <div className="sermon-list__confirm" role="alertdialog" aria-label={t('sermons.delete')}>
                    <p>{t('sermons.delete_confirm', { title: s.title })}</p>
                    <div className="sermons__actions">
                      <button type="button" className="button" onClick={() => void remove(s.id)} data-testid="sermon-delete-yes">
                        {t('sermons.delete_yes')}
                      </button>
                      <button type="button" className="button button--secondary" onClick={() => setConfirming(null)} data-testid="sermon-delete-no">
                        {t('sermons.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <StyleProfileCard version={version} />
    </>
  );
}

function AddSermon({ onCancel, onReady }: { onCancel: () => void; onReady: (d: SermonDraft, c: ConsentInput) => void }) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<'file' | 'paste'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [consentAt, setConsentAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = consentAt !== null && !busy && (source === 'file' ? file !== null : pasteText.trim() !== '');

  const next = async () => {
    if (consentAt === null) return;
    const consent = { granted: true, at: consentAt };
    setBusy(true);
    setError('');
    try {
      const input =
        source === 'file' && file
          ? { kind: 'file' as const, name: file.name, size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()) }
          : { kind: 'paste' as const, text: pasteText, title: pasteTitle };
      onReady(await prepareSermon(input, consent, deps), consent);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className="page__title">{t('sermons.add_title')}</h2>
      <section className="card" aria-labelledby={`${id}-src`}>
        <h3 id={`${id}-src`} className="card__title">
          {t('sermons.source_title')}
        </h3>
        <ChoiceGroup
          labelledBy={`${id}-src`}
          testId="sermon-source"
          value={source}
          options={(['file', 'paste'] as const).map((v) => ({ value: v, label: t(`sermons.source.${v}`) }))}
          onChange={(v) => {
            setSource(v);
            setError('');
          }}
        />
        {source === 'file' ? (
          <div className="sermons__file">
            <p className="card__muted">{t('sermons.file_hint', { mb: sermon_ingest.max_upload_mb })}</p>
            <input
              ref={fileRef}
              id={`${id}-file`}
              hidden
              type="file"
              accept={ACCEPT}
              tabIndex={-1}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError('');
              }}
              data-testid="sermon-file"
            />
            <button type="button" className="button button--secondary" onClick={() => fileRef.current?.click()} data-testid="sermon-file-pick">
              {file ? t('sermons.file_change') : t('sermons.file_pick')}
            </button>
            {file && (
              <p className="sermons__file-name" data-testid="sermon-file-name">
                {t('sermons.file_chosen', { name: file.name })}
              </p>
            )}
          </div>
        ) : (
          <div>
            <label htmlFor={`${id}-pt`} className="field__label">
              {t('sermons.paste_title_label')}
            </label>
            <input
              id={`${id}-pt`}
              className="field__input"
              type="text"
              autoComplete="off"
              maxLength={100}
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              data-testid="sermon-paste-title"
            />
            <label htmlFor={`${id}-px`} className="field__label">
              {t('sermons.paste_text_label')}
            </label>
            <textarea
              id={`${id}-px`}
              className="field__input field__textarea"
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              data-testid="sermon-paste-text"
            />
          </div>
        )}
      </section>

      <ConsentCheck
        checked={consentAt !== null}
        onChange={(on) => setConsentAt(on ? Date.now() : null)}
        label={t('sermons.consent')}
        note={t('sermons.consent_note')}
        testId="sermon-consent"
      />

      {busy && (
        <p className="card__muted" role="status">
          {t('sermons.reading')}
        </p>
      )}
      {error && (
        <p className="field__error" role="alert" data-testid="sermon-error">
          {error}
        </p>
      )}
      <div className="sermons__actions">
        <button type="button" className="button" disabled={!ready} onClick={() => void next()} data-testid="sermon-next">
          {t('sermons.next')}
        </button>
        <button type="button" className="button button--secondary" onClick={onCancel} data-testid="sermon-cancel">
          {t('sermons.cancel')}
        </button>
      </div>
    </>
  );
}

function Preview({ draft, consent, onCancel, onSaved }: { draft: SermonDraft; consent: ConsentInput; onCancel: () => void; onSaved: () => void }) {
  const id = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<[number, number]>([0, 0]);
  const [title, setTitle] = useState(draft.title);
  const [text, setText] = useState(draft.text);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const c = draft.counts;
  const total = c.name + c.church + c.contact + c.address;

  // A textarea keeps selectionStart/End after it loses focus; the last non-empty selection is
  // also remembered in case tapping the button collapses it on some mobile browsers.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const remember = () => {
      if (el.selectionEnd > el.selectionStart) selection.current = [el.selectionStart, el.selectionEnd];
    };
    el.addEventListener('select', remember);
    document.addEventListener('selectionchange', remember);
    return () => {
      el.removeEventListener('select', remember);
      document.removeEventListener('selectionchange', remember);
    };
  }, []);
  const hideSelection = () => {
    const el = textRef.current;
    const [a, b] = el && el.selectionEnd > el.selectionStart ? [el.selectionStart, el.selectionEnd] : selection.current;
    const next = maskRange(text, a, b);
    if (next === text) {
      setNote(t('sermons.mask_selection_none'));
      return;
    }
    setNote('');
    setText(next);
    selection.current = [0, 0];
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await saveSermon({ title, text }, consent);
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className="page__title">{t('sermons.preview_title')}</h2>
      <p className="card__muted">{t('sermons.preview_note')}</p>
      <p className="sermons__summary" data-testid="sermon-mask-summary">
        {total > 0 ? t('sermons.masked_summary', { ...c }) : t('sermons.masked_none')}
      </p>
      <label htmlFor={`${id}-title`} className="field__label">
        {t('sermons.title_label')}
      </label>
      <input
        id={`${id}-title`}
        className="field__input"
        type="text"
        autoComplete="off"
        maxLength={100}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        data-testid="sermon-title"
      />
      <label htmlFor={`${id}-text`} className="field__label">
        {t('sermons.text_label')}
      </label>
      <textarea
        ref={textRef}
        id={`${id}-text`}
        className="field__input field__textarea field__textarea--tall"
        value={text}
        onChange={(e) => setText(e.target.value)}
        data-testid="sermon-text"
      />
      <button type="button" className="button button--secondary sermons__mask" onClick={hideSelection} data-testid="sermon-mask-selection">
        {t('sermons.mask_selection')}
      </button>
      <p className="card__muted" role="status">
        {busy ? t('sermons.saving') : note}
      </p>
      {error && (
        <p className="field__error" role="alert" data-testid="sermon-error">
          {error}
        </p>
      )}
      <div className="sermons__actions">
        <button type="button" className="button" disabled={busy || !text.trim()} onClick={() => void save()} data-testid="sermon-save">
          {t('sermons.save')}
        </button>
        <button type="button" className="button button--secondary" onClick={onCancel} data-testid="sermon-preview-cancel">
          {t('sermons.cancel')}
        </button>
      </div>
    </>
  );
}
