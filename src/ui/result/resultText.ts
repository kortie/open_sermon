// Plain-text form of a generation result, for saving as .txt or sending by email. Same content as
// the screen: quote markers become the bundled verses (never model text), labels come from i18n,
// and the AI-draft notice stays at the end.
import { formatReference, parseReference, verseSet, type Verse } from '../../core/bible';
import { splitQuotes, type GenerationOutput } from '../../core/validate';
import { t } from '../../i18n';

type Lang = 'ko' | 'en';
export type ResultSection = 'sermon' | 'examples' | 'humor';

export interface ResultTextInput {
  output: GenerationOutput;
  humorDropped: boolean;
  verses: readonly Verse[];
  bibleId: string;
  lang: Lang;
  refText: string;
  only?: ResultSection;
}

/** Bundled verses named by a quote marker ("<verse> <text>" per line), or null. */
export function quoteText(refText: string, verses: readonly Verse[]): string | null {
  const p = parseReference(refText);
  if (!p.ok) return null;
  const wanted = p.ref.ranges.length ? verseSet(p.ref) : null;
  const lines = verses.filter((v) => v.book === p.ref.book && v.chapter === p.ref.chapter && (!wanted || wanted.has(v.verse)));
  return lines.length ? lines.map((v) => `${v.verse} ${v.text}`).join('\n') : null;
}

const refLabel = (r: string, lang: Lang) => {
  const p = parseReference(r);
  return p.ok ? formatReference(p.ref, lang) : r;
};

function plain(text: string, verses: readonly Verse[], bibleId: string, lang: Lang): string {
  const out: string[] = [];
  for (const seg of splitQuotes(text)) {
    if (seg.kind === 'text') {
      out.push(
        ...seg.text
          .split(/\n+/)
          .map((p) => p.trim())
          .filter(Boolean),
      );
      continue;
    }
    const q = quoteText(seg.ref, verses);
    if (q) out.push(`[${t('result.quote', { bible: t(`bible.${bibleId}`) })} · ${refLabel(seg.ref, lang)}]\n${q}`);
  }
  return out.join('\n\n');
}

const refsLine = (refs: readonly string[], lang: Lang) => (refs.length ? `${t('result.verse_refs')}: ${refs.map((r) => refLabel(r, lang)).join(', ')}` : '');

const heading = (key: string) => `■ ${t(key)}`;

export function resultSubject({ output, lang, refText, only }: ResultTextInput): string {
  const ref = refLabel(refText, lang);
  const title = (!only || only === 'sermon') && output.sermon.title.trim();
  if (title) return `${title} (${ref})`;
  const key = only === 'examples' ? 'result.examples' : only === 'humor' ? 'result.humor' : 'result.sermon';
  return `${t(key)} (${ref})`;
}

export function resultText(i: ResultTextInput): string {
  const { output, verses, bibleId, lang, only } = i;
  const blocks: string[] = [resultSubject(i), `${refLabel(i.refText, lang)} · ${t(`bible.${bibleId}`)}`];
  if (!only || only === 'sermon') {
    blocks.push([heading('result.sermon'), output.sermon.title.trim(), plain(output.sermon.body, verses, bibleId, lang), refsLine(output.sermon.verse_refs, lang)].filter(Boolean).join('\n\n'));
  }
  if (!only || only === 'examples') {
    const items = output.examples.map((e, n) => [`${n + 1}.`, plain(e.text, verses, bibleId, lang), refsLine(e.verse_refs, lang)].filter(Boolean).join('\n'));
    blocks.push([heading('result.examples'), ...items].join('\n\n'));
  }
  if (!only || only === 'humor') {
    const items =
      i.humorDropped || output.humor.length === 0
        ? [t('result.humor_dropped')]
        : output.humor.map((h) => [h.text.trim(), h.purpose.trim() ? t('result.purpose', { purpose: h.purpose.trim() }) : ''].filter(Boolean).join('\n'));
    blocks.push([heading('result.humor'), ...items].join('\n\n'));
  }
  blocks.push(`— ${t('result.ai_notice')}`);
  return `${blocks.join('\n\n')}\n`;
}

/** File name from the subject: characters file systems refuse are dropped; at most 60 characters. */
export function resultFileName(subject: string): string {
  const cleaned = Array.from(subject, (c) => (c.charCodeAt(0) < 0x20 || '\\/:*?"<>|'.includes(c) ? ' ' : c)).join('');
  const base = Array.from(cleaned.replace(/\s+/g, ' ').trim())
    .slice(0, 60)
    .join('')
    .trim()
    .replace(/[. ]+$/, '');
  return `${base || 'open-sermon'}.txt`;
}
