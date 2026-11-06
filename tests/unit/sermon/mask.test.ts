// S04 masking (DESIGN 3.9, confirmed v0.12): at least two cases per pattern, plus kept words.
import { describe, expect, it } from 'vitest';
import { MANUAL_MASK_TOKEN, maskRange, maskText, totalMasked } from '../../../src/core/sermon/mask';

const masked = (s: string) => maskText(s).text;

describe('maskText', () => {
  it.each([
    ['연락처 010-1234-5678 입니다', '연락처 [연락처] 입니다'],
    ['번호는 01012345678', '번호는 [연락처]'],
    ['011.234.5678로 전화', '[연락처]로 전화'],
    ['010 9876 5432', '[연락처]'],
  ])('mobile: %s', (input, out) => expect(masked(input)).toBe(out));

  it.each([
    ['사무실 02-123-4567', '사무실 [연락처]'],
    ['(031) 234-5678 문의', '[연락처] 문의'],
    ['051.345.6789', '[연락처]'],
    ['대표번호 1588-1234', '대표번호 [연락처]'],
  ])('landline: %s', (input, out) => expect(masked(input)).toBe(out));

  it.each([
    ['메일 sample.person@example.com 으로', '메일 [연락처] 으로'],
    ['a_b+c@mail.co.kr', '[연락처]'],
  ])('email: %s', (input, out) => expect(masked(input)).toBe(out));

  it.each([
    ['주소는 서울특별시 가상구 예시로 123 입니다', '주소는 [주소] 입니다'],
    ['경기도 가상시 예시구 샘플동 45-6번지', '[주소]'],
    ['부산광역시 해운대구 가상길 7', '[주소]'],
    ['가상군 예시면 샘플리 산 12', '[주소]'],
  ])('address: %s', (input, out) => expect(masked(input)).toBe(out));

  it.each([
    ['우리 예시가상교회는', '우리 [교회]는'],
    ['샘플교회에서 만났습니다', '[교회]에서 만났습니다'],
    ['Grace교회 성도', '[교회] 성도'],
  ])('church: %s', (input, out) => expect(masked(input)).toBe(out));

  it.each([
    ['김철수 집사가 말했다', '[이름] 집사가 말했다'],
    ['이영희 권사님께서', '[이름] 권사님께서'],
    ['박민수장로님', '[이름]장로님'],
    ['최은혜 전도사', '[이름] 전도사'],
    ['정하나 성도님과', '[이름] 성도님과'],
    ['홍길동 목사님', '[이름] 목사님'],
  ])('titled name: %s', (input, out) => expect(masked(input)).toBe(out));

  it.each([
    '바울은 로마에 갔습니다',
    '베드로와 다윗',
    '하나님과 예수님',
    '초대교회 성도들은 기도했습니다',
    '담임 목사님께서 말씀하셨다',
    '에베소교회와 빌립보교회',
    '철수가 왔습니다',
    '기도하는 집사님들',
    '교회의 장로들',
    '원로 목사님과 부목사님',
    '요 15:1-8 말씀',
    '2026년 11월 4일 1234명',
    '찬송가 305장',
  ])('keeps: %s', (input) => {
    const r = maskText(input);
    expect(r.text).toBe(input);
    expect(totalMasked(r.counts)).toBe(0);
  });

  it('counts each kind', () => {
    const r = maskText('김철수 집사님 010-1234-5678 a@b.co 예시교회 서울특별시 가상구 예시로 1');
    expect(r.counts).toEqual({ name: 1, church: 1, contact: 2, address: 1 });
  });

  it('is idempotent: masking masked text changes nothing', () => {
    const once = masked('김철수 집사님, 이영희 권사, 예시교회, 010-1234-5678, 서울특별시 가상구 예시로 1');
    expect(masked(once)).toBe(once);
    expect(maskText(once).counts).toEqual({ name: 0, church: 0, contact: 0, address: 0 });
  });
});

describe('maskRange', () => {
  it('replaces the selected range with the manual token', () => {
    expect(maskRange('가나다라마', 1, 3)).toBe(`가${MANUAL_MASK_TOKEN}라마`);
    expect(maskRange('가나다라마', 3, 1)).toBe(`가${MANUAL_MASK_TOKEN}라마`);
  });
  it('ignores empty or whitespace-only ranges', () => {
    expect(maskRange('가 나', 1, 1)).toBe('가 나');
    expect(maskRange('가 나', 1, 2)).toBe('가 나');
    expect(maskRange('가나', -5, 99)).toBe(MANUAL_MASK_TOKEN);
  });
});
