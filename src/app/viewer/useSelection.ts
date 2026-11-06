// Selection state for one chapter (DESIGN 3.1.1). Wraps the pure reducer, vibrates on long press,
// and records local-only counters (local_stats). Nothing leaves the device.
import { useCallback, useEffect, useRef, useState } from 'react';
import { countersFor, initialSelection, reduce, type CounterKey, type SelectionEvent, type SelectionState } from '../../core/selection';
import { incrementStats } from '../../core/store';

export function recordStats(keys: readonly CounterKey[]): void {
  // Metrics are best effort; a storage failure must never disturb reading.
  if (keys.length) incrementStats(keys).catch(() => undefined);
}

export function useSelection(chapterKey: string) {
  const [state, setState] = useState<SelectionState>(() => initialSelection(chapterKey));
  const current = useRef(state);

  const send = useCallback((e: SelectionEvent) => {
    const prev = current.current;
    const next = reduce(prev, e);
    if (next === prev) return;
    current.current = next;
    setState(next);
    if (e.t === 'long_press' && 'vibrate' in navigator) navigator.vibrate(10);
    recordStats(countersFor(prev, next, e));
  }, []);

  // One chapter only: moving to another chapter clears the selection.
  useEffect(() => {
    send({ t: 'chapter_change', chapterKey });
  }, [chapterKey, send]);

  return { state, send, current };
}
