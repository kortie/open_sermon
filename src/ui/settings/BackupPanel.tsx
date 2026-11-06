// Settings → backup (DESIGN 3.11, S06, skill local-backup). Export: password twice (8+), the
// lost-password notice is always shown and must be confirmed. Import: pick a file, password,
// conflict choice. The file is saved by the user from a blob: link (browser) or handed to the system
// share sheet (app, S13); nothing is sent anywhere by the app.
// Passwords live only in component state and are cleared after each run.
import { useEffect, useId, useRef, useState } from 'react';
import { isNativeApp, saveFile } from '../../app/platform';
import { loadPreferences } from '../../app/preferences';
import { forgetImportedBible } from '../../app/useBible';
import {
  BackupError,
  backupFileName,
  checkBackupPassword,
  countProviderKeys,
  exportBackup,
  importBackup,
  inspectBackup,
  type BackupInfo,
  type ConflictPolicy,
  type ImportReport,
} from '../../core/backup';
import { listImportedBibles } from '../../core/store';
import { t, useLanguage } from '../../i18n';
import { ChoiceGroup } from '../ChoiceGroup';
import { ConsentCheck } from '../ConsentCheck';

export function BackupPanel() {
  return (
    <section className="card backup" aria-labelledby="set-backup" id="backup" data-testid="settings-backup">
      <h3 id="set-backup" className="card__title">
        {t('backup.title')}
      </h3>
      <p className="card__muted">{t('backup.hint')}</p>
      <p className="card__muted">{t('backup.includes')}</p>
      <p className="card__muted">{t('backup.excludes')}</p>
      <ExportForm />
      <ImportForm />
    </section>
  );
}

function ExportForm() {
  const id = useId();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [keyCount, setKeyCount] = useState(0);
  const [includeKeys, setIncludeKeys] = useState(false);
  const [askKeys, setAskKeys] = useState(false);
  const [bibleCount, setBibleCount] = useState(0);
  const [includeBibles, setIncludeBibles] = useState(false);
  const [askBibles, setAskBibles] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<{ url: string; name: string; blob: Blob } | null>(null);

  useEffect(() => {
    let live = true;
    countProviderKeys()
      .then((n) => live && setKeyCount(n))
      .catch(() => undefined);
    listImportedBibles()
      .then((l) => live && setBibleCount(l.length))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // Release the object URL when it is replaced or the screen closes.
  useEffect(
    () => () => {
      if (file) URL.revokeObjectURL(file.url);
    },
    [file],
  );

  const run = async () => {
    const problem = checkBackupPassword(pw, pw2);
    if (problem) return setError(t(`backup.error.${problem}`));
    setError('');
    setFile(null);
    setBusy(true);
    try {
      const blob = await exportBackup({ password: pw, includeKeys, includeImportedBibles: includeBibles });
      setFile({ url: URL.createObjectURL(blob), name: backupFileName(), blob });
      setPw('');
      setPw2('');
    } catch {
      setError(t('backup.error.export_failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="backup__part" aria-labelledby={`${id}-t`}>
      <h4 id={`${id}-t`} className="backup__subtitle">
        {t('backup.export_title')}
      </h4>
      <label htmlFor={`${id}-pw`} className="field__label">
        {t('backup.password_label')}
      </label>
      <input
        id={`${id}-pw`}
        className="field__input"
        type="password"
        autoComplete="new-password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        data-testid="backup-password"
      />
      <label htmlFor={`${id}-pw2`} className="field__label">
        {t('backup.password_confirm_label')}
      </label>
      <input
        id={`${id}-pw2`}
        className="field__input"
        type="password"
        autoComplete="new-password"
        value={pw2}
        onChange={(e) => setPw2(e.target.value)}
        data-testid="backup-password2"
      />
      <p className="card__muted">{t('backup.password_hint')}</p>
      <p className="backup__notice" data-testid="backup-lost-notice">
        {t('backup.lost_notice')}
      </p>
      <ConsentCheck checked={understood} onChange={setUnderstood} label={t('backup.lost_confirm')} testId="backup-lost-confirm" />
      {keyCount > 0 && (
        <ConsentCheck
          checked={includeKeys}
          onChange={(on) => (on ? setAskKeys(true) : setIncludeKeys(false))}
          label={t('backup.include_keys')}
          note={t('backup.include_keys_note')}
          testId="backup-include-keys"
        />
      )}
      {askKeys && (
        <div className="backup__confirm" role="alertdialog" aria-labelledby={`${id}-kt`} aria-describedby={`${id}-kd`} data-testid="backup-keys-confirm">
          <p id={`${id}-kt`} className="backup__subtitle">
            {t('backup.keys_confirm_title')}
          </p>
          <p id={`${id}-kd`}>{t('backup.keys_confirm_text')}</p>
          <div className="backup__actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setIncludeKeys(false);
                setAskKeys(false);
              }}
            >
              {t('backup.keys_confirm_no')}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                setIncludeKeys(true);
                setAskKeys(false);
              }}
              data-testid="backup-keys-yes"
            >
              {t('backup.keys_confirm_yes')}
            </button>
          </div>
        </div>
      )}
      {bibleCount > 0 && (
        <ConsentCheck
          checked={includeBibles}
          onChange={(on) => (on ? setAskBibles(true) : setIncludeBibles(false))}
          label={t('backup.include_bibles')}
          note={t('backup.include_bibles_note')}
          testId="backup-include-bibles"
        />
      )}
      {askBibles && (
        <div className="backup__confirm" role="alertdialog" aria-labelledby={`${id}-bt`} aria-describedby={`${id}-bd`} data-testid="backup-bibles-confirm">
          <p id={`${id}-bt`} className="backup__subtitle">
            {t('backup.bibles_confirm_title')}
          </p>
          <p id={`${id}-bd`}>{t('backup.bibles_confirm_text')}</p>
          <div className="backup__actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setIncludeBibles(false);
                setAskBibles(false);
              }}
            >
              {t('backup.bibles_confirm_no')}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                setIncludeBibles(true);
                setAskBibles(false);
              }}
              data-testid="backup-bibles-yes"
            >
              {t('backup.bibles_confirm_yes')}
            </button>
          </div>
        </div>
      )}
      <button type="button" className="button" disabled={!understood || busy || askKeys || askBibles} onClick={() => void run()} data-testid="backup-export">
        {t('backup.export_button')}
      </button>
      {busy && (
        <p className="backup__working" role="status" data-testid="backup-working">
          <span className="backup__spinner" aria-hidden="true" />
          {t('backup.working')}
        </p>
      )}
      {error && (
        <p className="field__error" role="alert" data-testid="backup-export-error">
          {error}
        </p>
      )}
      {file && (
        <div className="backup__ready" role="status">
          <p>{t('backup.export_ready')}</p>
          {isNativeApp() ? (
            <button
              type="button"
              className="button"
              onClick={() => void saveFile(file.name, file.blob).catch(() => setError(t('backup.error.export_failed')))}
              data-testid="backup-save"
            >
              {t('backup.save_button')}
            </button>
          ) : (
            <a className="button" href={file.url} download={file.name} data-testid="backup-save">
              {t('backup.save_button')}
            </a>
          )}
          <p className="card__muted">{t('backup.save_hint')}</p>
        </div>
      )}
    </div>
  );
}

function errorText(err: unknown): string {
  return err instanceof BackupError ? t(`backup.error.${err.code}`) : t('backup.error.import_failed');
}

function ImportForm() {
  const id = useId();
  const lang = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [pw, setPw] = useState('');
  const [policy, setPolicy] = useState<ConflictPolicy>('skip');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);

  const choose = async (f: File | null) => {
    setFile(f);
    setInfo(null);
    setReport(null);
    setError('');
    if (!f) return;
    try {
      setInfo(await inspectBackup(f));
    } catch (err) {
      setError(errorText(err));
    }
  };

  const run = async () => {
    if (!file) return;
    setError('');
    setReport(null);
    setBusy(true);
    try {
      const r = await importBackup(file, pw, { onConflict: policy });
      setPw('');
      setReport(r);
      forgetImportedBible();
      await loadPreferences(); // restored language/bible (and imported bibles) apply at once
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const made = info ? new Date(info.createdAt) : null;

  return (
    <div className="backup__part" aria-labelledby={`${id}-t`}>
      <h4 id={`${id}-t`} className="backup__subtitle">
        {t('backup.import_title')}
      </h4>
      <p className="card__muted">{t('backup.import_hint')}</p>
      <input ref={fileRef} hidden type="file" tabIndex={-1} onChange={(e) => void choose(e.target.files?.[0] ?? null)} data-testid="backup-file" />
      <button type="button" className="button button--secondary" onClick={() => fileRef.current?.click()} data-testid="backup-file-pick">
        {file ? t('backup.file_change') : t('backup.file_pick')}
      </button>
      {file && (
        <p className="backup__file-name" data-testid="backup-file-name">
          {t('backup.file_chosen', { name: file.name })}
        </p>
      )}
      {made && !Number.isNaN(made.getTime()) && <p className="card__muted">{t('backup.file_made', { date: made.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US') })}</p>}
      {info && (
        <>
          <label htmlFor={`${id}-pw`} className="field__label">
            {t('backup.import_password_label')}
          </label>
          <input
            id={`${id}-pw`}
            className="field__input"
            type="password"
            autoComplete="off"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            data-testid="backup-import-password"
          />
          <p id={`${id}-c`} className="field__label">
            {t('backup.conflict_title')}
          </p>
          <ChoiceGroup
            labelledBy={`${id}-c`}
            testId="backup-conflict"
            vertical
            value={policy}
            options={(['skip', 'overwrite'] as const).map((v) => ({ value: v, label: t(`backup.conflict.${v}`) }))}
            onChange={setPolicy}
          />
          <button type="button" className="button" disabled={busy || pw.length === 0} onClick={() => void run()} data-testid="backup-import">
            {t('backup.import_button')}
          </button>
        </>
      )}
      {busy && (
        <p className="backup__working" role="status" data-testid="backup-import-working">
          <span className="backup__spinner" aria-hidden="true" />
          {t('backup.import_working')}
        </p>
      )}
      {error && (
        <div className="field__error" role="alert" data-testid="backup-import-error">
          <p>{error}</p>
          <p>{t('backup.unchanged')}</p>
        </div>
      )}
      {report && (
        <div className="backup__ready" role="status" data-testid="backup-import-done">
          <p>
            {t('backup.import_done', {
              sermons: report.written.sermon_meta,
              personas: report.written.persona,
              library: report.written.library_item,
              outlines: report.written.outline,
            })}
          </p>
          {report.written.imported_bible > 0 && <p className="card__muted">{t('backup.import_bibles', { n: report.written.imported_bible })}</p>}
          {report.skipped > 0 && <p className="card__muted">{t('backup.import_skipped', { n: report.skipped })}</p>}
          {report.duplicateSermons > 0 && <p className="card__muted">{t('backup.import_duplicates', { n: report.duplicateSermons })}</p>}
          {report.profilesInvalidated && <p className="card__muted">{t('backup.import_profiles')}</p>}
        </div>
      )}
    </div>
  );
}
