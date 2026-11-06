// Search My Sermons (DESIGN 3.3): top 3 excerpts for the selected verses, shown on screen only.
// Excerpts live in component state while the screen is open; nothing is cached or stored.
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { formatReference, parseReference, type Reference } from '../../core/bible';
import { listSermons, queryKeywords, searchMySermons, type Excerpt } from '../../core/sermon';
import { t, useLanguage } from '../../i18n';
import { handOffExcerpts } from '../compose/handoff';
import { bundledBible, usePreferences } from '../preferences';
import { navigate } from '../router';
import { useBible } from '../useBible';

type State = { s: 'loading' } | { s: 'no_sermons' } | { s: 'failed' } | { s: 'done'; results: Excerpt[] };

const splitWords = (v: string) => [...new Set(v.split(/[,\s]+/).map((w) => w.trim()).filter(Boolean))].slice(0, 10);

export function Retrieve({ refParam }: { refParam: string }) {
  // Stable identity: the search effect depends on it.
  const parsed = useMemo(() => parseReference(refParam), [refParam]);
  if (!parsed.ok || parsed.ref.ranges.length === 0) {
    return (
      <p className="field__error" role="alert">
        {t('common.bad_ref')}
      </p>
    );
  }
  return <RetrieveFor refText={refParam} reference={parsed.ref} />;
}

function RetrieveFor({ refText, reference }: { refText: string; reference: Reference }) {
  const bible = bundledBible(usePreferences());
  const { load } = useBible();
  if (load.state === 'loading') return <p className="card__muted">{t('common.loading')}</p>;
  // Without the bible text the search still runs on verse references alone.
  const text = load.state === 'ready' ? load.repo.getVerses(bible, reference).map((v) => v.text).join(' ') : '';
  return <RetrieveScreen refText={refText} reference={reference} initialKeywords={queryKeywords(text)} />;
}

function RetrieveScreen({ refText, reference, initialKeywords }: { refText: string; reference: Reference; initialKeywords: string[] }) {
  const id = useId();
  const lang = useLanguage();
  const [words, setWords] = useState(() => initialKeywords.join(', '));
  const [state, setState] = useState<State>({ s: 'loading' });
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const search = useCallback(
    (keywords: string[]) =>
      listSermons()
        .then(async (sermons) => {
          if (sermons.length === 0) return setState({ s: 'no_sermons' });
          const results = await searchMySermons({ refs: [reference], keywords });
          setPicked(new Set());
          setState({ s: 'done', results });
        })
        .catch(() => setState({ s: 'failed' })),
    [reference],
  );

  const [first] = useState(initialKeywords);
  useEffect(() => {
    void search(first);
  }, [search, first]);

  const run = (keywords: string[]) => {
    setState({ s: 'loading' });
    void search(keywords);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(splitWords(words));
  };

  const toggle = (chunkId: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(chunkId)) n.delete(chunkId);
      else n.add(chunkId);
      return n;
    });

  const makeOutline = () => {
    const chosen = state.s === 'done' ? state.results.filter((r) => picked.has(r.chunkId)) : [];
    const pick = handOffExcerpts(
      refText,
      chosen.map((r) => ({ sermonId: r.sermonId, chunkId: r.chunkId, sermonTitle: r.sermonTitle, text: r.text })),
    );
    navigate('outline', chosen.length > 0 ? { ref: refText, pick } : { ref: refText });
  };

  return (
    <div className="retrieve" data-testid="retrieve">
      <h2 className="page__title">{t('retrieve.title')}</h2>
      <p className="card__ref" data-testid="retrieve-ref">
        {formatReference(reference, lang, 'long')}
      </p>
      <p className="card__muted">{t('retrieve.intro')}</p>

      <form onSubmit={submit} noValidate>
        <label htmlFor={`${id}-kw`} className="field__label">
          {t('retrieve.keywords_label')}
        </label>
        <div className="field__row">
          <input
            id={`${id}-kw`}
            className="field__input"
            autoComplete="off"
            maxLength={100}
            value={words}
            onChange={(e) => setWords(e.target.value)}
            data-testid="retrieve-keywords"
          />
          <button type="submit" className="button" data-testid="retrieve-search">
            {t('retrieve.search')}
          </button>
        </div>
      </form>

      <div aria-live="polite">
        {state.s === 'loading' && <p className="card__muted">{t('retrieve.searching')}</p>}
        {state.s === 'failed' && (
          <p className="field__error" role="alert">
            {t('common.load_failed')}
          </p>
        )}
        {state.s === 'no_sermons' && (
          <div data-testid="retrieve-no-sermons">
            <p className="card__muted">{t('retrieve.no_sermons')}</p>
            <button type="button" className="button button--secondary" onClick={() => navigate('sermons')}>
              {t('retrieve.go_sermons')}
            </button>
          </div>
        )}
        {state.s === 'done' && state.results.length === 0 && (
          <p className="card__muted" data-testid="retrieve-none">
            {t('retrieve.none')}
          </p>
        )}
        {state.s === 'done' && state.results.length > 0 && (
          <p className="card__muted" data-testid="retrieve-count">
            {t('retrieve.result_count', { n: state.results.length })}
          </p>
        )}
      </div>

      {state.s === 'done' && state.results.length > 0 && (
        <ol className="excerpts" data-testid="retrieve-results">
          {state.results.map((r) => (
            <li key={r.chunkId} className="excerpts__item" data-testid="retrieve-result">
              <p className="excerpts__from">{t('retrieve.from', { title: r.sermonTitle })}</p>
              <p className="excerpts__reasons">{r.reasons.map((x) => t(`retrieve.reason.${x}`)).join(' · ')}</p>
              <blockquote className="quote quote--excerpt">
                <p className="quote__text">{r.text}</p>
              </blockquote>
              <button
                type="button"
                className="button button--secondary excerpts__pick"
                aria-pressed={picked.has(r.chunkId)}
                onClick={() => toggle(r.chunkId)}
                data-testid="retrieve-pick"
              >
                {picked.has(r.chunkId) ? t('retrieve.picked') : t('retrieve.pick')}
              </button>
            </li>
          ))}
        </ol>
      )}

      <button type="button" className="button retrieve__outline" onClick={makeOutline} data-testid="retrieve-make-outline">
        {picked.size > 0 ? t('retrieve.make_outline') : t('retrieve.make_outline_none')}
      </button>
    </div>
  );
}
