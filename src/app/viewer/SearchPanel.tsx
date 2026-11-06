import { useId, useState, type FormEvent } from 'react';
import {
  formatReference,
  MAX_SEARCH_LENGTH,
  type BibleSource,
  type BookNo,
  type SearchError,
  type SearchHit,
  type VerseRange,
} from '../../core/bible';
import { t, type Lang } from '../../i18n';

interface Props {
  repo: BibleSource;
  bible: string;
  lang: Lang;
  onGo: (book: BookNo, chapter: number, highlight: VerseRange[]) => void;
  initialQuery?: string;
}

interface Results {
  query: string;
  hits: SearchHit[];
  hasMore: boolean;
}

/** Split text around case-insensitive matches so they can be marked without HTML. */
function splitMatches(text: string, query: string): { text: string; match: boolean }[] {
  const out: { text: string; match: boolean }[] = [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let i = 0;
  for (let j = lower.indexOf(q); q && j !== -1; j = lower.indexOf(q, i)) {
    if (j > i) out.push({ text: text.slice(i, j), match: false });
    out.push({ text: text.slice(j, j + q.length), match: true });
    i = j + q.length;
  }
  if (i < text.length) out.push({ text: text.slice(i), match: false });
  return out;
}

function searchFirstPage(repo: BibleSource, bible: string, query: string): { error: SearchError | null; results: Results | null } {
  const r = repo.search(bible, query);
  if (!r.ok) return { error: r.error, results: null };
  return { error: null, results: { query: query.trim(), hits: r.page.hits, hasMore: r.page.hasMore } };
}

export function SearchPanel({ repo, bible, lang, onGo, initialQuery }: Props) {
  const id = useId();
  const [value, setValue] = useState(initialQuery ?? '');
  const [first] = useState(() => (initialQuery !== undefined ? searchFirstPage(repo, bible, initialQuery) : null));
  const [error, setError] = useState<SearchError | null>(first?.error ?? null);
  const [results, setResults] = useState<Results | null>(first?.results ?? null);

  const run = (query: string, offset: number) => {
    if (offset === 0) {
      const next = searchFirstPage(repo, bible, query);
      setError(next.error);
      setResults(next.results);
      return;
    }
    const r = repo.search(bible, query, { offset });
    if (r.ok) setResults((prev) => (prev ? { ...prev, hits: [...prev.hits, ...r.page.hits], hasMore: r.page.hasMore } : prev));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(value, 0);
  };

  return (
    <section className="search">
      <form onSubmit={submit} noValidate role="search">
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
            value={value}
            onChange={(e) => setValue(e.target.value)}
            data-testid="search-input"
          />
          <button type="submit" className="button" data-testid="search-go">
            {t('search.submit')}
          </button>
        </div>
      </form>
      {error && (
        <p className="field__error" role="alert" data-testid="search-error">
          {t(`search.error.${error}`)}
        </p>
      )}
      {results && results.hits.length === 0 && (
        <p className="search__empty" role="status">
          {t('search.no_results')}
        </p>
      )}
      {results && results.hits.length > 0 && (
        <ul className="search__results" aria-label={t('search.results')} data-testid="search-results">
          {results.hits.map((h) => (
            <li key={`${h.book}-${h.chapter}-${h.verse}`}>
              <button
                type="button"
                className="search__hit"
                onClick={() => onGo(h.book, h.chapter, [{ start: h.verse, end: h.verse }])}
              >
                <span className="search__ref">
                  {formatReference({ book: h.book, chapter: h.chapter, ranges: [{ start: h.verse, end: h.verse }] }, lang, 'long')}
                </span>
                <span className="search__text">
                  {splitMatches(h.text, results.query).map((p, i) => (p.match ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {results?.hasMore && (
        <button type="button" className="button button--secondary search__more" onClick={() => run(results.query, results.hits.length)}>
          {t('search.more')}
        </button>
      )}
    </section>
  );
}
