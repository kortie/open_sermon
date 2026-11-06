// Local-only selection metrics (DESIGN 3.1.1 "측정", 4.1 local_stats). Pure rules; storage is
// core/store/local-stats. Nothing here sends data anywhere.
import type { SelectionEvent, SelectionState } from './state';

/** Daily counters stored in local_stats (one record per local date). */
export interface SelectionCounters {
  /** Selection entered by long press. */
  long_press_enter: number;
  /** Press held at least `ATTEMPT_MIN_RATIO` of the threshold, then released before it (a failed attempt). */
  long_press_cancel: number;
  /** Selection entered by the check area (no long press). */
  check_enter: number;
  /** Selection session ended with no action. */
  abandoned: number;
  /** Reference input used to open verses. */
  ref_input: number;
}

export type CounterKey = keyof SelectionCounters;

export const COUNTER_KEYS: readonly CounterKey[] = ['long_press_enter', 'long_press_cancel', 'check_enter', 'abandoned', 'ref_input'];

/**
 * A press released before the threshold counts as a cancelled attempt only when it was held at
 * least half the threshold without moving; quick taps and scroll gestures are not attempts.
 */
export const ATTEMPT_MIN_RATIO = 0.5;

export function emptyCounters(): SelectionCounters {
  return { long_press_enter: 0, long_press_cancel: 0, check_enter: 0, abandoned: 0, ref_input: 0 };
}

/** Counters to increment for one state transition. */
export function countersFor(prev: SelectionState, next: SelectionState, e: SelectionEvent): CounterKey[] {
  const keys: CounterKey[] = [];
  if (prev.mode === 'idle' && next.mode === 'selecting') keys.push(e.t === 'long_press' ? 'long_press_enter' : 'check_enter');
  if (prev.mode === 'selecting' && next.mode === 'idle' && !prev.acted) keys.push('abandoned');
  return keys;
}

/** Was a released press a cancelled long-press attempt? */
export function isCancelledAttempt(heldMs: number, moved: boolean, thresholdMs: number): boolean {
  return !moved && heldMs >= thresholdMs * ATTEMPT_MIN_RATIO && heldMs < thresholdMs;
}

export function sumCounters(days: readonly Partial<SelectionCounters>[]): SelectionCounters {
  const total = emptyCounters();
  for (const d of days) for (const k of COUNTER_KEYS) total[k] += d[k] ?? 0;
  return total;
}

export interface SelectionRates {
  /** long_press_enter / (long_press_enter + long_press_cancel) */
  entrySuccess: number | null;
  /** abandoned / (long_press_enter + check_enter) */
  cancel: number | null;
  /** ref_input / (ref_input + long_press_enter + check_enter) */
  directInput: number | null;
}

const ratio = (num: number, den: number) => (den > 0 ? num / den : null);

export function rates(c: SelectionCounters): SelectionRates {
  const entries = c.long_press_enter + c.check_enter;
  return {
    entrySuccess: ratio(c.long_press_enter, c.long_press_enter + c.long_press_cancel),
    cancel: ratio(c.abandoned, entries),
    directInput: ratio(c.ref_input, c.ref_input + entries),
  };
}
