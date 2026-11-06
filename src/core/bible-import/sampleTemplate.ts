// Blank sample template (DESIGN 3.14 step 1). Only '#' comment lines (the explanation, passed in by
// the screen from i18n) and blank lines: no bible text at all, and it imports as zero verses.
export const SAMPLE_FILE_NAME = 'bible-template.txt';

export function sampleTemplate(commentLines: readonly string[]): string {
  const body = commentLines.map((l) => `# ${l.replace(/[\r\n]+/g, ' ')}`.trimEnd());
  return `${[...body, '', '', ''].join('\r\n')}`;
}
