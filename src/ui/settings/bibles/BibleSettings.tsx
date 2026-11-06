// Settings → Bible versions (DESIGN 3.12, 3.14, 3.15; S11). The reading bible is chosen in the reader
// (S12); here the imported list allows deleting one bible at a time (all its verses in one
// transaction), importing, and the guide. Deleting the chosen bible returns to the language default.
import { useCallback, useEffect, useId, useState } from 'react';
import { preferences, usePreferences } from '../../../app/preferences';
import { navigate } from '../../../app/router';
import { forgetImportedBible } from '../../../app/useBible';
import { removeImportedBible } from '../../../core/bible-import';
import { listImportedBibles, type ImportedBibleRecord } from '../../../core/store';
import { t, useLanguage } from '../../../i18n';

export function BibleSettings() {
  const id = useId();
  const lang = useLanguage();
  const prefs = usePreferences();
  const [list, setList] = useState<ImportedBibleRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState<ImportedBibleRecord | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const reload = useCallback(() => {
    listImportedBibles().then(
      (l) => {
        setList(l);
        void preferences.setImportedBibles(l.map((b) => b.id));
      },
      () => setFailed(true),
    );
  }, []);
  useEffect(reload, [reload]);

  const remove = async (b: ImportedBibleRecord) => {
    setAsking(null);
    try {
      await removeImportedBible(b.id);
      forgetImportedBible(b.id);
      const wasChosen = prefs.bible_id === b.id;
      const rest = (list ?? []).filter((x) => x.id !== b.id);
      setList(rest);
      await preferences.setImportedBibles(
        rest.map((x) => x.id),
        b.id,
      );
      setMessage({ text: wasChosen ? `${t('bible_import.deleted')} ${t('settings.bible_reset_notice')}` : t('bible_import.deleted'), error: false });
    } catch {
      setMessage({ text: t('bible_import.delete_failed'), error: true });
    }
  };

  const date = (ms: number) => new Date(ms).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US');

  return (
    <>
      <section id="bibles" className="card bibles" aria-labelledby={`${id}-h`} data-testid="settings-bibles">
        <h3 id={`${id}-h`} className="card__title">
          {t('bible_import.manage_title')}
        </h3>
        <p className="card__muted">{t('bible_import.manage_hint')}</p>

        <h4 className="backup__subtitle">{t('bible_import.list_title')}</h4>
        {failed && (
          <p className="field__error" role="alert">
            {t('bible_import.load_failed')}
          </p>
        )}
        {list && list.length === 0 && <p className="card__muted">{t('bible_import.list_empty')}</p>}
        {list && list.length > 0 && (
          <ul className="bibles__list" data-testid="imported-bibles">
            {list.map((b) => (
              <li key={b.id} className="bibles__item" data-testid="imported-bible">
                <p className="bibles__name">
                  {b.name}
                  {b.partial && <span className="bibles__badge">{t('bible_import.partial')}</span>}
                </p>
                <p className="card__muted">{t('bible_import.item_info', { n: b.verse_count, date: date(b.created_at) })}</p>
                <button type="button" className="button button--secondary" onClick={() => setAsking(b)} data-testid="imported-bible-delete">
                  {t('bible_import.delete')}
                </button>
                {asking?.id === b.id && (
                  <div className="backup__confirm" role="alertdialog" aria-labelledby={`${id}-c-${b.id}`} data-testid="imported-bible-confirm">
                    <p id={`${id}-c-${b.id}`}>{t('bible_import.delete_confirm', { name: b.name })}</p>
                    <div className="backup__actions">
                      <button type="button" className="button button--secondary" onClick={() => setAsking(null)}>
                        {t('bible_import.delete_no')}
                      </button>
                      <button type="button" className="button" onClick={() => void remove(b)} data-testid="imported-bible-delete-yes">
                        {t('bible_import.delete_yes')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p role="status" className={message?.error ? 'field__error' : 'sermons__status'} data-testid="imported-bibles-status">
          {message?.text ?? ''}
        </p>
        <div className="sermons__actions">
          <button type="button" className="button" onClick={() => navigate('bible-import')} data-testid="open-bible-import">
            {t('bible_import.open_import')}
          </button>
          <button type="button" className="button button--secondary" onClick={() => navigate('bible-guide')} data-testid="open-bible-guide">
            {t('bible_import.open_guide')}
          </button>
        </div>
      </section>
    </>
  );
}
