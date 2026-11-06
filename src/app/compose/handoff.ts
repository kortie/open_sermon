// In-memory hand-off of chosen excerpts from Search My Sermons to a new outline.
// Excerpts are sermon text, so they never go into the URL or any storage: the URL carries only
// a random token, and a reload drops the excerpts. Reading does not consume (StrictMode-safe);
// the next hand-off replaces the previous one.
import type { ExcerptInput } from '../../core/compose';

let pending: { token: string; ref: string; excerpts: ExcerptInput[] } | null = null;

/** Keep the excerpts for the outline about to open; returns the token to put in the URL. */
export function handOffExcerpts(ref: string, excerpts: ExcerptInput[]): string {
  const token = crypto.randomUUID();
  pending = { token, ref, excerpts };
  return token;
}

export function readHandOff(token: string | undefined, ref: string): ExcerptInput[] {
  return token && pending && pending.token === token && pending.ref === ref ? pending.excerpts : [];
}
