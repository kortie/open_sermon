// Line splitting shared by format detection and the parsers: LF/CRLF/CR, trimmed, blank lines and
// '#' comment lines (the blank sample template) skipped. trim() also drops a stray BOM. Line numbers are 1-based in the file.
export interface Line {
  no: number;
  text: string;
}

export function splitLines(text: string): Line[] {
  const out: Line[] = [];
  text.split(/\r\n|\n|\r/).forEach((raw, i) => {
    const t = raw.trim();
    if (t && !t.startsWith('#')) out.push({ no: i + 1, text: t });
  });
  return out;
}
