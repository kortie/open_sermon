// Text normalisation shared by every parser (DESIGN 3.9). Paragraphs are separated by one blank line.

/** CRLF → LF, BOM removed, NBSP/tab → space, runs of spaces collapsed, at most one blank line. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\t\u3000]/g, ' ')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .replace(/ {2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Number of non-whitespace characters. */
export function visibleLength(text: string): number {
  return text.replace(/\s/g, '').length;
}
