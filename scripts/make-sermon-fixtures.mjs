#!/usr/bin/env node
/* global document */
// Generates synthetic sermon fixtures for S04 tests (tests/fixtures/sermons/). Developer tool, run once:
//   node scripts/make-sermon-fixtures.mjs
// Content is invented: no real people, churches, phone numbers or addresses. The marker
// "ZQX-표지-문장" lets the storage dump test prove that plaintext never reaches IndexedDB.
// Needs Playwright's Chromium and a Korean font (e.g. Noto Sans CJK KR) for the PDFs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { chromium } from '@playwright/test';

const OUT = 'tests/fixtures/sermons';

export const PARAGRAPHS = [
  '포도나무와 가지',
  '오늘 본문은 요 15:1-8 말씀입니다. ZQX-표지-문장 예수님께서는 "나는 참포도나무요 내 아버지는 농부라"고 말씀하셨습니다. 가지가 나무에 붙어 있을 때에만 열매를 맺는 것처럼, 우리도 주님 안에 머물 때에 비로소 열매를 맺을 수 있습니다. 바울도 갈라디아 교인들에게 성령의 열매를 이야기하면서 같은 원리를 가르쳤습니다.',
  '지난주에 김철수 집사님께서 병원에 다녀오신 이야기를 들려주셨습니다. 몸이 약해지니 오히려 하나님만 붙들게 되었다고 하셨습니다. 이영희 권사님도 비슷한 고백을 나누셨습니다. 연락이 필요하신 분은 010-1234-5678 또는 sample.person@example.com 으로 알려 주시고, 주보에 적힌 02-123-4567 사무실 번호도 쓰실 수 있습니다.',
  '우리 예시가상교회는 서울특별시 가상구 예시로 123 에 있습니다. 다윗은 시편에서 "여호와는 나의 목자시니"라고 노래했습니다. 베드로는 실패한 뒤에도 다시 부르심을 받았습니다. 초대교회 성도들은 날마다 모여 떡을 떼며 기도했습니다. 담임 목사님께서도 늘 기도를 부탁하셨습니다.',
  '가지가 스스로 열매를 맺으려고 애쓰는 것이 아니라 나무에 붙어 있기만 하면 진액이 흘러 열매가 맺힙니다. 이번 한 주도 말씀 안에 머무는 시간을 정해 보십시오. 아침에 짧게라도 본문을 읽고, 하루를 마칠 때 무엇을 붙들고 살았는지 돌아보는 것입니다. 그렇게 할 때 우리의 삶이 조금씩 주님을 닮아 갈 것입니다.',
];

const TEXT = PARAGRAPHS.join('\n\n') + '\n';

function docx(paragraphs) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = paragraphs
    .map((p, i) =>
      i === 4
        ? // one paragraph split over runs, with a tab and a line break, to exercise the extractor
          `<w:p><w:r><w:t xml:space="preserve">${esc(p.slice(0, 20))}</w:t></w:r><w:r><w:tab/><w:t>${esc(p.slice(20, 60))}</w:t><w:br/></w:r><w:r><w:t xml:space="preserve">${esc(p.slice(60))}</w:t></w:r></w:p>`
        : `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`,
    )
    .join('');
  const files = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`,
    ),
  };
  return zipSync(files, { level: 6, mtime: new Date('2026-01-01T00:00:00Z') });
}

async function pdfs() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const html = (inner) =>
    `<!doctype html><meta charset="utf-8"><style>body{font-family:"Noto Sans CJK KR",sans-serif;font-size:14px;line-height:1.6;margin:40px}</style>${inner}`;
  await page.setContent(html(PARAGRAPHS.map((p) => `<p>${p}</p>`).join('')));
  writeFileSync(`${OUT}/sermon.pdf`, await page.pdf({ format: 'A4' }));

  // Image-only PDF: the same text drawn on a canvas and embedded as a PNG (no text layer).
  await page.setContent(html('<img id="img" alt="">'));
  await page.evaluate((lines) => {
    const c = document.createElement('canvas');
    c.width = 700;
    c.height = 900;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000';
    g.font = '16px "Noto Sans CJK KR"';
    lines.forEach((l, i) => g.fillText(l.slice(0, 40), 20, 40 + i * 30));
    document.getElementById('img').src = c.toDataURL('image/png');
  }, PARAGRAPHS);
  await page.waitForFunction(() => document.getElementById('img').complete);
  writeFileSync(`${OUT}/image-only.pdf`, await page.pdf({ format: 'A4' }));
  await browser.close();
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/sermon.txt`, TEXT);
writeFileSync(`${OUT}/sermon.docx`, docx(PARAGRAPHS));
writeFileSync(`${OUT}/not-a-sermon.png`, Buffer.from('89504e470d0a1a0a', 'hex'));
await pdfs();
console.log(`fixtures written to ${OUT}`);
