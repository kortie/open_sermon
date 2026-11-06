// local_stats store (DESIGN 4.1): per-day counters kept on the device only. No export, no network.
import { COUNTER_KEYS, sumCounters, type CounterKey, type SelectionCounters } from '../selection/stats';
import { req, withTransaction } from './db';

export interface DailyStats extends Partial<SelectionCounters> {
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** LLM provider calls made from this device that day, key checks included (DESIGN 3.13.2, 4.3). */
  llm_calls?: number;
}

export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Add 1 to each key for the given day, in one transaction. */
export async function incrementStats(keys: readonly CounterKey[], now = new Date(), db?: IDBDatabase): Promise<void> {
  if (keys.length === 0) return;
  const date = localDate(now);
  await withTransaction(
    'local_stats',
    'readwrite',
    async (tx) => {
      const store = tx.objectStore('local_stats');
      const current = ((await req(store.get(date))) as DailyStats | undefined) ?? { date };
      for (const k of keys) current[k] = (current[k] ?? 0) + 1;
      await req(store.put(current));
    },
    db,
  );
}

/**
 * Count one LLM call for today if fewer than `limit` were made; check and count in one transaction.
 * Returns false (and counts nothing) when the limit is reached. A new local date starts at 0.
 */
export async function takeLlmCall(limit: number, now = new Date(), db?: IDBDatabase): Promise<boolean> {
  const date = localDate(now);
  return withTransaction(
    'local_stats',
    'readwrite',
    async (tx) => {
      const store = tx.objectStore('local_stats');
      const current = ((await req(store.get(date))) as DailyStats | undefined) ?? { date };
      const used = current.llm_calls ?? 0;
      if (used >= limit) return false;
      current.llm_calls = used + 1;
      await req(store.put(current));
      return true;
    },
    db,
  );
}

/** LLM calls counted for the local day of `now`. */
export async function getLlmCalls(now = new Date(), db?: IDBDatabase): Promise<number> {
  const date = localDate(now);
  return withTransaction('local_stats', 'readonly', async (tx) => ((await req(tx.objectStore('local_stats').get(date))) as DailyStats | undefined)?.llm_calls ?? 0, db);
}

export async function getDailyStats(db?: IDBDatabase): Promise<DailyStats[]> {
  return withTransaction('local_stats', 'readonly', (tx) => req(tx.objectStore('local_stats').getAll()) as Promise<DailyStats[]>, db);
}

/** Totals over the last `days` local days including today. */
export async function getRecentTotals(days: number, now = new Date(), db?: IDBDatabase): Promise<SelectionCounters> {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  const min = localDate(from);
  const all = await getDailyStats(db);
  return sumCounters(all.filter((d) => d.date >= min && d.date <= localDate(now)));
}

export { COUNTER_KEYS };
