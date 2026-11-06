// txt bible import, 5 steps (DESIGN 3.14; S11; skill bible-txt-import §4.4):
//   1 file (+ blank sample) → 2 name and language → 3 rights check (required) → 4 check and preview
//   → 5 saved. The file is read only after the rights check, and only on this device. Nothing is sent.
import { useId, useRef, useState } from 'react';
import { bible_db } from '../../../../config/app.config.json';
import { preferences, usePreferences } from '../../../app/preferences';
import { navigate } from '../../../app/router';
import { saveFile } from '../../../app/platform';
import { useBible } from '../../../app/useBible';
import { formatReference } from '../../../core/bible';
import {
  checkFile,
  decodeBytes,
  ImportError,
  inspectText,
  MAX_NAME_CHARS,
  normalizeName,
  sampleTemplate,
  SAMPLE_FILE_NAME,
  saveImportedBible,
  structureFrom,
  type ImportedBibleRecord,
  type ImportReport,
  type Inspection,
} from '../../../core/bible-import';
import { listImportedBibles, type Language } from '../../../core/store';
import { t, useLanguage } from '../../../i18n';
import { ChoiceGroup } from '../../ChoiceGroup';
import { ConsentCheck } from '../../ConsentCheck';
import { useBackHandler } from '../../../app/back';

type Step = 1 | 2 | 3 | 4 | 5;
const SAMPLE_KEYS = ['l01', 'l02', 'l03', 'l04', 'l05', 'l06', 'l07', 'l08', 'l09', 'l10'];
const PREVIEW_VERSES = 5;
const SHOWN_LINES = 10;

const errorText = (err: unknown): string => t(`bible_import.wizard.error.${err instanceof ImportError ? err.code : 'read_failed'}`);

/** Save the blank sample (made by the app; no bible text): download in the browser, share sheet in the app. */
function downloadSample(): void {
  const text = sampleTemplate(SAMPLE_KEYS.map((k) => t(`bible_import.sample.${k}`)));
  void saveFile(SAMPLE_FILE_NAME, new Blob([text], { type: 'text/plain;charset=utf-8' })).catch(() => undefined);
}

export function ImportWizard() {
  const id = useId();
  const lang = useLanguage();
  const prefs = usePreferences();
  const { load } = useBible();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<Language>(prefs.ui_language);
  const [rights, setRights] = useState<{ granted: boolean; at: number }>({ granted: false, at: 0 });
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<ImportedBibleRecord | null>(null);

  const choose = (f: File | null) => {
    setError('');
    setInspection(null);
    setFile(null);
    if (!f) return;
    try {
      checkFile(f.name, f.size);
    } catch (err) {
      return setError(errorText(err));
    }
    setFile(f);
    if (!name) setName([...f.name.replace(/\.[^.]*$/, '').replace(/[_]+/g, ' ')].slice(0, MAX_NAME_CHARS).join('').trim());
  };

  // Step 3 → 4: read and check the file (only after the rights check).
  const check = async () => {
    if (!file || !rights.granted || load.state !== 'ready') return;
    setError('');
    setInspection(null);
    setBusy(true);
    setStep(4);
    try {
      const { text, encoding } = decodeBytes(new Uint8Array(await file.arrayBuffer()));
      setInspection(inspectText(text, encoding, structureFrom(load.repo, bible_db.sources)));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!inspection) return;
    setError('');
    setBusy(true);
    try {
      const meta = await saveImportedBible({ name, language, inspection }, rights);
      await preferences.setImportedBibles((await listImportedBibles()).map((b) => b.id));
      setSaved(meta);
      setStep(5);
    } catch (err) {
      setError(err instanceof ImportError ? errorText(err) : t('bible_import.wizard.error.save_failed'));
    } finally {
      setBusy(false);
    }
  };

  const nameOk = normalizeName(name).length > 0 && [...normalizeName(name)].length <= MAX_NAME_CHARS;
  const back = () => {
    setError('');
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  };
  useBackHandler(step > 1 && step < 5 && !busy, back);

  return (
    <section className="import" aria-labelledby={`${id}-h`} data-testid="bible-import" data-step={step}>
      <h2 id={`${id}-h`} className="page__title">
        {t('bible_import.wizard.title')}
      </h2>
      <p className="card__muted" data-testid="import-step">
        {t('bible_import.wizard.step', { n: step })}
      </p>

      {step === 1 && (
        <div className="card">
          <h3 className="card__title">{t('bible_import.wizard.file_title')}</h3>
          <p>{t('bible_import.wizard.file_hint')}</p>
          <p className="import__format">{t('bible_import.wizard.format_a')}</p>
          <p className="import__format">{t('bible_import.wizard.format_b')}</p>
          <button type="button" className="button button--secondary" onClick={downloadSample} data-testid="import-sample">
            {t('bible_import.wizard.sample')}
          </button>
          <p className="card__muted">{t('bible_import.wizard.sample_hint')}</p>
          <input ref={fileRef} hidden type="file" accept=".txt,text/plain" tabIndex={-1} onChange={(e) => choose(e.target.files?.[0] ?? null)} data-testid="import-file" />
          <button type="button" className="button" onClick={() => fileRef.current?.click()} data-testid="import-file-pick">
            {file ? t('bible_import.wizard.file_change') : t('bible_import.wizard.file_pick')}
          </button>
          {file && (
            <p className="backup__file-name" data-testid="import-file-name">
              {t('bible_import.wizard.file_chosen', { name: file.name })}
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h3 className="card__title">{t('bible_import.wizard.info_title')}</h3>
          <label htmlFor={`${id}-name`} className="field__label">
            {t('bible_import.wizard.name_label')}
          </label>
          <input
            id={`${id}-name`}
            className="field__input"
            value={name}
            maxLength={MAX_NAME_CHARS * 2}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            data-testid="import-name"
          />
          <p className="card__muted">{t('bible_import.wizard.name_hint')}</p>
          <p id={`${id}-lang`} className="field__label">
            {t('bible_import.wizard.language_label')}
          </p>
          <ChoiceGroup
            labelledBy={`${id}-lang`}
            testId="import-language"
            value={language}
            options={(['ko', 'en'] as const).map((l) => ({ value: l, label: t(`language.${l}`), lang: l }))}
            onChange={setLanguage}
          />
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h3 className="card__title">{t('bible_import.wizard.rights_title')}</h3>
          <p>{t('bible_import.wizard.rights_text')}</p>
          <ConsentCheck
            checked={rights.granted}
            onChange={(on) => setRights({ granted: on, at: on ? Date.now() : 0 })}
            label={t('bible_import.wizard.rights_check')}
            testId="import-rights"
          />
          {!rights.granted && <p className="card__muted">{t('bible_import.wizard.rights_required')}</p>}
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <h3 className="card__title">{t('bible_import.wizard.preview_title')}</h3>
          {busy && !inspection && <p role="status">{t('bible_import.wizard.checking')}</p>}
          {inspection && <Preview report={inspection.report} inspection={inspection} lang={lang} />}
        </div>
      )}

      {step === 5 && saved && (
        <div className="card" role="status" data-testid="import-done">
          <h3 className="card__title">{t('bible_import.wizard.done_title')}</h3>
          <p>{t('bible_import.wizard.done_text', { name: saved.name })}</p>
          <div className="sermons__actions">
            <button
              type="button"
              className="button"
              onClick={() => {
                void preferences.chooseBible(saved.id, 'settings').then(() => navigate('read'));
              }}
              data-testid="import-read"
            >
              {t('bible_import.wizard.done_read')}
            </button>
            <button type="button" className="button button--secondary" onClick={() => navigate('settings')} data-testid="import-to-settings">
              {t('bible_import.wizard.done_back')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="field__error" role="alert" data-testid="import-error">
          {error}
        </p>
      )}
      {busy && step === 4 && inspection && <p role="status">{t('bible_import.wizard.saving')}</p>}

      {step < 5 && (
        <div className="sermons__actions">
          {step > 1 && (
            <button type="button" className="button button--secondary" onClick={back} disabled={busy} data-testid="import-back">
              {t('bible_import.wizard.back')}
            </button>
          )}
          {step === 1 && (
            <button type="button" className="button" disabled={!file} onClick={() => setStep(2)} data-testid="import-next">
              {t('bible_import.wizard.next')}
            </button>
          )}
          {step === 2 && (
            <button type="button" className="button" disabled={!nameOk} onClick={() => setStep(3)} data-testid="import-next">
              {t('bible_import.wizard.next')}
            </button>
          )}
          {step === 3 && (
            <button type="button" className="button" disabled={!rights.granted || load.state !== 'ready'} onClick={() => void check()} data-testid="import-next">
              {t('bible_import.wizard.next')}
            </button>
          )}
          {step === 4 && (
            <button type="button" className="button" disabled={busy || !inspection?.report.canSave} onClick={() => void save()} data-testid="import-save">
              {t('bible_import.wizard.save')}
            </button>
          )}
          <button type="button" className="button button--secondary" onClick={() => navigate('settings')} disabled={busy} data-testid="import-cancel">
            {t('bible_import.wizard.cancel')}
          </button>
        </div>
      )}
    </section>
  );
}

const WARN_KEYS = ['duplicates', 'outOfRange', 'unknownBooks', 'badLines'] as const;

function Preview({ report, inspection, lang }: { report: ImportReport; inspection: Inspection; lang: 'ko' | 'en' }) {
  return (
    <div className="import__preview" data-testid="import-preview">
      <p data-testid="import-encoding">{t('bible_import.wizard.encoding', { encoding: t(`bible_import.wizard.encoding_name.${report.encoding}`) })}</p>
      <p data-testid="import-format">{t('bible_import.wizard.format', { format: report.format })}</p>
      <p data-testid="import-counts">{t('bible_import.wizard.counts', { books: report.books, verses: report.verses })}</p>
      {report.partial && <p className="card__muted">{t('bible_import.wizard.partial_note')}</p>}
      {report.missingChapters.length > 0 && <p className="card__muted">{t('bible_import.wizard.missing_chapters', { n: report.missingChapters.length })}</p>}
      {WARN_KEYS.some((k) => report[k].length > 0) && (
        <>
          <h4 className="backup__subtitle">{t('bible_import.wizard.warn_title')}</h4>
          <ul className="import__warnings" data-testid="import-warnings">
            {WARN_KEYS.filter((k) => report[k].length > 0).map((k) => (
              <li key={k}>
                {t(`bible_import.wizard.warn.${k}`, { n: report[k].length })}
                <span className="card__muted"> {t('bible_import.wizard.warn_lines', { lines: report[k].slice(0, SHOWN_LINES).join(', ') })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p data-testid="import-ratio">{t('bible_import.wizard.ratio', { n: Math.round(report.warningRatio * 1000) / 10 })}</p>
      {!report.canSave && report.verses > 0 && (
        <p className="field__error" role="alert" data-testid="import-too-many">
          {t('bible_import.wizard.too_many')}
        </p>
      )}
      {inspection.verses.length > 0 && (
        <>
          <h4 className="backup__subtitle">{t('bible_import.wizard.preview_label')}</h4>
          <ul className="import__verses" data-testid="import-verses">
            {inspection.verses.slice(0, PREVIEW_VERSES).map((v) => (
              <li key={`${v.book}:${v.chapter}:${v.verse}`}>
                <span className="import__ref">{formatReference({ book: v.book, chapter: v.chapter, ranges: [{ start: v.verse, end: v.verse }] }, lang)}</span> {v.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
