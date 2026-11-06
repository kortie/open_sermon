// Local selection metrics (S03, DESIGN 3.1.1 측정, 4.1 local_stats).
import 'fake-indexeddb/auto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initialSelection, reduce, type SelectionEvent } from '../../../src/core/selection/state';
import { countersFor, emptyCounters, isCancelledAttempt, rates, sumCounters } from '../../../src/core/selection/stats';
import { openDb } from '../../../src/core/store/db';
import { getDailyStats, getRecentTotals, incrementStats, localDate } from '../../../src/core/store/local-stats';

const opened: IDBDatabase[] = [];
afterEach(() => opened.splice(0).forEach((db) => db.close()));
let n = 0;
async function freshDb() {
  const db = await openDb(`stats-${++n}-${Date.now()}`);
  opened.push(db);
  return db;
}

describe('countersFor', () => {
  const idle = initialSelection('k');
  const step = (s: typeof idle, e: SelectionEvent) => [reduce(s, e), countersFor(s, reduce(s, e), e)] as const;

  it('counts entries by long press and by check area', () => {
    expect(step(idle, { t: 'long_press', verse: 1 })[1]).toEqual(['long_press_enter']);
    expect(step(idle, { t: 'toggle_check', verse: 1 })[1]).toEqual(['check_enter']);
  });

  it('counts a session ended without any action as abandoned, but not after an action', () => {
    const [sel] = step(idle, { t: 'long_press', verse: 1 });
    expect(step(sel, { t: 'clear_all' })[1]).toEqual(['abandoned']);
    expect(step(sel, { t: 'tap', verse: 1 })[1]).toEqual(['abandoned']);
    expect(step(sel, { t: 'chapter_change', chapterKey: 'other' })[1]).toEqual(['abandoned']);
    const acted = reduce(sel, { t: 'action' });
    expect(step(acted, { t: 'clear_all' })[1]).toEqual([]);
  });

  it('no counters for changes inside a session', () => {
    const [sel] = step(idle, { t: 'long_press', verse: 1 });
    expect(step(sel, { t: 'tap', verse: 2 })[1]).toEqual([]);
    expect(step(sel, { t: 'drag_to', verse: 4 })[1]).toEqual([]);
  });
});

describe('isCancelledAttempt', () => {
  it.each([
    [300, false, true],
    [225, false, true],
    [449, false, true],
    [224, false, false],
    [450, false, false],
    [80, false, false],
    [300, true, false],
  ])('held %ims moved=%s → %s', (held, moved, expected) => {
    expect(isCancelledAttempt(held, moved, 450)).toBe(expected);
  });
});

describe('rates', () => {
  it('follows the formulas and returns null when there is no data', () => {
    expect(rates(emptyCounters())).toEqual({ entrySuccess: null, cancel: null, directInput: null });
    const r = rates({ long_press_enter: 8, long_press_cancel: 2, check_enter: 2, abandoned: 5, ref_input: 10 });
    expect(r.entrySuccess).toBeCloseTo(0.8);
    expect(r.cancel).toBeCloseTo(0.5);
    expect(r.directInput).toBeCloseTo(0.5);
  });

  it('sums partial daily records', () => {
    expect(sumCounters([{ long_press_enter: 1 }, { long_press_enter: 2, ref_input: 3 }])).toEqual({ ...emptyCounters(), long_press_enter: 3, ref_input: 3 });
  });
});

describe('local_stats store', () => {
  it('stores counters per local date', async () => {
    const db = await freshDb();
    const day1 = new Date(2026, 10, 3, 23, 59);
    const day2 = new Date(2026, 10, 4, 0, 1);
    await incrementStats(['long_press_enter', 'abandoned'], day1, db);
    await incrementStats(['long_press_enter'], day1, db);
    await incrementStats(['ref_input'], day2, db);
    await incrementStats([], day2, db);
    const all = await getDailyStats(db);
    expect(all).toEqual([
      { date: '2026-11-03', long_press_enter: 2, abandoned: 1 },
      { date: '2026-11-04', ref_input: 1 },
    ]);
    expect(await getRecentTotals(1, day2, db)).toEqual({ ...emptyCounters(), ref_input: 1 });
    expect(await getRecentTotals(30, day2, db)).toEqual({ ...emptyCounters(), long_press_enter: 2, abandoned: 1, ref_input: 1 });
  });

  it('localDate pads month and day', () => {
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('no external transfer', () => {
  it('selection and local-stats modules use no network APIs and import no llm/generate code', () => {
    const files = [
      ...readdirSync('src/core/selection').map((f) => join('src/core/selection', f)),
      'src/core/store/local-stats.ts',
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
      expect(src, f).not.toMatch(/from ['"][^'"]*\/(llm|generate)(\/|['"])/);
    }
  });
});
