// DESIGN 3.1.1 rules as table-driven reducer tests (S03).
import { describe, expect, it } from 'vitest';
import { fromBlocks, toBlocks } from '../../../src/core/selection/normalize';
import { initialSelection, reduce, type SelectionEvent, type SelectionState } from '../../../src/core/selection/state';

const KEY = 'krv:43:15';
const idle = () => initialSelection(KEY);

/** A selecting state with the given verses (entered via the check area, no drag). */
function selected(...verses: number[]): SelectionState {
  return verses.reduce((s, v) => reduce(s, { t: 'toggle_check', verse: v }), idle());
}
const run = (s: SelectionState, ...events: SelectionEvent[]) => events.reduce(reduce, s);
const blocks = (s: SelectionState) => toBlocks(s.verses).map((b) => (b.start === b.end ? `${b.start}` : `${b.start}-${b.end}`));

describe('enter', () => {
  it('idle + long press(5) → selecting {5}, drag anchored at 5', () => {
    const s = reduce(idle(), { t: 'long_press', verse: 5 });
    expect(s.mode).toBe('selecting');
    expect([...s.verses]).toEqual([5]);
    expect(s.drag?.anchor).toBe(5);
  });

  it('a tap in idle does nothing (plain reading)', () => {
    expect(reduce(idle(), { t: 'tap', verse: 5 })).toEqual(idle());
  });

  it('the check area enters selecting without a long press', () => {
    const s = reduce(idle(), { t: 'toggle_check', verse: 27 });
    expect(s.mode).toBe('selecting');
    expect(blocks(s)).toEqual(['27']);
  });
});

describe('tap while selecting', () => {
  it.each<[number[], number, string[]]>([
    // adjacent after / before → the block grows
    [[1, 2, 3], 4, ['1-4']],
    [[3, 4, 5], 2, ['2-5']],
    // distant → a new block, the old one stays
    [[1, 2, 3], 7, ['1-3', '7']],
    // the verse between two blocks → merge
    [[1, 2, 3, 5], 4, ['1-5']],
    // selected verse → only that verse is removed; middle splits the block
    [[1, 2, 3, 4, 5], 3, ['1-2', '4-5']],
    [[1, 2, 3, 4, 5], 1, ['2-5']],
    [[1, 2, 3, 4, 5], 5, ['1-4']],
    [[2, 9], 9, ['2']],
  ])('%j + tap(%i) → %j', (start, verse, expected) => {
    expect(blocks(reduce(selected(...start), { t: 'tap', verse }))).toEqual(expected);
  });

  it('removing the last selected verse returns to idle', () => {
    const s = reduce(selected(5), { t: 'tap', verse: 5 });
    expect(s.mode).toBe('idle');
    expect(s.verses.size).toBe(0);
  });

  it('extending and adding give the same result as Set + normalize', () => {
    for (const [start, verse] of [
      [[1, 2, 3], 4],
      [[3, 4, 5], 2],
      [[1, 2, 3], 7],
      [[1, 3], 2],
    ] as const) {
      const viaReducer = reduce(selected(...start), { t: 'tap', verse });
      const viaSet = toBlocks(new Set([...start, verse]));
      expect(toBlocks(viaReducer.verses)).toEqual(viaSet);
    }
  });
});

describe('drag', () => {
  it('start 3, current 6 → 3–6; moving back to 4 shrinks to 3–4', () => {
    let s = reduce(idle(), { t: 'long_press', verse: 3 });
    s = reduce(s, { t: 'drag_to', verse: 6 });
    expect(blocks(s)).toEqual(['3-6']);
    s = reduce(s, { t: 'drag_to', verse: 4 });
    expect(blocks(s)).toEqual(['3-4']);
  });

  it('reverse drag: start 6, current 2 → 2–6', () => {
    const s = run(idle(), { t: 'long_press', verse: 6 }, { t: 'drag_to', verse: 2 });
    expect(blocks(s)).toEqual(['2-6']);
  });

  it('keeps the selection made before the drag', () => {
    const s = run(selected(1, 2), { t: 'long_press', verse: 10 }, { t: 'drag_to', verse: 12 }, { t: 'drag_to', verse: 11 });
    expect(blocks(s)).toEqual(['1-2', '10-11']);
  });

  it('drag_end stops the drag; later drag_to is ignored', () => {
    let s = run(idle(), { t: 'long_press', verse: 3 }, { t: 'drag_to', verse: 5 }, { t: 'drag_end' });
    expect(s.drag).toBeNull();
    s = reduce(s, { t: 'drag_to', verse: 9 });
    expect(blocks(s)).toEqual(['3-5']);
    expect(reduce(s, { t: 'drag_end' })).toBe(s);
  });
});

describe('clearing', () => {
  it('chapter change → idle with the new chapter key; same key → unchanged', () => {
    const s = selected(1, 2);
    expect(reduce(s, { t: 'chapter_change', chapterKey: KEY })).toBe(s);
    const next = reduce(s, { t: 'chapter_change', chapterKey: 'krv:43:16' });
    expect(next).toEqual(initialSelection('krv:43:16'));
  });

  it('clear all and tap on empty space → idle', () => {
    expect(reduce(selected(1, 5, 9), { t: 'clear_all' }).mode).toBe('idle');
    expect(reduce(selected(1, 5, 9), { t: 'tap_empty' }).mode).toBe('idle');
    expect(reduce(idle(), { t: 'clear_all' })).toEqual(idle());
  });

  it('"clear selection" removes the block holding the most recent verse', () => {
    const s = selected(1, 2, 3, 10, 11, 20);
    // most recent = 20
    expect(blocks(reduce(s, { t: 'clear_last' }))).toEqual(['1-3', '10-11']);
    const s2 = run(selected(10, 11, 20), { t: 'tap', verse: 1 }, { t: 'tap', verse: 2 });
    expect(blocks(reduce(s2, { t: 'clear_last' }))).toEqual(['10-11', '20']);
  });

  it('"clear selection" falls back to the final block, and to idle when nothing remains', () => {
    const s = run(selected(1, 2, 8), { t: 'tap', verse: 8 }); // recent removed
    expect(s.recent).toBeNull();
    expect(blocks(reduce(s, { t: 'clear_last' }))).toEqual([]);
    expect(reduce(s, { t: 'clear_last' }).mode).toBe('idle');
    const s2 = { ...selected(1, 2, 8, 9), recent: null };
    expect(blocks(reduce(s2, { t: 'clear_last' }))).toEqual(['1-2']);
    expect(reduce(idle(), { t: 'clear_last' })).toEqual(idle());
  });

  it('action marks the session; ignored in idle', () => {
    expect(reduce(selected(3), { t: 'action' }).acted).toBe(true);
    expect(reduce(idle(), { t: 'action' })).toEqual(idle());
  });
});

describe('normalize helpers', () => {
  it('toBlocks sorts, merges and ignores invalid numbers; fromBlocks is its inverse', () => {
    expect(toBlocks(new Set([5, 1, 2, 3, 0, -1, 1.5, 7, 6]))).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 7 },
    ]);
    expect(toBlocks(new Set())).toEqual([]);
    expect([...fromBlocks([{ start: 2, end: 4 }, { start: 9, end: 9 }])]).toEqual([2, 3, 4, 9]);
  });
});
