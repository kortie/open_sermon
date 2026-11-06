// S04 txt and docx parsing (DESIGN 3.9).
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { IngestError } from '../../../src/core/sermon/errors';
import { parseDocx } from '../../../src/core/sermon/parse/docx';
import { parseTxt } from '../../../src/core/sermon/parse/txt';
import { normalizeText } from '../../../src/core/sermon/text';
import { PARAGRAPHS } from '../../../scripts/make-sermon-fixtures.mjs';

const fixture = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/sermons/${n}`));
const code = (f: () => unknown) => {
  try {
    f();
    return 'ok';
  } catch (e) {
    return e instanceof IngestError ? e.code : String(e);
  }
};

describe('normalizeText', () => {
  it('normalises line endings, spaces and blank lines', () => {
    expect(normalizeText('﻿  가\t나 다  \r\n\r\n\r\n\r\n라 \r마  ')).toBe('가 나 다\n\n라\n마');
  });
});

describe('parseTxt', () => {
  it('reads the UTF-8 fixture', () => {
    expect(parseTxt(fixture('sermon.txt'))).toBe(PARAGRAPHS.join('\n\n'));
  });
  it('rejects EUC-KR bytes as ENCODING (no guessing)', () => {
    // "가나" in EUC-KR
    expect(code(() => parseTxt(new Uint8Array([0xb0, 0xa1, 0xb3, 0xaa])))).toBe('ENCODING');
  });
});

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const docx = (body: string) =>
  zipSync({ 'word/document.xml': strToU8(`<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`) });

describe('parseDocx', () => {
  it('reads paragraphs, runs, tabs and breaks from the fixture', () => {
    const text = parseDocx(fixture('sermon.docx'));
    const expected = [...PARAGRAPHS];
    const p5 = PARAGRAPHS[4] ?? '';
    expected[4] = normalizeText(`${p5.slice(0, 20)} ${p5.slice(20, 60)}\n${p5.slice(60)}`);
    expect(text).toBe(expected.join('\n\n'));
  });

  it('skips deleted text and field codes; keeps text in nested elements (hyperlinks, inserts)', () => {
    const text = parseDocx(
      docx(
        `<w:p><w:r><w:t>보이는</w:t></w:r><w:del><w:r><w:delText>지운</w:delText></w:r></w:del><w:hyperlink><w:r><w:t> 링크</w:t></w:r></w:hyperlink><w:r><w:instrText>PAGE</w:instrText></w:r><w:ins><w:r><w:t> 추가</w:t></w:r></w:ins></w:p><w:p/><w:p><w:r><w:t>둘째</w:t></w:r></w:p>`,
      ),
    );
    expect(text).toBe('보이는 링크 추가\n\n둘째');
  });

  it('rejects non-zip, zip without document.xml, and broken XML', () => {
    expect(code(() => parseDocx(new TextEncoder().encode('not a zip')))).toBe('DOCX_INVALID');
    expect(code(() => parseDocx(zipSync({ 'other.xml': strToU8('<a/>') })))).toBe('DOCX_INVALID');
    expect(code(() => parseDocx(zipSync({ 'word/document.xml': strToU8('<w:document') })))).toBe('DOCX_INVALID');
    expect(code(() => parseDocx(zipSync({ 'word/document.xml': new Uint8Array([0xff, 0xfe, 0x00]) })))).toBe('DOCX_INVALID');
    expect(code(() => parseDocx(zipSync({ 'word/document.xml': strToU8(`<w:document xmlns:w="${W}"/>`) })))).toBe('DOCX_INVALID');
  });
});
