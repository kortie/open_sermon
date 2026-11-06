---
name: bible-txt-import
description: Import a user-owned Bible translation from a .txt file — format A/B detection, mixed-format rejection, UTF-8 then EUC-KR decoding, validation warnings (out-of-range, duplicates, >20% blocks save), rights consent record, preview, IndexedDB storage, per-translation deletion, backup exclusion, blank sample template, and the config/bible-sources.json link registry. Use when touching src/core/bible-import, the translation management screens, or bible-sources.json — e.g. "txt 역본 가져오기", "인코딩 깨짐", "샘플 양식", "내려받기 링크 추가", "import bible txt".
---

# txt 역본 가져오기와 링크 레지스트리

## 1. 언제 쓰나
- S11(구현). S06 백업 제외 기본값, S09 복제 검사 원천 추가와 연결.
- 위치: `src/core/bible-import/`(독립 모듈), 레지스트리 `config/bible-sources.json`.

## 2. 기준 문서
- DESIGN 3.14, 3.15, 4.1(`imported_bible`, `imported_verse`, `consent_log` kind `bible_rights`), 7.3(원천), 9장, 열린 질문 12·13·14.

## 3. 규칙
- 규칙 12: 권리 있는 역본 본문을 포함하거나 내려받기 링크를 만들지 않는다.
- 규칙 21: 권리 확인 체크 후에만 저장, txt 외 거부, 백업·배포 기본 제외, 생성 결과 재인용 금지 지시 + 복제 검사 적용.
- 규칙 22·23: 링크는 `config/bible-sources.json`에서만, 사용자가 누를 때만 열림.
- 파일 내용을 앱이 외부로 전송하지 않는다(파싱은 기기 안). LLM에 보낼 때는 3.9 외부 전송 동의 체계.
- 샘플 양식은 앱이 만든 빈 양식(실제 번역 본문 금지).

## 4. 상세

### 4.1 형식
| 형식 | 줄 패턴 | 예 |
|---|---|---|
| A | `^<책이름>\s*<장>:<절>\s+<본문>$` | `요한복음 3:16 하나님이 …` |
| B | 장 제목 `^<책이름>\s*<장>(장)?$` 다음 `^<절>\s+<본문>$` | `요한복음 3장` / `16 하나님이 …` |
- 판별: 비어 있지 않은 줄 중 A 패턴 비율, B 패턴 비율을 센다. 둘 다 유의미(예: 각각 5% 초과)하면 **혼합 → 거부**. 어느 쪽도 아니면 형식 오류.
- 책 이름은 `bible-reference-parser`의 `lookupBook`(정식명, 약어, 영문). 인식 못한 이름은 경고 목록.
- 줄바꿈 LF/CRLF, 빈 줄 무시, BOM 제거.

### 4.2 인코딩
- `new TextDecoder('utf-8', { fatal: true })` 시도 → 실패 시 `new TextDecoder('euc-kr')`(브라우저에서 windows-949로 처리됨). 어느 쪽으로 읽었는지 미리보기에 표시.
- 둘 다 이상하면(대체 문자 비율 높음) 거부 안내. 인식률 측정 방법은 열린 질문 14.
- 확장자 `.txt`만(`bible_import.accepted_extensions`), 크기 ≤ `max_file_mb`(10MB), 읽기 전 확인.

### 4.3 검사와 경고
```ts
export interface ImportReport { encoding: 'utf-8' | 'euc-kr'; format: 'A' | 'B'; books: number; verses: number;
  missingChapters: string[]; duplicates: Warn[]; outOfRange: Warn[]; unknownBooks: Warn[]; warningRatio: number; partial: boolean }
```
- 절 번호가 장 범위 밖 → `outOfRange`(기준 장·절 수는 번들 DB의 같은 책 구조에서 얻는다 — `bible-db-access`).
- 같은 책·장·절 중복 → 첫 번째만 쓰고 나머지 경고.
- `warningRatio` = 경고 줄 / 전체 절 줄. `max_warning_ratio`(0.2) 초과 → 저장 차단.
- 66권 미만 → `partial: true`("부분 역본" 표시).

### 4.3.1 구현 메모 (S11)
- 모듈: `decode.ts`(`checkFile`, `decodeBytes`), `lines.ts`(`#` 주석·빈 줄 제외), `detectFormat.ts`, `parseA.ts`, `parseB.ts`, `inspect.ts`(`inspectText`, `structureFrom`), `save.ts`, `remove.ts`, `search.ts`(`ImportedRepository`), `sampleTemplate.ts`. 저장소는 `core/store/importedBible.ts`(DB v7).
- `ImportReport`에 `badLines`(형식 밖 줄)와 `canSave`가 더 있고, 경고 목록은 줄 번호 배열이다. 경고 비율 분모는 절 줄 + 형식 밖 줄.
- 가져온 역본 id는 `imp-<uuid>`. 읽기 화면은 `useReader`(app)로 역본 전체를 메모리에 올려 `BibleSource` 계약으로 쓴다. 생성·구성표는 번들 역본만 쓴다.

### 4.4 절차와 저장
1. 파일 고르기(+ 샘플 양식 받기: 형식 A·B 설명 주석과 빈 줄 몇 개만 있는 txt를 `Blob`으로 생성).
2. 역본 정보: 이름, 언어, 메모.
3. 권리 확인 체크 필수 → `consent_log`(bible_rights, at). 미체크면 다음 버튼 비활성.
4. 검사·미리보기(4.3).
5. 저장: `imported_bible` + `imported_verse` 한 트랜잭션. 실패 시 원인 표시, 부분 저장 없음. `no_redistribute = true`.
- 삭제: 역본 단위로 `imported_bible` 행과 해당 `imported_verse` 전부를 한 트랜잭션에서 제거.
- 검색은 전수 검색. 성경 전체 크기 파일로 검색 시간을 측정하고 5초 초과 시 인덱스 검토를 검증 기록에 남긴다.
- 백업: 기본 제외, 포함 시 "본인이 가진 본문만 포함됩니다" 확인(`local-backup`).

### 4.5 레지스트리 `config/bible-sources.json`
```json
[{ "id": "kjv", "name": "King James Version", "language": "en", "rights": "public_domain",
   "read_url": "<확인 후 기록>", "download_url": "<확인 후 기록>", "verified_on": "YYYY-MM-DD",
   "note": "미국 기준 퍼블릭 도메인 (Project Gutenberg 표기 시)" }]
```
- `rights`: `public_domain | copyrighted | unverified`. `public_domain`이 아니거나 `verified_on`이 없으면 `download_url`은 빈 문자열.
- 새 링크는 공식 페이지를 직접 열어 확인하고 날짜를 기록한다. DESIGN 3.15 표의 URL·확인 날짜를 출발점으로 하되 등록 시점에 다시 확인한다.
- 화면: "읽기"는 `read_url`이 있으면, "내려받기"는 `rights=public_domain` + `verified_on` + `download_url`이 모두 있을 때만.
- 구현(S11): 파일은 항목 배열이고 모든 키가 필수(없는 링크·날짜는 빈 문자열, 스키마 `config/bible-sources.schema.json`). 화면 이름은 i18n `bible_guide.name.<id>`, `note`는 i18n `bible_guide.note.<키>`(영문 소문자·숫자·`_`). `read_url`이 있으면 `verified_on`도 있어야 하고, `unverified` 항목은 링크를 두지 않는다. `check-config.mjs`가 이 규칙과 i18n 키 존재를 검사한다.

## 5. 테스트 케이스
- [ ] 형식 A, B 샘플 각각 가져오기 통과
- [ ] A·B 혼합 거부, 형식 불명 거부
- [ ] UTF-8, EUC-KR 파일 각각 인식·표시, BOM, CRLF
- [ ] 중복 절 → 첫 번째 사용, 경고
- [ ] 범위 밖 절 경고, 경고 21% → 저장 차단, 19% → 허용
- [ ] 권리 체크 없이 저장 불가, 체크 시 consent_log 기록
- [ ] .docx/.pdf/.epub 거부, 10MB 초과 거부
- [ ] 역본 삭제 후 imported_verse 0건
- [ ] 백업 기본 payload에 imported_* 없음
- [ ] 샘플 양식에 실제 성경 본문 없음(절 본문 줄 0개)
- [ ] 레지스트리 검사: download_url 있는 항목은 모두 public_domain + verified_on
- [ ] 가져오기 전 과정 네트워크 요청 0

## 6. 작업 후 확인
- `sermon-verify`: `check-config.mjs`(bible-sources 규칙), 산출물에 txt 동봉 없음, src URL 금지, import 경계(`core/bible-import` → llm 금지), `test:network`.
- 수동(backlog): 실제 사용자 보유 euc-kr 파일 인식률, 등록 링크가 실제로 열리는지.
