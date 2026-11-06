// @vitest-environment node
// S04 text PDF extraction and image PDF rejection (DESIGN 3.9) with the real pdf.js legacy build.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IngestError } from '../../../src/core/sermon/errors';
import { parsePdf, type PdfLoader } from '../../../src/core/sermon/parse/pdf';
import { nodePdfLoader } from '../../helpers/pdf-node';

const fixture = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/sermons/${n}`));
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof IngestError ? e.code : String(e)));

describe('parsePdf', () => {
  it('extracts Korean text with paragraphs from a text PDF', async () => {
    const text = await parsePdf(fixture('sermon.pdf'), nodePdfLoader);
    expect(text).toContain('ZQX-표지-문장');
    expect(text).toContain('포도나무와 가지');
    expect(text).toContain('김철수 집사님');
    // Paragraph breaks survive; wrapped lines inside a paragraph do not become breaks.
    const paras = text.split('\n\n');
    expect(paras.length).toBeGreaterThanOrEqual(4);
    expect(paras.length).toBeLessThanOrEqual(6);
  }, 20_000);

  it('rejects an image-only PDF', async () => {
    expect(await code(parsePdf(fixture('image-only.pdf'), nodePdfLoader))).toBe('IMAGE_PDF');
  }, 20_000);

  it('rejects broken bytes as PDF_INVALID', async () => {
    expect(await code(parsePdf(new TextEncoder().encode('%PDF-1.7 broken'), nodePdfLoader))).toBe('PDF_INVALID');
  }, 20_000);

  it('maps page errors to PDF_INVALID and always closes the document', async () => {
    let closed = 0;
    const loader: PdfLoader = async () => ({
      doc: { numPages: 1, getPage: () => Promise.reject(new Error('boom')) },
      close: async () => {
        closed++;
      },
    });
    expect(await code(parsePdf(new Uint8Array(), loader))).toBe('PDF_INVALID');
    expect(closed).toBe(1);
  });

  it('joins wrapped lines with spaces and splits paragraphs on large gaps', async () => {
    const item = (str: string, y: number, eol = true) => ({ str, hasEOL: eol, transform: [1, 0, 0, 1, 0, y] });
    const loader: PdfLoader = async () => ({
      doc: {
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({
            items: [
              item('첫 문단의 첫 줄이고 내용이 길게 이어지는', 700),
              item('둘째 줄입니다. 그리고 하이픈으로 끝나는 영어 word-', 684),
              item('wrap도 처리합니다.', 668),
              { type: 'beginMarkedContent' },
              item('둘째 문단입니다. 충분히 긴 문장을 넣어 페이지당 글자 수 기준을 넘깁니다.', 630),
              item('계속되는 줄입니다.', 614),
            ],
          }),
        }),
      },
      close: async () => undefined,
    });
    expect(await parsePdf(new Uint8Array(), loader)).toBe(
      '첫 문단의 첫 줄이고 내용이 길게 이어지는 둘째 줄입니다. 그리고 하이픈으로 끝나는 영어 word-wrap도 처리합니다.\n\n둘째 문단입니다. 충분히 긴 문장을 넣어 페이지당 글자 수 기준을 넘깁니다. 계속되는 줄입니다.',
    );
  });
});
