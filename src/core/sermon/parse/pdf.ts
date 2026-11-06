// Text PDF extraction (DESIGN 3.9). The pdf.js loader is injected so this logic runs in unit tests
// (Node legacy build) and in the browser (pdf-browser.ts, lazy-loaded, same-origin worker and CMaps).
import { sermon_ingest } from '../../../../config/app.config.json';
import { IngestError } from '../errors';
import { normalizeText, visibleLength } from '../text';

export interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
}

export interface PdfPage {
  getTextContent(): Promise<{ items: unknown[] }>;
}

export interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}

/** Opens the bytes; `close` releases the document and its worker. */
export type PdfLoader = (bytes: Uint8Array) => Promise<{ doc: PdfDocument; close: () => Promise<void> }>;

interface Line {
  text: string;
  y: number | null;
}

function isTextItem(item: unknown): item is PdfTextItem {
  return typeof item === 'object' && item !== null && typeof (item as PdfTextItem).str === 'string';
}

function pageLines(items: unknown[]): Line[] {
  const lines: Line[] = [];
  let cur: Line = { text: '', y: null };
  for (const item of items) {
    if (!isTextItem(item)) continue;
    if (cur.y === null && item.transform && item.str.trim()) cur.y = item.transform[5] ?? null;
    cur.text += item.str;
    if (item.hasEOL) {
      lines.push(cur);
      cur = { text: '', y: null };
    }
  }
  if (cur.text) lines.push(cur);
  return lines.map((l) => ({ text: l.text.replace(/\s+/g, ' ').trim(), y: l.y })).filter((l) => l.text);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? (s[Math.floor(s.length / 2)] ?? 0) : 0;
}

/**
 * Join wrapped lines into paragraphs: a vertical gap clearly larger than the usual line gap
 * starts a new paragraph. Lines inside a paragraph are joined with a space (word wrap), except
 * after a trailing hyphen.
 */
function linesToParagraphs(lines: Line[]): string {
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1]?.y;
    const b = lines[i]?.y;
    if (a != null && b != null && a > b) gaps.push(a - b);
  }
  const usual = median(gaps);
  let out = '';
  lines.forEach((line, i) => {
    if (i === 0) {
      out = line.text;
      return;
    }
    const a = lines[i - 1]?.y;
    const b = line.y;
    const gap = a != null && b != null ? a - b : 0;
    const newParagraph = usual > 0 && (gap > usual * 1.5 || gap < 0);
    if (newParagraph) out += '\n\n' + line.text;
    else if (out.endsWith('-')) out += line.text;
    else out += ' ' + line.text;
  });
  return out;
}

export async function parsePdf(bytes: Uint8Array, load: PdfLoader): Promise<string> {
  let opened: Awaited<ReturnType<PdfLoader>>;
  try {
    opened = await load(bytes);
  } catch {
    throw new IngestError('PDF_INVALID');
  }
  const { doc, close } = opened;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(linesToParagraphs(pageLines(content.items)));
    }
    const text = normalizeText(pages.filter(Boolean).join('\n\n'));
    const perPage = doc.numPages > 0 ? visibleLength(text) / doc.numPages : 0;
    if (perPage < sermon_ingest.image_pdf_min_chars_per_page) throw new IngestError('IMAGE_PDF');
    return text;
  } catch (err) {
    if (err instanceof IngestError) throw err;
    throw new IngestError('PDF_INVALID');
  } finally {
    await close().catch(() => undefined);
  }
}
