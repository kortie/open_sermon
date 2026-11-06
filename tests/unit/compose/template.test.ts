// S05 outline template (DESIGN 3.4): five sections, verbatim quotes, empty user blocks, copy check.
import { describe, expect, it } from 'vitest';
import {
  addExcerpt,
  allBlocks,
  bibleQuoteText,
  checkOutlineCopies,
  createOutline,
  excerptSermonIds,
  outlineTitle,
  removeExcerpt,
  removeSermonExcerpts,
  SECTION_KEYS,
  setBlockText,
} from '../../../src/core/compose/template';

const verses = [
  { verse: 1, text: '나는 참포도나무요 내 아버지는 농부라' },
  { verse: 2, text: '무릇 내게 붙어 있어 과실을 맺지 아니하는 가지는 아버지께서 이를 제해 버리시고' },
];
const ex = (sermonId: string, chunkId: string, text: string) => ({ sermonId, chunkId, sermonTitle: `제목 ${sermonId}`, text });
const EX1 = ex('s1', 'c1', '가지가 나무에 붙어 있을 때에만 열매를 맺는 것처럼 우리도 주님 안에 머물러야 합니다.');
const EX2 = ex('s2', 'c2', '아침에 짧게라도 본문을 읽고 하루를 마칠 때 무엇을 붙들고 살았는지 돌아보십시오.');
const make = () => createOutline({ ref: 'JHN 15:1-2', bibleId: 'krv', verses, excerpts: [EX1, EX2], now: 10 });

describe('createOutline', () => {
  it('five sections in order: title, intro, exposition, application, prayer', () => {
    const o = make();
    expect(o.sections.map((s) => s.key)).toEqual([...SECTION_KEYS]);
    expect(SECTION_KEYS).toEqual(['title', 'intro', 'exposition', 'application', 'prayer']);
  });
  it('the bible quote equals the DB text; excerpts follow verbatim; then an empty user block', () => {
    const exp = make().sections[2]!;
    expect(exp.blocks.map((b) => b.kind)).toEqual(['quote_bible', 'quote_excerpt', 'quote_excerpt', 'user_text']);
    expect(exp.blocks[0]!.text).toBe(`1 ${verses[0]!.text}\n2 ${verses[1]!.text}`);
    expect(exp.blocks[0]!.text).toBe(bibleQuoteText(verses));
    expect(exp.blocks[0]!.source).toEqual({ ref: 'JHN 15:1-2', bible_id: 'krv' });
    expect(exp.blocks[1]!.text).toBe(EX1.text);
    expect(exp.blocks[1]!.source).toEqual({ sermon_id: 's1', chunk_id: 'c1', sermon_title: '제목 s1' });
  });
  it('every user_text starts empty; nothing is written for the user', () => {
    const o = make();
    const user = allBlocks(o).filter((b) => b.kind === 'user_text');
    expect(user).toHaveLength(5);
    expect(user.every((b) => b.text === '')).toBe(true);
    expect(o.created_at).toBe(10);
    expect(new Set(allBlocks(o).map((b) => b.id)).size).toBe(allBlocks(o).length);
  });
  it('works without excerpts', () => {
    expect(createOutline({ ref: 'GEN 1:1', bibleId: 'krv', verses: [{ verse: 1, text: 't' }] }).sections[2]!.blocks.map((b) => b.kind)).toEqual(['quote_bible', 'user_text']);
  });
});

describe('editing', () => {
  it('user text changes; quote blocks cannot be edited', () => {
    let o = make();
    const [quote, , , user] = o.sections[2]!.blocks;
    o = setBlockText(o, user!.id, '제 해설');
    o = setBlockText(o, quote!.id, '바뀐 본문');
    expect(o.sections[2]!.blocks[3]!.text).toBe('제 해설');
    expect(o.sections[2]!.blocks[0]!.text).toBe(bibleQuoteText(verses));
  });
  it('title comes from the title block', () => {
    const o = make();
    expect(outlineTitle(o)).toBe('');
    expect(outlineTitle(setBlockText(o, o.sections[0]!.blocks[0]!.id, '  머무는 삶 '))).toBe('머무는 삶');
  });
  it('excerpts can be removed and added (no duplicates); the bible quote cannot be removed', () => {
    let o = make();
    const [quote, e1] = o.sections[2]!.blocks;
    o = removeExcerpt(o, quote!.id);
    o = removeExcerpt(o, e1!.id);
    expect(o.sections[2]!.blocks.map((b) => b.kind)).toEqual(['quote_bible', 'quote_excerpt', 'user_text']);
    o = addExcerpt(o, EX1);
    o = addExcerpt(o, EX1);
    expect(o.sections[2]!.blocks.map((b) => b.source?.chunk_id ?? b.kind)).toEqual(['quote_bible', 'c2', 'c1', 'user_text']);
    expect(excerptSermonIds(o).sort()).toEqual(['s1', 's2']);
  });
  it('removing a sermon removes only its excerpts', () => {
    const o = removeSermonExcerpts(make(), 's1');
    expect(excerptSermonIds(o)).toEqual(['s2']);
    expect(allBlocks(o)).toHaveLength(allBlocks(make()).length - 1);
  });
});

describe('checkOutlineCopies', () => {
  it('an outline with only quote blocks passes, even with excerpts quoted verbatim', () => {
    expect(checkOutlineCopies(make())).toEqual([]);
  });
  it('user text that copies 20+ characters of an excerpt is reported; quotes are not', () => {
    let o = make();
    const user = o.sections[3]!.blocks[0]!;
    o = setBlockText(o, user.id, `적용: ${EX2.text}`);
    const r = checkOutlineCopies(o);
    expect(r.map((x) => x.blockId)).toEqual([user.id]);
    expect(r[0]!.matches[0]!.sourceId).toBe('c2');
  });
  it('short overlaps and own writing pass; extra sources are checked too', () => {
    let o = make();
    const user = o.sections[1]!.blocks[0]!;
    o = setBlockText(o, user.id, '가지가 나무에 붙어 있을 때 — 제 말로 다시 씁니다.');
    expect(checkOutlineCopies(o)).toEqual([]);
    expect(checkOutlineCopies(o, [{ id: 'imp', text: '제 말로 다시 씁니다만 이것은 가져온 역본 문장입니다' }])).toEqual([]);
    o = setBlockText(o, user.id, '그대로 옮기면: 제 말로 다시 씁니다만 이것은 가져온 역본 문장입니다');
    expect(checkOutlineCopies(o, [{ id: 'imp', text: '제 말로 다시 씁니다만 이것은 가져온 역본 문장입니다' }]).length).toBe(1);
  });
});
