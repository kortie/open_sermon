// Bible viewer (DESIGN 3.1, 3.2; S12 layout). The top of the screen is a single toolbar row —
// [book·chapter] [bible] [search] — so the first verse shows without scrolling. The book panel holds
// the book/chapter picker and the reference input; the bible panel switches the reading bible.
// The DB loads lazily after the first paint (DESIGN ch. 10). Text is rendered as React text nodes only (rule 9).
import { useCallback, useState } from 'react';
import { bookName, parseReference, type BookNo, type VerseRange } from '../../core/bible';
import { t, useLanguage } from '../../i18n';
import { usePreferences } from '../preferences';
import { useReader } from '../useBible';
import { BibleSwitcher, useBibleLabel } from './BibleSwitcher';
import { BookChapterPicker } from './BookChapterPicker';
import { ChapterView } from './ChapterView';
import { ReferenceForm } from './ReferenceForm';
import { SearchPanel } from './SearchPanel';

export interface Position {
  book: BookNo;
  chapter: number;
  highlight: VerseRange[];
  /** Bumped on every navigation so the same target scrolls again. */
  seq: number;
}

interface Props {
  /** Reference to open (e.g. from Home's passage of the day): "JHN 3:16" or a Korean short form. */
  initialRef?: string;
  /** Query to search right away (opens the search tab). */
  initialQuery?: string;
}

type Panel = 'none' | 'book' | 'bible';

function initialPosition(ref: string | undefined): Position {
  const r = ref ? parseReference(ref) : null;
  if (r?.ok) return { book: r.ref.book, chapter: r.ref.chapter, highlight: r.ref.ranges, seq: 1 };
  return { book: 43, chapter: 1, highlight: [], seq: 0 };
}

export function Viewer({ initialRef, initialQuery }: Props) {
  const lang = useLanguage();
  const bible = usePreferences().bible_id;
  const bibleLabel = useBibleLabel(bible);
  const { load, retry } = useReader(bible);
  const [tab, setTab] = useState<'read' | 'search'>(initialQuery !== undefined ? 'search' : 'read');
  const [panel, setPanel] = useState<Panel>('none');
  const [pos, setPos] = useState<Position>(() => initialPosition(initialRef));

  const goTo = useCallback((book: BookNo, chapter: number, highlight: VerseRange[] = []) => {
    setPos((p) => ({ book, chapter, highlight, seq: p.seq + 1 }));
    setTab('read');
    setPanel('none');
  }, []);

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? 'none' : p));

  const toolbar = (
    <div className="reader-bar" role="toolbar" aria-label={t('viewer.toolbar')} data-testid="reader-bar">
      <button
        type="button"
        className="reader-bar__book"
        aria-expanded={panel === 'book'}
        aria-controls="reader-book-panel"
        onClick={() => toggle('book')}
        data-testid="picker-toggle"
      >
        <span className="reader-bar__label">{t('viewer.chapter_heading', { book: bookName(pos.book, lang, 'long'), chapter: pos.chapter })}</span>
        <span className="visually-hidden">{t('viewer.picker_open')}</span>
        <Chevron open={panel === 'book'} />
      </button>
      <button
        type="button"
        className="reader-bar__bible"
        aria-expanded={panel === 'bible'}
        aria-controls="reader-bible-panel"
        onClick={() => toggle('bible')}
        data-testid="reader-bible-toggle"
      >
        <span className="visually-hidden">{t('viewer.bible_choose')}</span>
        <span className="reader-bar__label">{bibleLabel}</span>
        <Chevron open={panel === 'bible'} />
      </button>
      <button
        type="button"
        className="reader-bar__icon"
        aria-label={t('viewer.tab_search')}
        aria-pressed={tab === 'search'}
        onClick={() => {
          setPanel('none');
          setTab((cur) => (cur === 'search' ? 'read' : 'search'));
        }}
        data-testid="reader-search-toggle"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2.2" fill="none" />
          <path d="M15.5 15.5 20 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );

  let body;
  if (load.state === 'loading') {
    body = (
      <p className="viewer__status" role="status" data-testid="viewer-loading">
        {t('viewer.loading')}
      </p>
    );
  } else if (load.state === 'failed') {
    body = (
      <div className="viewer__status" role="alert">
        <p>{t('viewer.load_failed')}</p>
        <button type="button" className="button" onClick={retry}>
          {t('viewer.retry')}
        </button>
      </div>
    );
  } else {
    const { repo } = load;
    body = (
      <>
        {panel === 'book' && (
          <div id="reader-book-panel" className="reader-panel">
            <ReferenceForm repo={repo} bible={bible} lang={lang} onGo={goTo} />
            <div className="picker__panel" data-testid="picker-panel">
              <BookChapterPicker key={`${pos.book}:${pos.chapter}`} repo={repo} bible={bible} lang={lang} book={pos.book} chapter={pos.chapter} onGo={goTo} />
            </div>
          </div>
        )}
        {tab === 'read' ? (
          <ChapterView repo={repo} bible={bible} lang={lang} pos={pos} onGo={goTo} />
        ) : (
          <SearchPanel key={bible} repo={repo} bible={bible} lang={lang} onGo={goTo} initialQuery={initialQuery} />
        )}
      </>
    );
  }

  return (
    <div className="viewer" data-testid="viewer">
      {toolbar}
      {panel === 'bible' && (
        <div id="reader-bible-panel" className="reader-panel">
          <BibleSwitcher current={bible} onDone={() => setPanel('none')} />
        </div>
      )}
      {body}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className="reader-bar__chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
