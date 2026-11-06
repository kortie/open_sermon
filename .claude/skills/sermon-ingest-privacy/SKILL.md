---
name: sermon-ingest-privacy
description: On-device sermon manuscript ingestion — upload (txt, docx, text PDF, paste), rights consent recording, PII masking, 200–800 char chunking, encrypted storage, and single-transaction deletion. Use when touching src/core/sermon ingest code, the upload/My Sermons screens, masking patterns, chunk rules, or deletion — e.g. "원고 업로드", "마스킹 패턴", "청크 분할", "원고 삭제", "PDF 거부".
---

# 원고 수집과 개인정보

## 1. 언제 쓰나
- S04(업로드, 동의, 마스킹, 청크, 저장, 삭제). S05·S10은 저장된 청크를 읽기만 한다.
- 위치: `src/core/sermon/ingest/`(파싱, 마스킹, 청크), 저장은 `core/store` + `core/vault`.

## 2. 기준 문서
- DESIGN 3.9, 4.1(`sermon_meta`, `sermon_body`, `sermon_chunk`, `consent_log`), 4.2, 4.3(원고 노출), 열린 질문 15(마스킹 범위).

## 3. 규칙
- 규칙 7: 동의 기록이 있어야 처리한다. 파싱, 마스킹, 청크는 기기 안에서만. 원문과 청크는 암호화 저장.
- 규칙 8: 원고를 로그에 남기지 않는다.
- 규칙 3: `core/sermon`은 `llm`, `generate`를 import하지 않는다.
- 소프트 삭제 금지(4.1).

## 4. 상세

### 4.1 마스킹 범위 — 확정(2026-11-04, DESIGN 3.9, 열린 질문 15 해결)
- 전화번호, 이메일, 주소(시·도/구·동/로·길 + 번지), "○○교회", 직분 호칭이 붙은 이름(○○○ 집사/권사/장로/성도/목사/전도사, 뒤 "님" 허용)만 자동 마스킹. 호칭 없는 이름은 마스킹하지 않는다. 저장 전 미리보기에서 사용자가 구간을 골라 `[가림]`으로 추가로 가릴 수 있고, 저장할 때 고친 글에 패턴을 한 번 더 적용한다.
- 패턴은 `src/core/sermon/mask.ts` 한 곳에만 둔다.

### 4.2 지원 형식과 파싱
| 형식 | 처리 | 라이브러리 |
|---|---|---|
| txt | `TextDecoder('utf-8', { fatal: true })`, 실패 시 거부 안내 | 없음 |
| docx | `word/document.xml`의 `w:p`/`w:t`/`w:tab`/`w:br` 텍스트 추출 | fflate 0.8.3(압축 해제) + `DOMParser`. mammoth는 `new Function` 템플릿 때문에 제외 |
| 텍스트 PDF | 텍스트 레이어 추출, 워커 사용(`worker-src 'self'`) | pdfjs-dist 6.4.299. 워커와 한국어 CMap을 같은 출처 파일로 번들, CDN 금지 |
| 이미지 PDF | 공백 제외 추출 글자가 페이지당 평균 30자(`image_pdf_min_chars_per_page`) 미만이면 거부 메시지 | - |
| 붙여넣기 | textarea | 없음 |
- 크기 상한 `sermon_ingest.max_upload_mb`(5MB). 초과 시 파싱 전에 거부.
- 라이브러리 확인 절차: 유지 상태, 번들 크기, 네트워크 요청 여부(폰트·워커 원격 로딩 없는지), 라이선스.

### 4.3 처리 순서
1. 동의 체크(필수, "본인이 작성했거나 이용 권한이 있는 설교문") → `consent_log`(kind `sermon_rights`, at). 미동의면 파일을 읽지도 않는다.
2. 파싱 → 정규화(줄바꿈 통일, 연속 공백 정리).
3. 마스킹(4.4) → 미리보기 → 사용자 확인.
4. 청크(4.5).
5. 한 트랜잭션 저장: `sermon_meta`(id, title, source_hash, consent_at, created_at), `sermon_body`(암호화), `sermon_chunk`(본문 암호화, keywords·verse_refs 평문).
6. `source_hash` 변경 → 스타일 프로필 무효화 표시(`sermon-style-profile`).

### 4.4 마스킹 패턴 (확정 범위, 구현은 `mask.ts`)
| 종류 | 패턴 예 | 대체 |
|---|---|---|
| 휴대전화 | `01[016789]-?\d{3,4}-?\d{4}` | `[연락처]` |
| 유선전화 | `0\d{1,2}-\d{3,4}-\d{4}` | `[연락처]` |
| 이메일 | `[\w.+-]+@[\w-]+(\.[\w-]+)+` | `[이메일]` |
| 주소 | 시·도 + 구/군 + 동/로/길 + 번지 조합 | `[주소]` |
| 교회명 | `[가-힣A-Za-z]{1,15}교회` (단, "교회" 단독·일반명사 "초대교회" 등 예외 목록) | `[교회]` |
| 호칭 이름 | `[가-힣]{2,4}\s?(집사|권사|장로|성도|목사|전도사)(님)?` | `[이름] 집사` 형태로 호칭 유지 |
- 성경 인명(바울, 베드로 등)과 "하나님", "예수님"은 마스킹하지 않는다(오탐 테스트로 고정).

### 4.5 청크 규칙
- 문단 기준으로 나누고 `min_chunk_chars`(200)~`max_chunk_chars`(800)를 맞춘다. 짧은 문단은 다음 문단과 합치고, 긴 문단은 문장 경계에서 자른다.
- 마지막 청크가 200자 미만이면 앞 청크와 합친다(합쳐서 800 초과면 그대로 둔다).
- 각 청크: `seq`, `keywords`(단순 빈도 상위 N, 불용어 제외), `verse_refs`(`bible-reference-parser`로 본문 안 참조 추출).

### 4.6 삭제 트랜잭션
- `sermon_meta`, `sermon_body`, `sermon_chunk`(sermon_id 일치 전부), 무효화된 `style_profile`을 **한 트랜잭션**에서 삭제. 그 원고를 인용한 `outline`(S05)의 발췌 블록도 같은 트랜잭션에서 제거한다(복호화·재암호화는 트랜잭션 전에). 하나라도 실패하면 전부 롤백.

## 5. 테스트 케이스
- [ ] 동의 없는 업로드 거부, 파일 읽기 호출 0
- [ ] 각 마스킹 패턴 양성/음성(성경 인명, "하나님", "초대교회" 유지)
- [ ] 5MB 초과 거부, 이미지 PDF 거부 메시지, 깨진 txt(비 UTF-8) 안내
- [ ] 청크 길이 경계(199/200/800/801), 마지막 짧은 청크 병합
- [ ] 저장 후 IndexedDB 덤프에 원문 문장 없음(암호화 확인)
- [ ] 삭제 후 4개 스토어에서 해당 sermon 흔적 0, 중간 실패 주입 시 롤백
- [ ] 콘솔 스파이 호출 0

## 6. 작업 후 확인
- `sermon-verify`: 독립 모듈 import 경계(`core/sermon` → llm/generate 금지), 콘솔 금지, localStorage 금지, `test:network`(업로드·파싱 중 외부 요청 0, PDF 워커 원격 로딩 없음), 커버리지 `core/**` 80%.
