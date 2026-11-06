// Pull the JSON object out of a model reply (DESIGN 6.2). Code fences and stray text around the
// object are tolerated; anything that does not parse is `undefined` (a schema issue).
export function parseOutput(raw: string): unknown {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return undefined;
  }
}
