// Outline template (DESIGN 3.4). Five fixed sections; quotes come verbatim from the bundled DB
// or from the chosen excerpts; nothing is written for the user — each section has one empty
// user_text block. Quote blocks are not editable; excerpt quotes can be removed.
import { copyCheckBlocks, type CopyMatch, type CopySource } from '../validate/copy-check';

export const SECTION_KEYS = ['title', 'intro', 'exposition', 'application', 'prayer'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type BlockKind = 'quote_bible' | 'quote_excerpt' | 'user_text';

export interface BlockSource {
  /** quote_bible: canonical reference and bible id. */
  ref?: string;
  bible_id?: string;
  /** quote_excerpt: where the excerpt came from. */
  sermon_id?: string;
  chunk_id?: string;
  sermon_title?: string;
}

export interface OutlineBlock {
  id: string;
  kind: BlockKind;
  text: string;
  source?: BlockSource;
}

export interface OutlineSection {
  key: SectionKey;
  blocks: OutlineBlock[];
}

export interface Outline {
  id: string;
  ref: string;
  bible_id: string;
  sections: OutlineSection[];
  created_at: number;
  updated_at: number;
}

export interface ExcerptInput {
  sermonId: string;
  chunkId: string;
  sermonTitle: string;
  text: string;
}

export interface VerseLine {
  verse: number;
  text: string;
}

export const newId = (): string => crypto.randomUUID();

const userBlock = (): OutlineBlock => ({ id: newId(), kind: 'user_text', text: '' });

/** Bible quote text: one line per verse, "<verse> <DB text>". */
export function bibleQuoteText(verses: readonly VerseLine[]): string {
  return verses.map((v) => `${v.verse} ${v.text}`).join('\n');
}

const excerptBlock = (e: ExcerptInput): OutlineBlock => ({
  id: newId(),
  kind: 'quote_excerpt',
  text: e.text,
  source: { sermon_id: e.sermonId, chunk_id: e.chunkId, sermon_title: e.sermonTitle },
});

export function createOutline(input: {
  ref: string;
  bibleId: string;
  verses: readonly VerseLine[];
  excerpts?: readonly ExcerptInput[];
  now?: number;
  id?: string;
}): Outline {
  const now = input.now ?? Date.now();
  const sections = SECTION_KEYS.map((key): OutlineSection => {
    if (key !== 'exposition') return { key, blocks: [userBlock()] };
    const quote: OutlineBlock = { id: newId(), kind: 'quote_bible', text: bibleQuoteText(input.verses), source: { ref: input.ref, bible_id: input.bibleId } };
    return { key, blocks: [quote, ...(input.excerpts ?? []).map(excerptBlock), userBlock()] };
  });
  return { id: input.id ?? newId(), ref: input.ref, bible_id: input.bibleId, sections, created_at: now, updated_at: now };
}

const mapBlocks = (o: Outline, fn: (b: OutlineBlock) => OutlineBlock | null): Outline => ({
  ...o,
  sections: o.sections.map((s) => ({ ...s, blocks: s.blocks.flatMap((b) => fn(b) ?? []) })),
});

/** Change the text of a user_text block. Quote blocks are left untouched. */
export function setBlockText(o: Outline, blockId: string, text: string): Outline {
  return mapBlocks(o, (b) => (b.id === blockId && b.kind === 'user_text' ? { ...b, text } : b));
}

/** Remove an excerpt quote. Bible quotes and user blocks cannot be removed. */
export function removeExcerpt(o: Outline, blockId: string): Outline {
  return mapBlocks(o, (b) => (b.id === blockId && b.kind === 'quote_excerpt' ? null : b));
}

/** Add an excerpt to the exposition, before its user block; the same chunk is never added twice. */
export function addExcerpt(o: Outline, e: ExcerptInput): Outline {
  if (allBlocks(o).some((b) => b.kind === 'quote_excerpt' && b.source?.chunk_id === e.chunkId)) return o;
  return {
    ...o,
    sections: o.sections.map((s) => {
      if (s.key !== 'exposition') return s;
      const at = s.blocks.findIndex((b) => b.kind === 'user_text');
      const blocks = [...s.blocks];
      blocks.splice(at < 0 ? blocks.length : at, 0, excerptBlock(e));
      return { ...s, blocks };
    }),
  };
}

/** Remove every excerpt quoted from one sermon (sermon deletion, DESIGN 3.4). */
export function removeSermonExcerpts(o: Outline, sermonId: string): Outline {
  return mapBlocks(o, (b) => (b.kind === 'quote_excerpt' && b.source?.sermon_id === sermonId ? null : b));
}

export const allBlocks = (o: Outline): OutlineBlock[] => o.sections.flatMap((s) => s.blocks);

export function excerptSermonIds(o: Outline): string[] {
  return [...new Set(allBlocks(o).flatMap((b) => (b.kind === 'quote_excerpt' && b.source?.sermon_id ? [b.source.sermon_id] : [])))];
}

/** The user's title (first block of the title section), trimmed. */
export function outlineTitle(o: Outline): string {
  return (o.sections.find((s) => s.key === 'title')?.blocks.find((b) => b.kind === 'user_text')?.text ?? '').trim();
}

/**
 * Copy check before saving (DESIGN 3.4, 7.3): only user_text blocks are checked; sources are
 * the excerpts quoted in this outline plus any extra sources (imported bible text, S11).
 */
export function checkOutlineCopies(o: Outline, extraSources: readonly CopySource[] = []): { blockId: string; matches: CopyMatch[] }[] {
  const blocks = allBlocks(o);
  const sources: CopySource[] = [
    ...blocks.filter((b) => b.kind === 'quote_excerpt').map((b) => ({ id: b.source?.chunk_id ?? b.id, text: b.text })),
    ...extraSources,
  ];
  return copyCheckBlocks(blocks, sources).map((r) => ({ blockId: r.block.id, matches: r.matches }));
}
