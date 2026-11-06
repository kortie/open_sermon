// Book → chapter picker made of buttons (inside the reader toolbar's book panel, S12). Native <select> is avoided: WebKit applies a
// user-agent stylesheet to it that our CSP (style-src 'self') reports as a violation.
import { useState } from 'react';
import { BOOKS, bookName, type BibleSource, type BookNo } from '../../core/bible';
import { t, type Lang } from '../../i18n';

interface Props {
  repo: BibleSource;
  bible: string;
  lang: Lang;
  book: BookNo;
  chapter: number;
  onGo: (book: BookNo, chapter: number) => void;
}

const OT_LAST = 39;

export function BookChapterPicker({ repo, bible, lang, book, chapter, onGo }: Props) {
  const [picked, setPicked] = useState<BookNo | null>(null);

  const bookButtons = (from: number, to: number) =>
    BOOKS.slice(from - 1, to).map((b) => (
      <button
        key={b.no}
        type="button"
        className="picker__item"
        aria-pressed={b.no === book}
        onClick={() => setPicked(b.no)}
        data-testid={`pick-book-${b.no}`}
      >
        {bookName(b.no, lang, 'long')}
      </button>
    ));

  return picked === null ? (
    <>
      <p className="picker__title">{t('viewer.picker_books')}</p>
      <p className="picker__group">{t('viewer.testament_ot')}</p>
      <div className="picker__grid">{bookButtons(1, OT_LAST)}</div>
      <p className="picker__group">{t('viewer.testament_nt')}</p>
      <div className="picker__grid">{bookButtons(OT_LAST + 1, BOOKS.length)}</div>
    </>
  ) : (
    <>
      <p className="picker__title">{t('viewer.picker_chapters', { book: bookName(picked, lang, 'long') })}</p>
      <div className="picker__grid picker__grid--numbers">
        {Array.from({ length: repo.chapterCount(bible, picked) }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className="picker__item"
            aria-pressed={picked === book && n === chapter}
            onClick={() => onGo(picked, n)}
            data-testid={`pick-chapter-${n}`}
          >
            {n}
          </button>
        ))}
      </div>
      <button type="button" className="button button--secondary picker__back" onClick={() => setPicked(null)}>
        {t('viewer.picker_back')}
      </button>
    </>
  );
}
