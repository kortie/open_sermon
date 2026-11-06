// Scripture quote markers (CLAUDE.md rule 15, DESIGN 3.12). The model never writes verse text: it
// puts [[QUOTE <ref>]] where a quote belongs, and the result panel fills in the bundled DB text.
// Quoted text is therefore never part of what the model wrote (length and copy checks skip it).

const MARKER = /\[\[\s*QUOTE\s+([^\]\n]{1,50}?)\s*\]\]/g;

export type Segment = { kind: 'text'; text: string } | { kind: 'quote'; ref: string };

/** Text and quote segments in order. Empty text segments are dropped. */
export function splitQuotes(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKER)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    out.push({ kind: 'quote', ref: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** References named by quote markers. */
export function quoteRefs(text: string): string[] {
  return [...text.matchAll(MARKER)].map((m) => m[1]!);
}

/** The text the model wrote, markers removed. */
export function stripQuotes(text: string): string {
  return text.replace(MARKER, ' ').replace(/[ \t]{2,}/g, ' ');
}
