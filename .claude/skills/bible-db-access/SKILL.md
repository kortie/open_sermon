---
name: bible-db-access
description: Load the bundled read-only bible.sqlite with sql.js (WASM) and write chapter lookup, verse lookup and keyword search queries; also covers the SHA-256 verification script. Use when touching src/core/bible DB code, sql.js loading, search queries, the verify:db script, or the CSP needed for WASM — e.g. "장 조회 쿼리", "sql.js 로딩", "검색 느려", "verify:db 실패", "bible.sqlite schema".
---

# 번들 본문 DB 접근

## 1. 언제 쓰나
- S00(CSP의 `'wasm-unsafe-eval'`), S01(로딩, 장 조회, 검색, 해시 검증), S09(프롬프트에 넣을 원문 절 조회), S11(가져온 역본과 같은 조회 인터페이스).

## 2. 기준 문서
- DESIGN 2.1, 3.1, 3.2(검색), 3.12(기본 역본), 4.1(본문 DB는 IndexedDB가 아니라 번들 파일), 9장(출처 표기), 10장(장 조회 200ms, 첫 화면 1.5초), 열린 질문 6·8.

## 3. 규칙
- **스키마를 추측하지 않는다.** `public/data/bible.sqlite`가 없으면 작업을 멈추고 사용자에게 알린다.
- 읽기 전용으로 연다. 쓰기 쿼리(`INSERT/UPDATE/DELETE/CREATE`)를 실행하지 않는다.
- 모든 쿼리는 파라미터 바인딩. 문자열 이어 붙이기로 SQL을 만들지 않는다(LIKE 패턴도 바인딩).
- 외부 CDN에서 sql.js나 wasm을 받지 않는다(규칙 2). wasm 파일은 빌드 산출물에 같이 넣는다.
- NIV 등 제외 역본은 DB에 있더라도 조회 대상 목록에 넣지 않는다(규칙 17, `i18n.available_bibles`만 노출).

## 4. 상세

### 4.1 확보와 해시 검증
1. 출처: `config/app.config.json`의 `bible_db.source`, `release_tag`, `release_asset`, `release_url`, `release_sha256`. 원본을 그대로 번들하지 않는다(DESIGN 2.1.1).
2. `npm run db:build`(`scripts/build-bible-db.mjs`, 개발자가 실행): `release_url`을 `.cache/`에 받거나 `--input <file.gz>`를 쓰고, `.gz` 해시를 `release_sha256`과 대조한 뒤 `books`와 `bible_db.sources`(krv, kjv)의 절만 새 DB로 옮긴다. 본문 문자열은 바꾸지 않는다. 같은 원본·같은 sql.js 버전이면 같은 파일이 나온다. 출력 해시를 `bible_db.sha256`에 기록한다.
3. `npm run verify:db`(`scripts/verify-db.mjs`): 파일 존재, 해시 일치, 66권, `sources`·`available_bibles`의 역본 존재, `sources` 밖 역본·제외 역본 없음, `build_info`의 릴리스 태그·해시가 config와 같은지 확인. 실패 시 종료 코드 1.
4. sql.js를 올리면 파생 DB 해시가 바뀔 수 있다. 다시 빌드하고 `sha256`을 갱신한다.

### 4.2 스키마 요약 (확인 필요)
- 실제 파일에서 `sqlite3 public/data/bible.sqlite .schema`로 확인한 결과를 이 절에 붙인다. 확인 전에는 아래를 채우지 않는다.
확인 날짜 2026-11-04, 릴리스 `crizin/bible-db` v1.0.1 `bible.sqlite.gz`(54,692,405바이트, sha256 `ecf99769…4464`, 풀면 131.5MB).

원본(앱에서 쓰지 않음, 참고용):
```
CREATE TABLE books(book INTEGER PRIMARY KEY, code TEXT, name_kr TEXT, testament TEXT)
CREATE TABLE verses(id INTEGER PRIMARY KEY, book INT, chapter INT, verse INT, canon_chapter INT, canon_verse INT, source TEXT, text TEXT)
  -- source: krv(31,101절) kjv(31,102절) wlc byz
-- 그 밖: vec_verses(vec0 가상 테이블, sqlite-vec 필요), words, strongs 등. FTS 테이블 없음.
```
파생(`public/data/bible.sqlite`, 9,789,440바이트, 앱이 쓰는 스키마):
```
CREATE TABLE books(book INTEGER PRIMARY KEY, code TEXT NOT NULL, name_kr TEXT NOT NULL, testament TEXT NOT NULL)
CREATE TABLE verses(source TEXT NOT NULL, book INTEGER NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL,
  text TEXT NOT NULL, PRIMARY KEY(source, book, chapter, verse)) WITHOUT ROWID
CREATE TABLE build_info(key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID
```
- `books.book` 1~66은 내부 `BookNo`와 같다. 별도 대응표가 필요 없다.
- krv와 kjv는 절 구분이 조금 다르다(예: krv 요삼 1:15 있음, kjv 없음). 역본마다 `verseCount`를 따로 구한다.
- `canon_*` 열은 파생 DB에 넣지 않는다(krv·kjv에서 4절만 다름, 원어 매핑용).

### 4.3 로딩
```ts
export interface BibleDb {
  listBibles(): Promise<BibleInfo[]>;                       // available_bibles 필터 적용
  getChapter(bible: string, book: BookNo, chapter: number): Promise<Verse[]>;
  getVerses(bible: string, ref: Reference): Promise<Verse[]>;  // 쉼표 블록 순서대로
  chapterCount(bible: string, book: BookNo): Promise<number>;
  verseCount(bible: string, book: BookNo, chapter: number): Promise<number>;
  search(bible: string, query: string, opts: { limit: number; offset: number }): Promise<SearchHit[]>;
}
export interface Verse { book: BookNo; chapter: number; verse: number; text: string }
```
- sql.js 초기화: `initSqlJs({ locateFile: f => <빌드 산출물 내 wasm 경로> })`. 경로는 Vite asset import로 얻는다(URL 문자열 하드코딩 금지).
- DB 파일은 같은 출처에서 `fetch` → `ArrayBuffer` → `new SQL.Database(new Uint8Array(buf))`. 서비스 워커가 캐시해 오프라인에서도 연다.
- 모듈 수준에서 한 번만 연다(Promise 메모이즈). 메인 스레드가 오래 멈추면 Web Worker로 옮기는 것을 검토한다(`worker-src 'self'` 필요).
- 분할하지 않는다(열린 질문 6 해결). 첫 화면은 DB를 기다리지 않고, 뷰어가 `loadBible()`로 지연 로딩한다. 서비스 워커가 DB와 WASM을 미리 캐시한다(`vite.config.ts`의 `globPatterns`, `maximumFileSizeToCacheInBytes`).
- WASM은 `sql.js/dist/sql-wasm-browser.wasm?url`로 가져온다(sql.js 1.15.2의 browser 진입점이 이 파일을 찾는다).

### 4.4 쿼리 패턴
```ts
const stmt = db.prepare('SELECT ... WHERE <역본컬럼> = ? AND <책> = ? AND <장> = ? ORDER BY <절>');
try { stmt.bind([bible, dbBook, chapter]); while (stmt.step()) rows.push(stmt.getAsObject()); }
finally { stmt.free(); }
```
- 검색(3.2): `LIKE ? ESCAPE '\'`로 확정(sql.js 1.15.2 기본 빌드에 FTS5 없음, LIKE 2~16ms 실측, 2026-11-04). `%`, `_`, `\`를 이스케이프한다. 결과는 50건 limit/offset 페이지(`limit + 1`로 다음 페이지 유무 판단).
- 검색어 길이 상한(예: 50자)과 빈 검색어 거부.

## 5. 테스트 케이스
- [ ] 해시 불일치 시 verify:db 실패(임시 파일로 확인)
- [ ] krv 요 3:16, kjv John 3:16 조회 결과가 DB 원문과 같음
- [ ] 장 조회 결과 절 번호 오름차순, 마지막 절 = verseCount
- [ ] 존재하지 않는 장 → 빈 배열(예외 아님), 화면은 오류 문구
- [ ] 검색: 특수문자 `%`, `_`, `'` 입력이 그대로 검색어로 취급됨(주입 없음)
- [ ] 제외 역본이 listBibles에 없음
- [ ] 장 조회 200ms 이내(단위 테스트에서 측정, 기준 초과 시 경고 출력)
- [ ] E2E: 네트워크 차단 상태(서비스 워커 캐시 후)에서 뷰어가 열림

## 6. 작업 후 확인
- `sermon-verify` full: `verify:db`, `check-csp.mjs`(`'wasm-unsafe-eval'` 존재, `'unsafe-eval'` 없음), 산출물 점검(txt 동봉 없음, 원격 script 없음), `test:network`.
- `check-config.mjs`: `bible_db.sha256` 자리표시자 없음, `available_bibles`에 niv 없음.
