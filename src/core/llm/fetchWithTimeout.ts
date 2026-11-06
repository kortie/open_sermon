// fetch with an AbortController deadline (CLAUDE.md 4.5: 60 s from config generation.timeout_seconds).
// Failures become LlmError('timeout' | 'network'); the original error (which may echo the request)
// is dropped. A caller's `init.signal` (the user's "cancel") aborts the request too; that also
// surfaces as 'network', and the caller tells it apart by its own signal.
import { LlmError, type FetchFn } from './types';

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, fetchFn: FetchFn = (u, i) => fetch(u, i)): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const external = init.signal;
  const onCancel = () => controller.abort();
  if (external?.aborted) controller.abort();
  else external?.addEventListener('abort', onCancel, { once: true });
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch {
    throw new LlmError(timedOut ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onCancel);
  }
}
