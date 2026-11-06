// Verse selection state machine (DESIGN 3.1.1, skill mobile-long-press-selection §4.1).
// Pure: no DOM, no timers. The long-press timer lives in the viewer hook, which sends
// `long_press` once the threshold (ui.long_press_ms) has passed.
import { toBlocks, verseSpan } from './normalize';

export type Mode = 'idle' | 'selecting';

export interface Drag {
  /** Verse where the long press started. */
  anchor: number;
  /** Selection before the drag started; kept as is (DESIGN 3.1.1). */
  base: ReadonlySet<number>;
}

export interface SelectionState {
  mode: Mode;
  verses: ReadonlySet<number>;
  /** bible:book:chapter — selection is limited to one chapter. */
  chapterKey: string;
  drag: Drag | null;
  /** Most recently added verse; "clear last" removes the block that contains it. */
  recent: number | null;
  /** An action (e.g. copy) ran during this selection session (for the cancel-rate count). */
  acted: boolean;
}

export type SelectionEvent =
  | { t: 'long_press'; verse: number }
  | { t: 'tap'; verse: number }
  | { t: 'toggle_check'; verse: number }
  | { t: 'drag_to'; verse: number }
  | { t: 'drag_end' }
  | { t: 'clear_last' }
  | { t: 'clear_all' }
  | { t: 'tap_empty' }
  | { t: 'action' }
  | { t: 'chapter_change'; chapterKey: string };

export function initialSelection(chapterKey: string): SelectionState {
  return { mode: 'idle', verses: new Set(), chapterKey, drag: null, recent: null, acted: false };
}

function withVerses(s: SelectionState, verses: Set<number>, recent: number | null): SelectionState {
  if (verses.size === 0) return initialSelection(s.chapterKey);
  return { ...s, mode: 'selecting', verses, recent, drag: s.drag };
}

function toggle(s: SelectionState, verse: number): SelectionState {
  const next = new Set(s.verses);
  if (next.has(verse)) {
    next.delete(verse);
    return withVerses(s, next, s.recent === verse ? null : s.recent);
  }
  next.add(verse);
  return withVerses(s, next, verse);
}

export function reduce(s: SelectionState, e: SelectionEvent): SelectionState {
  switch (e.t) {
    case 'long_press': {
      // Enters selecting (or adds to it) and starts a drag anchored at this verse.
      const verses = new Set(s.verses).add(e.verse);
      return { ...s, mode: 'selecting', verses, recent: e.verse, drag: { anchor: e.verse, base: s.verses } };
    }
    case 'tap':
      // In idle a tap is plain reading; selection starts only by long press or the check area.
      return s.mode === 'selecting' ? toggle(s, e.verse) : s;
    case 'toggle_check':
      return toggle(s, e.verse);
    case 'drag_to': {
      if (!s.drag) return s;
      const verses = new Set(s.drag.base);
      for (const v of verseSpan(s.drag.anchor, e.verse)) verses.add(v);
      return { ...s, mode: 'selecting', verses, recent: e.verse };
    }
    case 'drag_end':
      return s.drag ? { ...s, drag: null } : s;
    case 'clear_last': {
      if (s.mode === 'idle') return s;
      const blocks = toBlocks(s.verses);
      const target = blocks.find((b) => s.recent !== null && s.recent >= b.start && s.recent <= b.end) ?? blocks[blocks.length - 1];
      const next = new Set(s.verses);
      if (target) for (const v of verseSpan(target.start, target.end)) next.delete(v);
      return withVerses({ ...s, drag: null }, next, null);
    }
    case 'clear_all':
    case 'tap_empty':
      return s.mode === 'idle' ? s : initialSelection(s.chapterKey);
    case 'action':
      return s.mode === 'selecting' ? { ...s, acted: true } : s;
    case 'chapter_change':
      return e.chapterKey === s.chapterKey ? s : initialSelection(e.chapterKey);
  }
}
