import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { bookName, canonicalRef, formatReference, type BibleSource, type BookNo, type VerseRange } from '../../core/bible';
import { deviceClient, getConnection } from '../../core/llm';
import { selectionReference, selectionText } from '../../core/selection';
import { t, type Lang } from '../../i18n';
import { ActionBar, type SelectionAction } from '../../ui/ActionBar';
import { navigate } from '../router';
import { useLongPress, useTapOutside } from './useLongPress';
import { recordStats, useSelection } from './useSelection';
import { VerseList } from './VerseList';
import type { Position } from './Viewer';

interface Props {
  repo: BibleSource;
  bible: string;
  lang: Lang;
  pos: Position;
  onGo: (book: BookNo, chapter: number, highlight?: VerseRange[]) => void;
}

export function ChapterView({ repo, bible, lang, pos, onGo }: Props) {
  const id = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const verses = useMemo(() => repo.getChapter(bible, pos.book, pos.chapter), [repo, bible, pos.book, pos.chapter]);
  const prev = repo.adjacentChapter(bible, pos.book, pos.chapter, -1);
  const next = repo.adjacentChapter(bible, pos.book, pos.chapter, 1);
  const name = bookName(pos.book, lang, 'long');
  const { state: sel, send } = useSelection(`${bible}:${pos.book}:${pos.chapter}`);
  const [status, setStatus] = useState<'copied' | 'copy_failed' | null>(null);
  const selecting = sel.mode === 'selecting';
  const reference = selecting ? formatReference(selectionReference(pos.book, pos.chapter, sel.verses), lang) : '';

  useLongPress(listRef, {
    onLongPress: (verse) => send({ t: 'long_press', verse }),
    onTap: (verse) => send({ t: 'tap', verse }),
    onDragTo: (verse) => send({ t: 'drag_to', verse }),
    onDragEnd: () => send({ t: 'drag_end' }),
    onCancelledAttempt: () => recordStats(['long_press_cancel']),
  });
  useTapOutside(selecting, () => send({ t: 'tap_empty' }));

  // A new selection (or change) hides the previous copy message.
  const selKey = [...sel.verses].join(',');
  const [shownFor, setShownFor] = useState(selKey);
  if (shownFor !== selKey) {
    setShownFor(selKey);
    setStatus(null);
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(selectionText(reference, verses, sel.verses));
      setStatus('copied');
      send({ t: 'action' });
    } catch {
      setStatus('copy_failed');
    }
  };

  // Independent screens get the canonical reference ("JHN 15:1-8,12") in the URL; no verse text.
  const openAction = (action: SelectionAction) => {
    const ref = canonicalRef(selectionReference(pos.book, pos.chapter, sel.verses));
    send({ t: 'action' });
    if (action === 'outline') navigate('outline', { ref });
    else if (action === 'my_sermons') navigate('retrieve', { ref });
    // The Reflection Draft always opens the generate screen; without a connection it explains
    // the choices there (connect AI / use the outline) and sends nothing (DESIGN 3.1.1, S12).
    else if (action === 'draft') navigate('generate', { ref, kind: 'sermon' });
    else {
      // With an AI connection, or on-device AI turned on and ready (S15), these open generation (S09);
      // otherwise the library (no request).
      const params = { ref, kind: action === 'illustrations' ? 'example' : 'one_liner' };
      (async () => (await getConnection()) !== null || (await deviceClient()) !== null)().then(
        (ai) => navigate(ai ? 'generate' : 'library', params),
        () => navigate('library', params),
      );
    }
  };

  useEffect(() => {
    const first = pos.highlight[0]?.start;
    const target = first ? listRef.current?.querySelector(`[data-verse="${first}"]`) : null;
    if (target) target.scrollIntoView({ block: 'center' });
    else if (pos.seq > 0) window.scrollTo({ top: 0 });
  }, [pos]);

  return (
    <section className="chapter" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="visually-hidden" data-testid="chapter-title">
        {t('viewer.chapter_heading', { book: name, chapter: pos.chapter })}
      </h2>

      {verses.length === 0 && (
        <p className="card__muted" data-testid="chapter-missing">
          {t('viewer.chapter_missing')}
        </p>
      )}

      <VerseList verses={verses} highlight={pos.highlight} selected={sel.verses} listRef={listRef} onCheck={(verse) => send({ t: 'toggle_check', verse })} />

      <nav className="chapter__nav">
        <button
          type="button"
          className="button button--secondary"
          disabled={!prev}
          onClick={() => prev && onGo(prev.book, prev.chapter)}
          data-testid="prev-chapter"
        >
          {t('viewer.prev')}
        </button>
        <button
          type="button"
          className="button button--secondary"
          disabled={!next}
          onClick={() => next && onGo(next.book, next.chapter)}
          data-testid="next-chapter"
        >
          {t('viewer.next')}
        </button>
      </nav>

      {selecting && (
        <ActionBar
          reference={reference}
          count={sel.verses.size}
          status={status}
          onCopy={() => void copy()}
          onClearLast={() => send({ t: 'clear_last' })}
          onClearAll={() => send({ t: 'clear_all' })}
          onAction={openAction}
        />
      )}
    </section>
  );
}
