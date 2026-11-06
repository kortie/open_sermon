// Pull the JSON object out of a model reply (DESIGN 6.2). Code fences and stray text around the
// object are tolerated; anything that does not parse is `undefined` (a schema issue).
// A backslash that starts no JSON escape (the on-device model wrote `\"\ ` once) is dropped and the
// object parsed again; nothing else is repaired.
const STRAY_BACKSLASH = /\\(\\|["/bfnrtu])|\\/g;

export function parseOutput(raw: string): unknown {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  const body = text.slice(start, end + 1);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    try {
      return JSON.parse(body.replace(STRAY_BACKSLASH, (m, kept: string | undefined) => (kept ? m : ''))) as unknown;
    } catch {
      return undefined;
    }
  }
}
