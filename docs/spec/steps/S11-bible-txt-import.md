# S11. txt 역본 가져오기와 역본 안내 레지스트리

| 항목 | 값 |
|---|---|
| 선행 | S06, S09 |
| DESIGN 참조 | 3.14, 3.15, 4.1(`imported_bible`, `imported_verse`, `consent_log`), 7.3, 9장, 12장 열린 질문 12·13·14 |
| 모듈 | `core/bible-import`, `config/bible-sources.json`, `ui/settings/bibles` |
| 관련 스킬 | `bible-txt-import`, `bible-reference-parser`, `local-backup` |

## 목표
사용자가 합법적으로 가진 txt 본문을 기기 안에서 검사해 역본으로 추가하고, 역본별 열람처·내려받기 링크를 검증된 레지스트리로 안내한다.

## 착수 전 확정
- 열린 질문 12: WEB, Webster 내려받기 출처를 레지스트리에 넣을지(넣으면 공식 페이지 확인 날짜 필요).
- 열린 질문 13: 백업 포함 옵션 제공 여부와 경고 문구.
- 열린 질문 14: euc-kr 인식률 측정 방법(샘플 파일 출처, 합격 기준).

## 범위
- **In**: 형식 A/B 파서, 혼합 거부, 인코딩 판별, 검사 규칙, 5단계 가져오기 UI, 권리 확인, 미리보기, 저장, 역본 단위 삭제, 역본 선택 목록 "내가 가져온 역본", 전수 검색, 샘플 양식 생성, 백업 포함 옵션 연결(S06 플래그), 생성 프롬프트 재인용 금지 지시와 복제 검사 원천 연결(S09 인터페이스), `bible-sources.json` 레지스트리와 역본 안내 화면.
- **Out**: txt 외 형식, 가져온 역본 검색 인덱스(5초 초과 시 후속 검토), 역본 공유 기능.

## 산출물
```
src/core/bible-import/
  detectFormat.ts    # A | B | mixed | unknown
  decode.ts          # UTF-8(fatal) → euc-kr, 사용 인코딩 반환
  parseA.ts, parseB.ts
  inspect.ts         # 책·절 수, 누락, 중복, 범위 밖, 인식 못한 책, 경고 비율
  save.ts, remove.ts, search.ts
  sampleTemplate.ts  # 빈 양식 생성
config/bible-sources.json
config/bible-sources.schema.json
scripts/check-config.mjs            # 레지스트리 규칙
src/ui/settings/bibles/{ImportWizard,BibleGuide}.tsx
tests/unit/bible-import/*.test.ts
tests/fixtures/bible-import/        # 합성 본문(실제 번역 아님)
tests/e2e/bible-import.spec.ts
```

## 설계 상세
- 책 이름 인식은 `bible-reference-parser`의 매핑표 재사용. 장·절 범위 기준은 번들 DB의 장별 절 수.
- 인코딩: `new TextDecoder('utf-8', { fatal: true })` 실패 시 `TextDecoder('euc-kr')`. 둘 다 실패하면 거부. 미리보기에 사용한 인코딩 표시. BOM 제거, LF/CRLF 허용, 빈 줄 무시.
- 크기: `bible_import.max_file_mb`(10MB) 초과 거부, 확장자 `txt`만(`accepted_extensions`).
- 검사: 범위 밖 절 → 경고, 같은 책·장·절 중복 → 첫 번째만 사용하고 경고, 인식 못한 줄 → 경고. 경고 수 / 전체 줄 > `max_warning_ratio`(0.2)면 저장 버튼 비활성.
- 권리 확인 체크 없이는 다음 단계 불가, 체크 시 `consent_log(kind=bible_rights, target_id)` 기록.
- 저장: `imported_bible`(`no_redistribute: true`, `partial`), `imported_verse` 한 트랜잭션. 실패 시 아무것도 남기지 않음. 암호화하지 않음(개인 데이터 아님).
- 삭제: 역본 단위로 메타와 모든 절을 한 트랜잭션에서 삭제. 현재 선택 역본이면 언어 기본 역본으로 되돌림.
- 백업: 기본 제외(`include_in_backup_default: false`). 포함 선택 시 "본인이 가진 본문만 포함됩니다" 추가 확인, `consent_log(backup_include_bible)`.
- 생성: 가져온 역본이 선택된 경우 프롬프트에 "본문을 절 단위로 재인용하지 말 것" 지시, 복제 검사 원천에 해당 본문 추가, LLM 전송은 외부 전송 동의 체계를 따른다.
- 샘플 양식: 앱이 만든 빈 양식(형식 설명 주석 + `요한복음 3:16 <본문>` 같은 자리표시자). 실제 번역 문장 금지. `Blob` 다운로드.
- 레지스트리 항목: `id, name, language, rights(public_domain|copyrighted|unverified), read_url, download_url?, verified_on?, note`. `download_url`은 `rights == public_domain`이고 `verified_on`이 있을 때만. 3.15 표 내용을 옮기되 각 링크는 공식 페이지를 직접 열어 확인하고 날짜를 적는다. Project Gutenberg 항목 `note`에 "미국 기준 퍼블릭 도메인" 문구(i18n 키 참조).
- 안내 화면: "읽기" 버튼은 `read_url`이 있는 항목, "내려받기" 버튼은 규칙을 만족하는 항목만. 외부 링크는 클릭 시에만 열림.

## 테스트 요구사항
- 단위: 형식 A 정상, B 정상, A·B 혼합 → 거부, 형식 없음 → 거부.
- 단위: UTF-8, UTF-8 BOM, euc-kr 바이트 픽스처 → 같은 결과와 올바른 인코딩 표시. CRLF·빈 줄 처리.
- 단위: 10MB 초과·`.docx` 이름 거부.
- 단위: 범위 밖 절, 중복 절(첫 번째 유지), 인식 못한 책 이름 경고. 경고 20% 정확히 → 저장 가능, 20% 초과 → 차단.
- 단위: 권리 동의 없이 `save()` 호출 → 거부, DB 변화 없음.
- 단위: 저장 중 오류 주입 → 부분 저장 없음. 삭제 후 해당 `bible_id` 절 0건.
- 단위: 기본 백업 페이로드에 가져온 역본 없음, 포함 확인 시에만 포함.
- 단위: 생성 프롬프트에 재인용 금지 지시 포함, 가져온 역본 문장 20자 일치 결과 → 복제 감지.
- 단위: 샘플 양식에 번들 DB·픽스처의 실제 절 텍스트가 없음(20자 일치 검사).
- 단위: 레지스트리 스키마, `download_url` 규칙 위반 항목 → `check-config.mjs` 실패.
- 성능: 성경 전체 크기 합성 픽스처(약 31,000절)를 저장 후 키워드 전수 검색 시간 측정, 기록. 5초 초과면 경고 출력(게이트 실패 아님, 후속 검토 메모).
- E2E: 샘플 양식 받기 → 형식 A 픽스처 가져오기 5단계 → 역본 목록에 "내가 가져온 역본" → 장 조회; 권리 체크 없이 다음 버튼 비활성; 역본 안내 화면에서 내려받기 버튼이 verified 항목에만 표시; 가져오기 흐름 외부 요청 0건.

## 검증 게이트
- 자동:
  - `scripts/verify.sh full` PASS, `core/bible-import` ≥ 80%
  - `check-config.mjs` 레지스트리 규칙 통과
  - 산출물 점검: `dist`에 txt 본문 파일 없음, 레지스트리 외 URL 없음
  - 권리 체크 없는 저장 불가, 20% 초과 차단 테스트 통과
  - 전수 검색 측정값을 검증 기록에 남김
- 수동:
  - [ ] 레지스트리의 모든 `read_url`, `download_url`을 직접 열어 공식 페이지인지와 권리 표기를 확인, 날짜 기록
  - [ ] 한국어 Windows 메모장에서 저장한 euc-kr 파일 실제 가져오기(열린 질문 14 기준)
  - [ ] 실기기(iOS Safari 파일 선택기, Android)에서 txt 선택과 가져오기
  - [ ] 실기기에서 전체 분량 역본 전수 검색 체감 속도

## 완료 정의
- [x] txt만, 형식 A/B, 혼합 거부, 인코딩 표시
- [x] 권리 확인 기록 없이는 저장 불가
- [x] 백업 기본 제외, 생성 재인용 금지와 복제 검사 적용
- [x] 레지스트리 규칙을 스크립트로 강제, 내려받기는 확인된 퍼블릭 도메인만
- [x] 샘플 양식에 실제 번역 본문 없음

## 선행 단계 메모
- S06(2026-11-05): `exportBackup`에 `includeImportedBibles` 플래그와 `backup_include_bible` 기록이 있다(UI 문구 없음). 덮어쓰기로 같은 id 역본을 복원할 때 예전 `imported_verse` 행 정리를 저장소 색인에 맞춰 연결한다.

## 검증 기록

### 2026-11-05
- 자동: scripts/verify.sh full → PASS (단위 611개, E2E 176개, 네트워크 24개, 커버리지 core 97.75%, `core/bible-import` 99.41%)
- 단계 게이트:
  - 형식 A·B 정상, 혼합·형식 불명·빈 파일 거부, 5% 이하 섞인 줄은 혼합 아님 → PASS (`tests/unit/bible-import/parse.test.ts`)
  - UTF-8, BOM+CRLF, euc-kr 합성 픽스처(`iconv`로 생성) → UTF-8판과 같은 결과, 인코딩 표시 → PASS (단위, E2E `EUC-KR file …`)
  - 10MB 초과·`.docx`/`.pdf`/`.epub`·이진 내용 거부 → PASS
  - 범위 밖·중복(첫 번째 유지)·인식 못한 책·형식 밖 줄 경고, 20% 정확히 허용, 21% 차단(19% 허용) → PASS
  - 권리 동의 없이 저장 → `CONSENT_REQUIRED`, DB 변화 0 / 저장 중 오류 주입(NaN 키) → 역본·절·동의 0건 / 삭제 후 절 0건, 다른 역본 유지 → PASS
  - 기본 백업 payload에 `imported_*`·`bible_rights` 없음, 포함 옵션은 추가 확인 후에만(E2E) → PASS. 백업 덮어쓰기 복원 시 같은 id 역본의 예전 절을 키 범위로 먼저 지움
  - 재인용 금지 줄(ko/en)은 가져온 역본을 읽을 때만, 가져온 본문은 전송 안 됨, 가져온 본문 복사 응답은 두 번 모두 잡혀 독립 결과 → PASS (`tests/unit/generate/importedBible.test.ts`)
  - 샘플 양식: `#` 주석과 빈 줄만, 가져오면 0절(단위), 내려받은 파일 확인(E2E) → PASS
  - 레지스트리: 스키마, https, 내려받기는 public_domain+verified_on만, read_url 확인 날짜, unverified 링크 금지, i18n 이름·메모 키 → 저장소 파일 PASS, 위반 사례 FAIL 확인(`tests/unit/scripts/check-config.test.ts`)
  - 성능(합성 31,680절, 66권×20장×24절, Node 단위 테스트): 메모리 적재 15ms, 전수 검색(결과 없음) 1ms, (결과 50+) 1ms → 5초 기준 이내, 인덱스 불필요
  - E2E(360/390): 샘플 받기 → 5단계 → "내가 가져온 역본" 선택 표시 → 장 보기(없는 장 안내, 다음 장 건너뛰기) → 검색, 다음 버튼은 권리 체크 전 비활성, 안내 화면 내려받기는 KJV만, 링크는 `target=_blank`·`rel=noopener noreferrer`, 외부 요청 0 → PASS (12개)
- 수동: 보류 → backlog MV-S11 (4항목)
- 의존성 추가: 없음
- 설계 변경: DESIGN 변경 이력 "S11 구현 반영"(3.14 구현 사항, 3.15 KJV·WEB 확정과 레지스트리 규칙, 4.1 DB v7, 프롬프트 버전 `.2`)
- 레지스트리 확인(2026-11-05, 공식 페이지 직접 열람): KJV Project Gutenberg #10 "Public domain in the USA.", `10.txt.utf-8` 제공 / eBible.org KJV·WEB은 zip·epub·pdf만 있어 내려받기 등록 안 함 / worldenglish.bible "Public Domain (no copyright)", 이름은 상표 / 대한성서공회 성경읽기 페이지(개역한글·개역개정·새번역·공동번역 열람) / BibleGateway(NIV 버전 페이지, NASB·NKJV는 홈) / Webster 링크 없음
- 후속:
  - Gutenberg KJV txt는 머리말이 있고 형식 A·B가 아니라 그대로는 가져오기가 안 된다(안내 화면에 "형식을 고친 뒤 가져오기" 문구). 변환 도구는 범위 밖.
  - NASB·NKJV 읽기 링크는 BibleGateway 홈이다. 버전별 페이지로 바꾸려면 수동 확인 후 갱신.
  - 레지스트리 링크 전수 재확인과 실기기 확인은 backlog MV-S11.

