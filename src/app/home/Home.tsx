// Home (DESIGN ch. 8): passage of the day, verse search, My Sermons, outlines and library (S05).
import { useId, useState, type FormEvent } from 'react';
import { home } from '../../../config/app.config.json';
import { formatReference, MAX_SEARCH_LENGTH, parseReference } from '../../core/bible';
import { dailyIndex } from '../../core/store';
import { t, useLanguage } from '../../i18n';
import { usePreferences } from '../preferences';
import { navigate } from '../router';
import { useReader } from '../useBible';

function TodayPassage() {
  const lang = useLanguage();
  const bible = usePreferences().bible_id;
  const { load } = useReader(bible);
  const [today] = useState(() => home.daily_verses[dailyIndex(new Date(), home.daily_verses.length)] ?? 'JHN 3:16');
  const parsed = parseReference(today);
  if (!parsed.ok) return null;
  const verses = load.state === 'ready' ? load.repo.getVerses(bible, parsed.ref) : [];

  return (
    <section className="card" aria-labelledby="today-title" data-testid="today">
      <h2 id="today-title" className="card__title">
        {t('home.today_title')}
      </h2>
      <p className="card__ref" data-testid="today-ref">
        {formatReference(parsed.ref, lang, 'long')}
      </p>
      {load.state === 'loading' && <p className="card__muted">{t('viewer.loading')}</p>}
      {load.state === 'failed' && <p className="card__muted">{t('viewer.load_failed')}</p>}
      {verses.length > 0 && (
        <p className="card__text" data-testid="today-text">
          {verses.map((v) => (
            <span key={v.verse}>
              <span className="verse__no--inline" aria-hidden="true">
                {v.verse}
              </span>{' '}
              {v.text}{' '}
            </span>
          ))}
        </p>
      )}
      <button type="button" className="button" onClick={() => navigate('read', { ref: today })} data-testid="today-open">
        {t('home.today_open')}
      </button>
    </section>
  );
}

function HomeSearch() {
  const id = useId();
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate('search', { q });
  };
  return (
    <section className="card" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="card__title">
        {t('home.search_title')}
      </h2>
      <form onSubmit={submit} role="search" noValidate>
        <label htmlFor={`${id}-q`} className="field__label">
          {t('search.label')}
        </label>
        <div className="field__row">
          <input
            id={`${id}-q`}
            className="field__input"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            maxLength={MAX_SEARCH_LENGTH}
            placeholder={t('search.placeholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="home-search-input"
          />
          <button type="submit" className="button" data-testid="home-search-go">
            {t('search.submit')}
          </button>
        </div>
      </form>
    </section>
  );
}

export function Home() {
  return (
    <div className="home" data-testid="home">
      <TodayPassage />
      <HomeSearch />
      <section className="card" aria-labelledby="my-sermons-title">
        <h2 id="my-sermons-title" className="card__title">
          {t('home.my_sermons_title')}
        </h2>
        <p className="card__muted">{t('home.my_sermons_desc')}</p>
        <button type="button" className="button" onClick={() => navigate('sermons')} data-testid="home-sermons">
          {t('home.my_sermons_open')}
        </button>
      </section>
      <section className="card" aria-labelledby="outlines-title">
        <h2 id="outlines-title" className="card__title">
          {t('home.outlines_title')}
        </h2>
        <p className="card__muted">{t('home.outlines_desc')}</p>
        <button type="button" className="button" onClick={() => navigate('outline')} data-testid="home-outlines">
          {t('home.outlines_open')}
        </button>
      </section>
      <section className="card" aria-labelledby="library-title">
        <h2 id="library-title" className="card__title">
          {t('home.library_title')}
        </h2>
        <p className="card__muted">{t('home.library_desc')}</p>
        <button type="button" className="button" onClick={() => navigate('library')} data-testid="home-library">
          {t('home.library_open')}
        </button>
      </section>
    </div>
  );
}
