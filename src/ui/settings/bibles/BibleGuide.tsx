// Bible version guide (DESIGN 3.15; S11; CLAUDE.md rules 12, 22, 23). Links come from
// config/bible-sources.json only and open only when tapped (plain links: nothing is requested in
// advance). "Download" appears only for public-domain entries with a check date and a link.
import sources from '../../../../config/bible-sources.json';
import { navigate } from '../../../app/router';
import { t } from '../../../i18n';

interface Source {
  id: string;
  rights: 'public_domain' | 'copyrighted' | 'unverified';
  read_url: string;
  download_url: string;
  verified_on: string;
  note: string;
}

const ENTRIES = sources as Source[];

export const canDownload = (s: Source): boolean => s.rights === 'public_domain' && s.verified_on !== '' && s.download_url !== '';

export function BibleGuide() {
  return (
    <section className="guide" aria-labelledby="guide-h" data-testid="bible-guide">
      <h2 id="guide-h" className="page__title">
        {t('bible_guide.title')}
      </h2>
      <p className="card__muted">{t('bible_guide.intro')}</p>
      <ul className="guide__list">
        {ENTRIES.map((s) => (
          <li key={s.id} className="card guide__item" data-testid={`guide-${s.id}`}>
            <h3 className="card__title">{t(`bible_guide.name.${s.id}`)}</h3>
            <p>
              <span className="bibles__badge" data-testid={`guide-rights-${s.id}`}>
                {t(`bible_guide.rights.${s.rights}`)}
              </span>
              {s.verified_on && <span className="card__muted"> {t('bible_guide.verified_on', { date: s.verified_on })}</span>}
            </p>
            {s.note && <p className="card__muted">{t(`bible_guide.note.${s.note}`)}</p>}
            {!s.read_url && !canDownload(s) && <p className="card__muted">{t('bible_guide.no_links')}</p>}
            <div className="sermons__actions">
              {s.read_url && (
                <a className="button button--secondary" href={s.read_url} target="_blank" rel="noopener noreferrer" data-testid={`guide-read-${s.id}`}>
                  {t('bible_guide.read')}
                </a>
              )}
              {canDownload(s) && (
                <a className="button" href={s.download_url} target="_blank" rel="noopener noreferrer" data-testid={`guide-download-${s.id}`}>
                  {t('bible_guide.download')}
                </a>
              )}
            </div>
            {canDownload(s) && <p className="card__muted">{t('bible_guide.download_note')}</p>}
          </li>
        ))}
      </ul>
      <button type="button" className="button button--secondary" onClick={() => navigate('settings')} data-testid="guide-back">
        {t('bible_import.wizard.done_back')}
      </button>
    </section>
  );
}
