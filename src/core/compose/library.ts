// Library of everyday illustrations and light remarks (DESIGN 3.5). User-written, plain text.
// Search: kind filter, tag filter, verse filter (a shared verse ranks above the same chapter).
import { canonicalRef, parseStoredRefs, referenceOverlap } from '../bible/reference-overlap';
import { parseReference, type Reference } from '../bible/reference-parser';
import { deleteLibraryItem, getLibraryItem, listLibraryItems, putLibraryItem, type LibraryItem, type LibraryKind } from '../store/library';

export const LIBRARY_KINDS: readonly LibraryKind[] = ['example', 'one_liner'];
export const LIBRARY_BODY_MAX = 1000;
export const LIBRARY_TAG_MAX = 20;
export const LIBRARY_TAGS_MAX = 10;
export const LIBRARY_REFS_MAX = 10;

export type LibraryError = 'kind' | 'body_empty' | 'body_too_long' | 'tags' | 'ref';

export interface LibraryDraft {
  id?: string;
  kind: LibraryKind;
  body: string;
  /** References as typed by the user ("요 15:1-8") or canonical. */
  refs: string[];
  /** Tags as typed; split on commas and spaces is done by the screen. */
  tags: string[];
}

export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const n = t.normalize('NFC').replace(/^#/, '').trim().toLowerCase();
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export function validateLibraryDraft(d: LibraryDraft): { ok: true; refs: string[]; tags: string[]; body: string } | { ok: false; errors: LibraryError[] } {
  const errors: LibraryError[] = [];
  if (!LIBRARY_KINDS.includes(d.kind)) errors.push('kind');
  const body = d.body.normalize('NFC').trim();
  if (!body) errors.push('body_empty');
  else if ([...body].length > LIBRARY_BODY_MAX) errors.push('body_too_long');
  const tags = normalizeTags(d.tags);
  if (tags.length > LIBRARY_TAGS_MAX || tags.some((t) => [...t].length > LIBRARY_TAG_MAX)) errors.push('tags');
  const refs: string[] = [];
  for (const r of d.refs.map((x) => x.trim()).filter(Boolean)) {
    const p = parseReference(r);
    if (!p.ok) {
      errors.push('ref');
      break;
    }
    const c = canonicalRef(p.ref);
    if (!refs.includes(c)) refs.push(c);
  }
  if (refs.length > LIBRARY_REFS_MAX && !errors.includes('ref')) errors.push('ref');
  return errors.length ? { ok: false, errors } : { ok: true, refs, tags, body };
}

export async function saveLibraryItem(
  d: LibraryDraft,
  opts: { db?: IDBDatabase; now?: number } = {},
): Promise<{ ok: true; item: LibraryItem } | { ok: false; errors: LibraryError[] }> {
  const v = validateLibraryDraft(d);
  if (!v.ok) return v;
  const now = opts.now ?? Date.now();
  const prev = d.id ? await getLibraryItem(d.id, opts.db) : undefined;
  const item: LibraryItem = {
    id: prev?.id ?? d.id ?? crypto.randomUUID(),
    kind: d.kind,
    body: v.body,
    verse_refs: v.refs,
    tags: v.tags,
    created_at: prev?.created_at ?? now,
    updated_at: now,
  };
  await putLibraryItem(item, opts.db);
  return { ok: true, item };
}

export interface LibraryQuery {
  kind?: LibraryKind;
  /** Tag filter: items with a tag containing this text. */
  tag?: string;
  /** Verse filter: items whose references share the chapter; shared verses rank first. */
  ref?: Reference;
}

export interface LibraryHit {
  item: LibraryItem;
  match: 'verse' | 'chapter' | 'none';
}

/** Pure search over loaded items. Order: verse match, chapter match, then newest. */
export function searchLibrary(items: readonly LibraryItem[], q: LibraryQuery): LibraryHit[] {
  const tag = q.tag ? normalizeTags([q.tag])[0] : undefined;
  const hits: LibraryHit[] = [];
  for (const item of items) {
    if (q.kind && item.kind !== q.kind) continue;
    if (tag && !item.tags.some((t) => t.includes(tag))) continue;
    let match: LibraryHit['match'] = 'none';
    if (q.ref) {
      for (const r of parseStoredRefs(item.verse_refs)) {
        const o = referenceOverlap(q.ref, r);
        if (o.verses > 0 || (o.sameChapter && (q.ref.ranges.length === 0 || r.ranges.length === 0))) match = 'verse';
        else if (o.sameChapter && match === 'none') match = 'chapter';
      }
      if (match === 'none') continue;
    }
    hits.push({ item, match });
  }
  const rank = { verse: 0, chapter: 1, none: 2 } as const;
  return hits.sort((a, b) => rank[a.match] - rank[b.match] || b.item.updated_at - a.item.updated_at || a.item.id.localeCompare(b.item.id));
}

export { deleteLibraryItem, getLibraryItem, listLibraryItems, type LibraryItem, type LibraryKind };
