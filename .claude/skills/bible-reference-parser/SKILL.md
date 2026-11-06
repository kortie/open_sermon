---
name: bible-reference-parser
description: Parse Korean/English Bible reference strings (e.g. "요 15:1-8, 12", "요한복음 15장 1절", "John 3:16") into structured (book, chapter, verse ranges) and format selections back into reference strings. Use when writing or changing the reference parser, book-name tables, the reference formatter for the action bar, or txt-import book recognition — e.g. "참조 파서 고쳐줘", "책 약어 추가", "parse John 3:16", "reference formatter".
---

# 성경 참조 파서

## 1. 언제 쓰나
- S01(파서 구현, 참조 검색), S03(선택 블록 → 참조 문자열), S11(txt 가져오기의 책 이름 인식).
- 위치: `src/core/bible/books.ts`(책 표), `reference-parser.ts`, `reference-format.ts`. 다른 모듈은 이 모듈의 함수만 쓴다. 책 이름 표를 복사하지 않는다.

## 2. 기준 문서
- DESIGN 3.1(참조 입력), 3.1.1(쉼표 참조, 한 장 한정), 3.2(참조 검색 형식), 3.14(형식 A의 책 이름 인식).

## 3. 규칙
- 화이트리스트 정규식만 쓴다. 입력 길이 상한 50자(초과 시 파싱하지 않고 `TOO_LONG`).
- 파서와 포매터는 같은 책 표와 같은 규칙을 공유한다: `parse(format(x))`는 항상 `x`와 같다.
- 본문 원문은 만들지 않는다(규칙 15). 파서는 위치만 돌려주고, 절 존재 여부는 `bible-db-access`로 확인한다.

## 4. 상세

### 4.1 타입
```ts
export type BookNo = number; // 1..66 (개신교 정경 순서, 내부 번호)
export interface VerseRange { start: number; end: number }        // start <= end
export interface Reference { book: BookNo; chapter: number; ranges: VerseRange[] } // ranges 빈 배열 = 장 전체
export type ParseError =
  | 'EMPTY' | 'TOO_LONG' | 'BAD_CHARS' | 'UNKNOWN_BOOK'
  | 'BAD_FORMAT' | 'REVERSED_RANGE' | 'ZERO_OR_NEGATIVE' | 'MULTI_CHAPTER';
export type ReferenceError = ParseError | 'OUT_OF_RANGE'; // OUT_OF_RANGE는 repository.checkReference가 낸다
export type ParseResult = { ok: true; ref: Reference } | { ok: false; error: ParseError };
export function parseReference(input: string): ParseResult;
export function formatReference(ref: Reference, lang: 'ko' | 'en', style?: 'short' | 'long'): string; // 기본 short
export function lookupBook(name: string): BookNo | null; // 정식명, 약어, 영문명, 영문 약어, DB 코드, 별칭 (전체 토큰 일치)
```
- 내부 책 번호는 `bible.sqlite`의 `books.book`과 같다(1~66, 2026-11-04 확인). DB `books.code`(GEN, JHN, 1JN …)도 별칭으로 받는다.

### 4.2 허용 형식
| 형식 | 예 |
|---|---|
| 약어 장:절 | `요 3:16`, `요3:16` |
| 범위 | `요 15:1-8`, `요 15:1–8`(en dash), `요 15:1~8` |
| 쉼표 목록(같은 장) | `요 15:1-8, 12`, `요 15:1-3,5-7` |
| 장만 | `요 15`, `요한복음 15장`, `John 15` |
| 한국어 장절 | `요한복음 15장 1절`, `요한복음 15장 1-8절`, `요한복음 15장 1절~8절` |
| 영어 | `John 3:16`, `1 John 4:8`, `1John 4:8` (로마자 접두 `I John`은 지원하지 않음, 2026-11-04) |
- 정규화: 앞뒤 공백 제거, 연속 공백 1개, 전각 숫자/콜론 → 반각, 대시류(`-–—~`) → `-`.
- 허용 문자 외(`<>{}` 등)는 `BAD_CHARS`. 장 간 범위(`요 3:16-4:2`)는 MVP에서 `MULTI_CHAPTER`.
- 역순 범위(`요 15:8-1`)는 `REVERSED_RANGE`(자동 교정하지 않는다).
- 쉼표 목록은 정렬하고 겹치거나 인접한 범위를 합친 뒤 돌려준다.

### 4.3 포매터
- 한국어 short: `요 15:1–8, 12`(en dash), long: `요한복음 15:1–8, 12`. 영어: `John 15:1–8, 12`.
- 단일 절은 `요 15:12`, 장 전체는 `요 15`.

### 4.4 책 이름 표 (내부 번호, 정식명, 한국어 약어, 영문 약어)
| # | 정식명 | 약어 | En | # | 정식명 | 약어 | En |
|---|---|---|---|---|---|---|---|
| 1 | 창세기 | 창 | Gen | 34 | 나훔 | 나 | Nah |
| 2 | 출애굽기 | 출 | Exod | 35 | 하박국 | 합 | Hab |
| 3 | 레위기 | 레 | Lev | 36 | 스바냐 | 습 | Zeph |
| 4 | 민수기 | 민 | Num | 37 | 학개 | 학 | Hag |
| 5 | 신명기 | 신 | Deut | 38 | 스가랴 | 슥 | Zech |
| 6 | 여호수아 | 수 | Josh | 39 | 말라기 | 말 | Mal |
| 7 | 사사기 | 삿 | Judg | 40 | 마태복음 | 마 | Matt |
| 8 | 룻기 | 룻 | Ruth | 41 | 마가복음 | 막 | Mark |
| 9 | 사무엘상 | 삼상 | 1Sam | 42 | 누가복음 | 눅 | Luke |
| 10 | 사무엘하 | 삼하 | 2Sam | 43 | 요한복음 | 요 | John |
| 11 | 열왕기상 | 왕상 | 1Kgs | 44 | 사도행전 | 행 | Acts |
| 12 | 열왕기하 | 왕하 | 2Kgs | 45 | 로마서 | 롬 | Rom |
| 13 | 역대상 | 대상 | 1Chr | 46 | 고린도전서 | 고전 | 1Cor |
| 14 | 역대하 | 대하 | 2Chr | 47 | 고린도후서 | 고후 | 2Cor |
| 15 | 에스라 | 스 | Ezra | 48 | 갈라디아서 | 갈 | Gal |
| 16 | 느헤미야 | 느 | Neh | 49 | 에베소서 | 엡 | Eph |
| 17 | 에스더 | 에 | Esth | 50 | 빌립보서 | 빌 | Phil |
| 18 | 욥기 | 욥 | Job | 51 | 골로새서 | 골 | Col |
| 19 | 시편 | 시 | Ps | 52 | 데살로니가전서 | 살전 | 1Thess |
| 20 | 잠언 | 잠 | Prov | 53 | 데살로니가후서 | 살후 | 2Thess |
| 21 | 전도서 | 전 | Eccl | 54 | 디모데전서 | 딤전 | 1Tim |
| 22 | 아가 | 아 | Song | 55 | 디모데후서 | 딤후 | 2Tim |
| 23 | 이사야 | 사 | Isa | 56 | 디도서 | 딛 | Titus |
| 24 | 예레미야 | 렘 | Jer | 57 | 빌레몬서 | 몬 | Phlm |
| 25 | 예레미야애가 | 애 | Lam | 58 | 히브리서 | 히 | Heb |
| 26 | 에스겔 | 겔 | Ezek | 59 | 야고보서 | 약 | Jas |
| 27 | 다니엘 | 단 | Dan | 60 | 베드로전서 | 벧전 | 1Pet |
| 28 | 호세아 | 호 | Hos | 61 | 베드로후서 | 벧후 | 2Pet |
| 29 | 요엘 | 욜 | Joel | 62 | 요한일서 | 요일 | 1John |
| 30 | 아모스 | 암 | Amos | 63 | 요한이서 | 요이 | 2John |
| 31 | 오바댜 | 옵 | Obad | 64 | 요한삼서 | 요삼 | 3John |
| 32 | 요나 | 욘 | Jonah | 65 | 유다서 | 유 | Jude |
| 33 | 미가 | 미 | Mic | 66 | 요한계시록 | 계 | Rev |
- 영문은 정식명(Genesis …, Song of Solomon, Revelation)과 흔한 변형(Ps/Psa/Psalm/Psalms, Song of Songs, Phlm/Philem)도 받는다. 대소문자 무시.
- 주의(오인식): `요`(요한복음) vs `요일·요이·요삼`, `요나`는 정식명만(약어 `욘`), `아`(아가)·`사`(이사야)·`전`(전도서)·`수`(여호수아)는 한 글자라 최장 일치 우선으로 매칭한다.
- 번들 DB의 `books.name_kr`은 위 정식명과 같다(2026-11-04 확인). 영문 short는 `enAbbr`(`1John 4:8`), long은 정식명(`1 John 4:8`).

## 5. 테스트 케이스
- [ ] 정상: `요 3:16`, `요3:16`, `John 3:16`, `1 John 4:8`, `요한복음 15장 1절`
- [ ] 범위·대시류: `-`, `–`, `~`, `1절~8절`
- [ ] 쉼표 목록: `요 15:1-8, 12` → ranges 2개, `요 15:1-3,2-5` → 1-5로 병합, `요 15:1-3,4` → 1-4로 병합
- [ ] 장만: `요 15`, `요한복음 15장`
- [ ] 약어 충돌: `요일 4:8`은 62번, `요 4:8`은 43번
- [ ] 역순 `요 15:8-1` → REVERSED_RANGE, `요 0:1` → ZERO_OR_NEGATIVE
- [ ] 51자 입력 → TOO_LONG, `<script>` → BAD_CHARS, `없는책 1:1` → UNKNOWN_BOOK
- [ ] 장 간 범위 → MULTI_CHAPTER
- [ ] 왕복: 모든 66권 × ko/en × short/long에서 `parse(format(ref))` 일치

## 6. 작업 후 확인
- `sermon-verify` 커버리지: 참조 파서 90% 이상.
- 정적 점검: 파서는 `core/bible`에 있으므로 한글 하드코딩 점검 대상에서 빠진다. UI에서 책 이름을 직접 쓰지 않고 `formatReference`나 i18n을 쓰는지 확인한다.
