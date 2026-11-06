// PII masking before storage (DESIGN 3.9, confirmed v0.12). The only place for masking patterns.
// Masked: phone numbers, e-mail, addresses, "○○교회", and names followed by a church title.
// Names without a title are kept (biblical names such as 바울, 다윗 would be false positives).
// Replacement tokens are stored data, not UI strings, so they are not in i18n.

export type MaskKind = 'name' | 'church' | 'contact' | 'address';
export type MaskCounts = Record<MaskKind, number>;

export const MASK_TOKEN: Record<MaskKind, string> = {
  name: '[이름]',
  church: '[교회]',
  contact: '[연락처]',
  address: '[주소]',
};
/** Token for ranges the user hides by hand in the preview. */
export const MANUAL_MASK_TOKEN = '[가림]';

// Bounded quantifiers (RFC 5321 lengths) keep matching linear on long letter runs.
const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}/g;
const MOBILE = /(?<!\d)01[016789][-. ]?\d{3,4}[-. ]?\d{4}(?!\d)/g;
// Area code with a separator or in parentheses: 02-123-4567, 031.123.4567, (02) 123-4567.
const LANDLINE = /(?<!\d)(?:\(0\d{1,2}\) ?|0\d{1,2}[-. ])\d{3,4}[-. ]\d{4}(?!\d)/g;
// Nationwide numbers: 1588-1234.
const SERVICE = /(?<!\d)1[5-9]\d{2}-\d{4}(?!\d)/g;

const ADMIN = '[가-힣]{1,10}(?:특별자치시|특별자치도|특별시|광역시|시|도|군|구)';
const ROAD = '[가-힣A-Za-z0-9]{1,20}(?:로|길|동|읍|면|리|가)';
const NUMBER = '(?:산 ?)?\\d{1,5}(?:-\\d{1,5})?(?: ?번지)?';
// 1–3 administrative units, then 1–3 road/dong/eup/myeon/ri units, then a lot or building number.
const ADDRESS = new RegExp(`(?<![가-힣])(?:${ADMIN} ){1,3}(?:${ROAD} ){0,2}${ROAD} ?${NUMBER}(?![\\d])`, 'g');

const CHURCH = /(?<![가-힣A-Za-z])([가-힣A-Za-z]{1,15})교회/g;
/** "○○교회" words that are not a specific congregation (general nouns, New Testament churches). */
const CHURCH_EXCEPTIONS = new Set([
  '초대', '지역', '한국', '세계', '우리', '개', '가정', '보편', '참', '작은', '큰', '모든', '각', '온', '개척',
  '대형', '이', '그', '저', '여러', '다른', '새', '건강한', '좋은', '본', '모', '자', '지', '타', '전', '어느',
  '예루살렘', '안디옥', '에베소', '고린도', '빌립보', '데살로니가', '갈라디아', '로마', '서머나', '버가모',
  '두아디라', '사데', '빌라델비아', '라오디게아', '골로새', '유대', '이방', '아시아',
]);

const TITLED_NAME = /(?<![가-힣[])([가-힣]{1,4})( ?)(전도사|집사|권사|장로|성도|목사)(님)?(?!들)/g;
/** Words before a title that are not names (roles, determiners, adjectives). */
const TITLE_EXCEPTIONS = new Set([
  '담임', '부', '원로', '협동', '은퇴', '안수', '서리', '시무', '명예', '교구', '교육', '전임', '선교', '군종',
  '신임', '우리', '모든', '여러', '많은', '어느', '어떤', '그', '저', '이', '각', '새', '두', '세', '네', '몇',
  '교회', '사랑하는', '귀한', '젊은', '같은', '다른', '청년', '장년', '한', '여자', '남자', '평', '목',
  '초대', '나이든', '집', '선임', '수석', '찬양', '예배', '구역', '지역',
]);
/** Endings that mark a modifier or a particle, not a name ("기도하는 집사님", "교회의 장로"). */
const NOT_NAME_ENDING = /[는의된던운를을와과께은인한할]$/;

function emptyCounts(): MaskCounts {
  return { name: 0, church: 0, contact: 0, address: 0 };
}

export interface MaskResult {
  text: string;
  counts: MaskCounts;
}

/** Mask PII patterns. Pure function; the unmasked input stays in memory only (never stored). */
export function maskText(input: string): MaskResult {
  const counts = emptyCounts();
  const sub = (text: string, re: RegExp, kind: MaskKind) =>
    text.replace(re, () => {
      counts[kind]++;
      return MASK_TOKEN[kind];
    });

  let text = sub(input, EMAIL, 'contact');
  text = sub(text, MOBILE, 'contact');
  text = sub(text, LANDLINE, 'contact');
  text = sub(text, SERVICE, 'contact');
  text = sub(text, ADDRESS, 'address');
  text = text.replace(CHURCH, (whole, name: string) => {
    if (CHURCH_EXCEPTIONS.has(name)) return whole;
    counts.church++;
    return MASK_TOKEN.church;
  });
  text = text.replace(TITLED_NAME, (whole, name: string, space: string, title: string, honorific: string | undefined) => {
    if (TITLE_EXCEPTIONS.has(name) || NOT_NAME_ENDING.test(name)) return whole;
    counts.name++;
    return `${MASK_TOKEN.name}${space}${title}${honorific ?? ''}`;
  });
  return { text, counts };
}

/** Replace [start, end) with the manual mask token (preview "hide selected part"). */
export function maskRange(text: string, start: number, end: number): string {
  const a = Math.max(0, Math.min(start, end, text.length));
  const b = Math.min(text.length, Math.max(start, end));
  if (b <= a || !text.slice(a, b).trim()) return text;
  return text.slice(0, a) + MANUAL_MASK_TOKEN + text.slice(b);
}

export function totalMasked(counts: MaskCounts): number {
  return counts.name + counts.church + counts.contact + counts.address;
}
