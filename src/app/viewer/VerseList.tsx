// Verse list with the check area (DESIGN 3.1.1 accessibility fallback). Each verse has a 44×44 px
// toggle button on its left; screen readers hear the i18n keys selection.check_selected / check_select.
import type { RefObject } from 'react';
import type { Verse, VerseRange } from '../../core/bible';
import { t } from '../../i18n';

interface Props {
  verses: readonly Verse[];
  highlight: readonly VerseRange[];
  selected: ReadonlySet<number>;
  listRef: RefObject<HTMLOListElement | null>;
  onCheck: (verse: number) => void;
}

const inRanges = (verse: number, ranges: readonly VerseRange[]) => ranges.some((r) => verse >= r.start && verse <= r.end);

export function VerseList({ verses, highlight, selected, listRef, onCheck }: Props) {
  return (
    <ol className="verses" ref={listRef} aria-label={t('viewer.verse_list')} data-testid="verses">
      {verses.map((v) => {
        const on = selected.has(v.verse);
        const cls = ['verse', inRanges(v.verse, highlight) && 'verse--highlight', on && 'verse--selected'].filter(Boolean).join(' ');
        return (
          <li key={v.verse} className={cls} data-verse={v.verse}>
            <button
              type="button"
              className="verse__check"
              aria-pressed={on}
              aria-label={t(on ? 'selection.check_selected' : 'selection.check_select', { verse: v.verse })}
              onClick={() => onCheck(v.verse)}
              data-testid={`check-${v.verse}`}
            >
              {v.verse}
            </button>
            <span className="verse__text">{v.text}</span>
          </li>
        );
      })}
    </ol>
  );
}
