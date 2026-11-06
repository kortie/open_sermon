// Device-local daily call limit (DESIGN 4.3, 3.13.2; config local_limits.daily_llm_calls_per_device).
// Every provider call, key checks included, takes one slot first. With no slot left nothing is sent.
import { local_limits } from '../../../config/app.config.json';
import { getLlmCalls, takeLlmCall } from '../store/local-stats';
import { LlmError } from './types';

export const DAILY_LIMIT = local_limits.daily_llm_calls_per_device;

/** Take a slot for today or throw LlmError('daily_limit'). */
export async function takeDailySlot(opts: { now?: Date; limit?: number; db?: IDBDatabase } = {}): Promise<void> {
  if (!(await takeLlmCall(opts.limit ?? DAILY_LIMIT, opts.now ?? new Date(), opts.db))) throw new LlmError('daily_limit');
}

/** Calls left today. */
export async function remainingToday(opts: { now?: Date; limit?: number; db?: IDBDatabase } = {}): Promise<number> {
  return Math.max(0, (opts.limit ?? DAILY_LIMIT) - (await getLlmCalls(opts.now ?? new Date(), opts.db)));
}
