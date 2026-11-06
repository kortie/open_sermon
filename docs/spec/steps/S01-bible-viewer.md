# S01. 번들 DB, 뷰어, 참조 파서, 구절 검색

| 항목 | 값 |
|------|----|
| 선행 | S00 |
| DESIGN 참조 | 2.1.1, 3.1, 3.2, 3.12(기본 역본), 9장, 10장, 12장 6·8 |
| 모듈 | `core/bible`, `src/app`(뷰어 화면) |
| 관련 스킬 | `bible-db-access`, `bible-reference-parser` |

## 목표
`crizin/bible-db` 릴리스 원본을 해시 검증한 뒤 krv·kjv만 뽑은 파생 `bible.sqlite`(DESIGN 2.1.1)를 sql.js로 읽기 전용으로 열고, 장 단위 뷰어, 한·영 참조 파서, 키워드 검색을 만든다.

## 착수 전 확정
1. **DB 파일 실물 확인 (열린 질문 8)**: `crizin/bible-db`의 릴리스 태그, 파일 이름, 크기, SHA-256, `.schema` 결과, 개역한글(krv)과 KJV(kjv) 포함 여부를 실제 파일로 확인한다. 파일을 받을 수 없거나 KJV가 없으면 **멈추고 사용자에게 알린다**. 확인 결과는 `bible-db-access` 스킬의 스키마 절과 `config/app.config.json`(`release_tag`, `sha256`)에 반영한다.
2. **검색 방식(DESIGN 3.2)**: 사용할 sql.js 빌드가 FTS5를 지원하는지 확인한다. 지원하지 않거나 DB에 FTS 인덱스가 없으면 LIKE로 하고, 결정과 근거를 DESIGN.md에 반영한다.
3. **DB 크기와 분할 (열린 질문 6)**: 파일 크기와 4G 첫 화면 1.5초 목표를 비교해, 전체 로딩·지연 로딩·책 단위 분할 중 하나를 고른다. 첫 화면은 DB 로딩을 기다리지 않는 것을 기본으로 한다.

## 범위
- **In**: 파생 DB 빌드(`npm run db:build`)와 `npm run verify:db`, sql.js(WASM 로컬 번들) 로딩, 역본·책·장 조회, 이전/다음 장 이동, 참조 입력창, 참조 파서(쉼표 목록 포함), 키워드 검색, 서비스 워커 캐시에 DB 추가, 푸터 출처 표기(9장).
- **Out**: 선택(S03), 언어·역본 설정 저장(S02 — S01은 기본 역본 krv 고정), 가져온 역본(S11), 인덱스 추가.

## 산출물
```
public/data/bible.sqlite             # 파생 DB (krv·kjv, npm run db:build)
scripts/build-bible-db.mjs           # npm run db:build (원본 .gz 해시 확인 후 추출)
scripts/verify-db.mjs                # npm run verify:db
src/core/bible/db.ts                 # sql.js 초기화, 읽기 전용 열기
src/core/bible/repository.ts         # getChapter, getBooks, search (파라미터 바인딩)
src/core/bible/books.ts              # 책 번호·정식명·약어·영문 약어 표
src/core/bible/reference-parser.ts   # parse(input) → Result<RefList, ParseError>
src/core/bible/reference-format.ts   # format(RefList, lang) → "요 15:1–8, 12"
src/app/viewer/                      # 뷰어 화면, 책·장 선택, 참조 입력, 검색 결과
tests/unit/bible/reference-parser.test.ts
tests/unit/bible/reference-format.test.ts
tests/unit/bible/repository.test.ts  # 실제 DB 파일 사용
tests/e2e/viewer.spec.ts
tests/unit/scripts/bible-db.test.ts  # 파생 빌드 결정성, verify-db 위반 주입
```

## 설계 상세
- WASM 파일은 `public/` 또는 번들 자산으로 두고 같은 출처에서 받는다(CDN 금지). CSP `wasm-unsafe-eval`로 실행.
- 모든 쿼리는 파라미터 바인딩. 문자열 연결로 SQL을 만들지 않는다. 검색어의 `%`, `_`는 이스케이프한다.
- 스키마 이름(테이블, 열)은 `bible-db-access` 스킬에 확인된 그대로 쓰고, 추측하지 않는다.
- **파서**: 입력 50자 초과는 `TOO_LONG`. 화이트리스트 정규식(책 이름, 숫자, `:`, `-`, `–`, `,`, 공백, "장", "절"). 지원 형식: `요 15:1-8`, `요한복음 15장 1절`, `요 15`(장만), `John 3:16`, `Jn 3:16-18`, `요 15:1-8, 12`, `요 15:1-3, 5-7`. 절 범위 역순(`8-1`)은 `REVERSED_RANGE`. 쉼표 뒤 숫자는 같은 장의 절로 해석. 오류 코드: `EMPTY`, `TOO_LONG`, `BAD_CHARS`, `UNKNOWN_BOOK`, `BAD_FORMAT`, `REVERSED_RANGE`, `ZERO_OR_NEGATIVE`, `MULTI_CHAPTER`(장 간 범위), `OUT_OF_RANGE`(DB 범위 확인 후, `repository.checkReference`). 코드 이름은 `bible-reference-parser` 스킬 4.1을 따른다.
- `format`과 `parse`는 왕복 일치(`parse(format(x)) == x`)를 보장한다. S03 액션 바가 이 `format`을 쓴다.
- 장 조회는 기기 안에서 200ms 이내(DB 로딩 완료 후 측정).

## 테스트 요구사항
- 파서: 정상 형식 위 7종, 한글 정식명·약어·영문 약어 각 3권 이상, 장만, 역순 범위, 51자 입력, 허용 외 문자(`<`, `;`, `'`), 없는 책, 쉼표 목록, 공백 변형, 왕복 일치(속성 테스트 또는 표 기반 30건 이상).
- 저장소: 창세기 1장 절 수, 요한복음 3:16 krv·kjv 본문 존재, 마지막 책 마지막 장, 없는 장은 빈 결과, 검색어에 `%`·`'` 포함 시 오류 없이 처리.
- 성능: 실제 DB로 임의 장 50회 조회의 p95 < 200ms(Node 환경 측정값을 기록).
- E2E: 참조 입력 → 해당 장 표시, 이전/다음 장, 키워드 검색 결과 탭 → 해당 절로 이동, 360/390px 가로 스크롤 없음, 버튼 44×44px 이상.
- 네트워크: 뷰어·검색 흐름에서 같은 출처 외 요청 0건. 오프라인 새로고침 후 장 조회 동작.

## 검증 게이트
- 자동:
  - `npm run verify:db` PASS(해시 일치), 일부러 1바이트 바꾼 사본으로 FAIL 확인
  - `check-config.mjs`: `bible_db.sha256` 자리표시자 없음
  - 파서 커버리지 90% 이상
  - 장 조회 p95 < 200ms
  - 위 E2E·네트워크 테스트 통과
- 수동:
  - [ ] 실기기(iOS Safari, Android Chrome)에서 장 조회 체감 지연 없음
  - [ ] 4G(또는 개발자 도구 Fast 4G 제한)에서 첫 화면 1.5초 이내
  - [ ] PWA 설치 후 비행기 모드에서 본문 조회와 검색 동작

## 완료 정의
- [x] DB 출처·태그·해시·스키마가 스킬과 config에 기록됨
- [x] 검색 방식(LIKE/FTS5)과 분할 여부가 DESIGN.md에 반영됨
- [x] 파서가 쉼표 목록을 포함한 형식과 오류 코드를 처리
- [x] 뷰어, 장 이동, 참조 입력, 검색이 오프라인에서 동작
- [x] 푸터에 본문 출처(crizin/bible-db 태그) 표기

## 검증 기록

### 2026-11-04
- 자동: scripts/verify.sh full → PASS (단위 135개, E2E 28개(14×2 뷰포트), 네트워크 6개, 커버리지 core 93.12% lines, verify:db PASS)
- 단계 게이트:
  - `npm run verify:db` PASS. 1바이트를 바꾼 사본은 `FAIL sha256 mismatch`, 종료 코드 1(수동 실행과 `tests/unit/scripts/bible-db.test.ts`에서 확인)
  - `check-config.mjs`: `bible_db.sha256` = `20b4a80e96a2711ff6f17b3ebe9a3bd88e2f51e1eceb89bd5bbac904a9b68535`(자리표시자 없음), config PASS
  - 파서 커버리지: `reference-parser.ts` lines 100%, `reference-format.ts` 100%(임계값 90%)
  - 장 조회 p95: 0.18ms(p50 0.10ms), Node 22.23.4, sql.js 1.15.2, 임의 장 50회
  - E2E(참조 이동, 이전/다음 장, 책·장 선택, 검색 → 절 이동, 360/390px 가로 스크롤 없음, 44px 이상, CSP 위반 없음) 통과
  - 네트워크(뷰어·검색 중 외부 요청 0건, 오프라인 새로고침 후 장 조회·검색) 통과
- 착수 전 확정:
  1. DB 실물: `crizin/bible-db` v1.0.1 `bible.sqlite.gz` 54,692,405바이트, sha256 `ecf997698d2d79d2ec36e1e60147375bfb0a206cc622d563410263b5d18e4464`(릴리스 digest와 일치). 풀면 131.5MB. krv 31,101절, kjv 31,102절 포함. 스키마는 `bible-db-access` 4.2에 기록
  2. 검색: sql.js 1.15.2 기본 빌드는 FTS3만 있고 FTS5 없음. LIKE 실측 "사랑" 3.8ms, "하나님이 세상을" 15.9ms, "love" 2.4ms → LIKE 확정
  3. 크기: 원본 그대로는 부적합(131.5MB, vec0, CC BY-SA 데이터). krv·kjv만 뽑은 파생 DB 9,789,440바이트(gzip 3.1MB), 분할 없이 지연 로딩 + 서비스 워커 미리 캐시(사용자 결정)
- 수동: 보류 → backlog MV-S01 (3항목)
- 의존성 추가: sql.js 1.15.2 — 번들 DB를 브라우저에서 읽기(WASM, 설계 지정). @types/sql.js 1.4.11(dev) — 타입
- 설계 변경: `| 2026-11-04 | v0.10 | 2.1.1 신설(번들 DB를 원본에서 krv·kjv만 뽑은 파생 DB로), 3.2 키워드 검색 LIKE 확정, 9장 개역한글 출처 문구·KJV 영국 주의·CC BY-SA 데이터 미배포, 10장 DB 분할 없이 지연 로딩, 열린 질문 6 해결·8 일부 해결 | … |`
- 구현 메모:
  - 오류 코드는 스킬 4.1 이름으로 통일(`INVALID_CHAR` → `BAD_CHARS`, `ZERO_OR_NEGATIVE`, `MULTI_CHAPTER` 추가). `OUT_OF_RANGE`는 `repository.checkReference`
  - 네이티브 `<select>`는 WebKit에서 UA 스타일시트가 CSP `style-src 'self'` 위반으로 보고되어 버튼식 책·장 선택 패널로 대체
  - 로마자 접두(`I John`)는 지원하지 않음
- 후속:
  - 파생 DB(9.8MB)를 git에 넣을지, 배포 때마다 `npm run db:build`로 만들지 결정 필요(현재 `.gitignore`에 없음)
  - 호스팅이 `.sqlite`를 gzip/brotli로 압축 전송하는지 배포 전에 확인(첫 방문 전송량 9.8MB → 약 3.1MB)
  - `npm audit`: 개발 도구(eslint, workbox-build 등)에 moderate 18·low 2. 런타임 의존성(`--omit=dev`)은 0건
  - S02: 언어 전환 시 기본 역본 전환과 사용자 선택 유지(현재는 언어별 기본 역본만 사용)
