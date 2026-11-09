// "Send by email" and "Save as txt" for a generation result. The app sends nothing itself: the
// email app (or the share sheet) does, and the file goes to the Download folder or where the user
// picks. Status is announced once; failures show a fixed message (no file or email content).
import { useState } from 'react';
import { saveTextFile, sendTextByEmail } from '../../app/platform';
import { t } from '../../i18n';
import { resultFileName, resultSubject, resultText, type ResultTextInput } from './resultText';

type Status = { s: 'idle' } | { s: 'downloads'; name: string } | { s: 'saved' } | { s: 'save_failed' } | { s: 'email_failed' };

export function ResultExport(props: ResultTextInput) {
  const [status, setStatus] = useState<Status>({ s: 'idle' });

  const save = async () => {
    try {
      const subject = resultSubject(props);
      const r = await saveTextFile(resultFileName(subject), resultText(props));
      setStatus(r.kind === 'downloads' ? { s: 'downloads', name: r.name } : r.kind === 'saved' ? { s: 'saved' } : { s: 'idle' });
    } catch {
      setStatus({ s: 'save_failed' });
    }
  };

  const email = async () => {
    try {
      setStatus({ s: 'idle' });
      await sendTextByEmail(resultSubject(props), resultText(props), t('result.export.email_chooser'));
    } catch {
      setStatus({ s: 'email_failed' });
    }
  };

  return (
    <div className="card" data-testid="result-export">
      <div className="stack-actions">
        <button type="button" className="button button--secondary" onClick={() => void email()} data-testid="result-email">
          {t('result.export.email')}
        </button>
        <button type="button" className="button button--secondary" onClick={() => void save()} data-testid="result-save-txt">
          {t('result.export.save_txt')}
        </button>
      </div>
      <p className="card__muted">{t('result.export.note')}</p>
      <p role="status" aria-live="polite" data-testid="result-export-status">
        {status.s === 'downloads' && t('result.export.saved_downloads', { name: status.name })}
        {status.s === 'saved' && t('result.export.saved')}
      </p>
      {(status.s === 'save_failed' || status.s === 'email_failed') && (
        <p className="field__error" role="alert" data-testid="result-export-error">
          {t(status.s === 'save_failed' ? 'result.export.save_failed' : 'result.export.email_failed')}
        </p>
      )}
    </div>
  );
}
