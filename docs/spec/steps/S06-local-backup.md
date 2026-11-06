# S06. 로컬 백업 내보내기와 가져오기

| 항목 | 값 |
|---|---|
| 선행 | S05 |
| DESIGN 참조 | 3.11, 4.1, 4.2, 3.14(백업 제외), 12장 열린 질문 3 |
| 모듈 | `core/backup` (사용: `core/vault`, `core/store`) |
| 관련 스킬 | `local-backup`, `key-vault-security` |

## 목표
기기 데이터를 사용자 암호로 보호한 백업 파일로 내보내고, 다른 기기(다른 기기 키)에서 복원할 수 있게 한다. 앱은 파일을 외부로 보내지 않는다.

## 착수 전 확정
- ~~PBKDF2(SHA-256) 반복 횟수: 공식 출처(예: OWASP Password Storage Cheat Sheet)의 현재 권장값을 확인해 `backup.pbkdf2_iterations`에 숫자로 넣고, 출처와 확인 날짜를 검증 기록에 남긴다.~~ — 확정(2026-11-05): 600,000회(OWASP Password Storage Cheat Sheet "PBKDF2-HMAC-SHA256: 600,000 iterations", 확인 2026-11-05)
- ~~열린 질문 3: 백업 암호 최소 길이, 암호 분실 안내 문구(ko/en).~~ — 확정(2026-11-05, DESIGN 3.11): 8자 이상·두 번 입력, 안내 문구는 내보내기 화면에 항상 표시하고 확인 체크 후에만 내보내기
- 추가 확정(2026-11-05): 페이로드에 `outline`(복호화 상태)과 `settings.persona_id`를 포함한다. 구성표의 발췌 인용은 해당 원고가 복원되지 않아도 유지한다.

## 범위
- **In**: 백업 파일 형식, 내보내기(기기 키로 복호화 → 백업 키로 재암호화), 가져오기(복호화 → 새 기기 키로 재암호화 저장), 포함/제외 선택, 오류 처리, 충돌 처리, 설정 화면의 내보내기·가져오기 UI, 마법사 완료 화면의 백업 권장 링크 대상.
- **Out**: 클라우드 업로드·메일 전송(사용자가 직접), 자동 주기 백업, 가져온 역본 포함 옵션의 UI 문구 확정(S11에서 연결, 여기서는 플래그만).

## 산출물
```
src/core/backup/
  format.ts          # BackupEnvelope 타입, 직렬화/검증
  export.ts          # collect → encrypt → Blob
  import.ts          # parse → decrypt → conflict resolve → write
  kdf.ts             # PBKDF2 → AES-GCM 키 (non-extractable, 메모리에만)
src/ui/settings/BackupPanel.tsx
src/i18n/{ko,en}.json      # 백업 문구, 암호 분실 안내
tests/unit/backup/*.test.ts
tests/e2e/backup.spec.ts
```

## 설계 상세
- 파일 형식(JSON, 확장자 `.osbackup`):
  `{ format: "open-sermon-backup", version: 1, schema_version: <IndexedDB 스키마 버전>, kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt(b64, 16바이트) }, cipher: { name: "AES-GCM", iv(b64, 12바이트) }, ciphertext(b64), created_at }`. 평문 영역에는 사용자 데이터나 개수 정보를 두지 않는다.
- 암호문 안의 페이로드: `persona`, `library_item`, `sermon_meta`, `sermon_body`·`sermon_chunk`(평문으로 복호화한 상태), `style_profile`, `outline`(평문으로 복호화한 상태), `settings`(언어·역본·`persona_id`만), 선택 시 `provider_key`(평문 키), 선택 시 `imported_bible`/`imported_verse`.
- 기본 제외: `provider_key`, 가져온 역본, `gen_cache`, `local_stats`, `crypto_key`.
- `consent_log`는 포함한 데이터에 딸린 기록만 함께 옮긴다(원고의 `sermon_rights`, `external_transfer`). 키·역본을 제외했으면 그 동의 기록도 제외한다.
- `provider_key` 포함은 별도 확인 화면을 거치고 `consent_log(kind=backup_include_key)`에 기록한다. 가져온 역본 포함은 `backup_include_bible` 확인(S11에서 문구).
- 파생 키는 `extractable: false`로 만들고 저장하지 않는다. 작업 후 참조를 버린다.
- 내보내기는 `Blob` + 다운로드 링크(`URL.createObjectURL`)로 사용자가 저장한다. 네트워크 요청 없음.
- 가져오기 오류 구분: 형식 아님 / 손상(JSON 파싱·base64 실패) / 암호 틀림(AES-GCM 인증 실패) / 버전 불일치(`version` 미지원, `schema_version`이 더 높음). 각 원인별 i18n 문구. 실패 시 기존 데이터는 변경하지 않는다(쓰기는 한 트랜잭션).
- 충돌 처리: 같은 `id`가 있으면 사용자 선택(건너뛰기 / 백업으로 덮어쓰기), 기본값 건너뛰기. 원고는 `source_hash`가 같으면 중복으로 보고 건너뛴다. 복원 후 `style_profile`의 `source_hash`가 맞지 않으면 무효화한다.
- 복원 시 원고·청크·키는 **현재 기기 키**로 새 IV를 써서 재암호화한다.

## 테스트 요구사항
- 단위: 왕복(내보내기 → 새 `fake-indexeddb` 인스턴스 + 새 기기 키 → 가져오기)에서 모든 포함 스토어 내용 일치.
- 단위: 같은 데이터를 두 번 내보내면 salt·IV·암호문이 다름.
- 단위: 잘못된 암호 → `WRONG_PASSWORD`, 기존 DB 변화 없음.
- 단위: 암호문 1바이트 변조 → `WRONG_PASSWORD` 또는 `CORRUPTED`, 잘린 파일·JSON 아님 → `CORRUPTED`, `version: 99` → `UNSUPPORTED_VERSION`.
- 단위: 기본 내보내기 페이로드에 `provider_key`·가져온 역본이 없음. 키 포함 확인 시에만 들어가고 `consent_log`에 기록됨.
- 단위: 평문 envelope 영역(암호문 제외)에 원고 문자열·키 문자열이 없음.
- 단위: 충돌 시 기본값 건너뛰기, 덮어쓰기 선택 시 교체. `source_hash` 같은 원고 중복 방지.
- 단위: 파생 키가 `extractable === false`이고 어떤 스토어에도 저장되지 않음.
- E2E: 설정 → 내보내기 → 다운로드 파일 획득 → 저장소 초기화 → 가져오기 → 원고 목록 복원(360px, 가로 스크롤 없음).
- 네트워크: 내보내기·가져오기 흐름 중 외부 요청 0건.

## 검증 게이트
- 자동:
  - `scripts/verify.sh full` PASS, `core/backup` 줄 커버리지 ≥ 80%
  - 새 기기 키 왕복 복원 테스트 통과
  - 오류 4종(암호 틀림, 손상, 잘림, 버전) 각각 기존 데이터 무변화 확인
  - `check-config.mjs`: `backup.pbkdf2_iterations`가 숫자이고 착수 전 확정값과 같음
- 수동:
  - [ ] 실제 기기 A(Android Chrome)에서 내보낸 파일을 기기 B(iOS Safari)에서 가져와 원고·페르소나·라이브러리 복원
  - [ ] iOS Safari에서 파일 저장(공유 시트/파일 앱) 경로가 동작하고 안내 문구가 실제 흐름과 맞음
  - [ ] 저사양 기기에서 PBKDF2 처리 시간이 허용 범위(체감 수 초 이내)이고 진행 표시가 보임

## 완료 정의
- [x] 파일 형식이 설계 상세와 일치하고 `format.ts` 검증 함수로 강제됨
- [x] API 키·가져온 역본 기본 제외, 포함 시 별도 확인과 기록
- [x] 파생 키 미저장, 복원 시 현재 기기 키로 재암호화
- [x] 오류·충돌 처리 시 기존 데이터 보존
- [x] 암호 분실 시 복구 불가 안내가 ko/en에 있음

## 검증 기록

### 2026-11-05
- 자동: scripts/verify.sh full → PASS (단위 450개, E2E 112개, 네트워크 20개, 커버리지 core 줄 96.53%·분기 91.99%, `core/backup` 줄 94.27%·분기 93.42%)
- 단계 게이트:
  - 반복 횟수 출처: OWASP Password Storage Cheat Sheet "PBKDF2-HMAC-SHA256: 600,000 iterations"(페이지에 갱신 날짜 표기 없음, 확인 2026-11-05) → `backup.pbkdf2_iterations: 600000`
  - `check-config.mjs`: 숫자이고 확정값 600000과 같음(다른 숫자면 FAIL, 단위 테스트 포함) → PASS
  - `core/backup` 줄 커버리지 ≥ 80%(vitest 폴더 임계값 추가) → 94.27% PASS
  - 새 기기 키 왕복: 다른 fake-indexeddb + 새 기기 키로 원고 본문·청크·페르소나·사용 중 페르소나·라이브러리·구성표·설정(언어·역본·persona_id) 일치, 청크는 B 키로만 복호화되고 IV 새로 생성, B 저장소 덤프에 표지 문장 평문 없음 → PASS
  - 오류 4종 + 기존 데이터 무변화(저장소 전체 덤프 비교): 틀린 암호 → WRONG_PASSWORD, 암호문 1바이트 변조 → WRONG_PASSWORD, 잘린 파일·JSON 아님 → CORRUPTED, 이진 파일·다른 JSON → NOT_BACKUP, `version: 99`·더 높은 `schema_version` → UNSUPPORTED_VERSION, 복호화는 되지만 페이로드가 틀림 → CORRUPTED, 쓰기 트랜잭션 중 실패 → 전부 롤백 → PASS
  - 같은 데이터 2회 내보내기: salt·IV·암호문 모두 다름 → PASS
  - 평문 envelope 키 목록이 형식 필드 7개뿐, 원고·제목·페르소나 이름·키 문자열 없음 → PASS
  - 기본 내보내기에 `provider_key`·가져온 역본·그 동의 기록 없음, 키 포함 시 `backup_include_key` 기록 후 포함·새 기기에서 기기 키로 재암호화(평문 키 덤프 없음), 역본 포함 시 `bible_rights`·`backup_include_bible` 동반(S08·S11 저장소는 테스트용 마이그레이션으로 시뮬레이션) → PASS
  - 파생 키 `extractable === false`, `exportKey` 실패, 저장소에 CryptoKey는 기기 키 1개뿐 → PASS
  - 충돌: 기본 건너뛰기(기존 유지·건너뛴 수 보고, 설정은 보고에서 제외), 덮어쓰기(교체, 원고의 예전 청크 제거), 같은 `source_hash` 원고 중복 방지, 원고 미복원 시 구성표 발췌 인용 유지, 허용값이 아닌 페르소나 행 건너뜀 → PASS
  - 스타일 프로필: 최종 원고 집합이 백업과 같을 때만 복원, 원고가 추가되면 기기 프로필 삭제·무효화 보고 → PASS
  - 암호 규칙: 8자 미만·불일치 거부, NFC/NFD 같은 한글 암호로 열림 → PASS
  - E2E(360·390): 설정 → 내보내기 → 다운로드(`open-sermon-YYYYMMDD-HHmm.osbackup`) → 새 컨텍스트(빈 저장소, 새 기기 키) → 틀린 암호 안내 → 가져오기 → 원고·페르소나 복원, 같은 파일 재가져오기 시 건너뜀, 암호 분실 안내 상시 표시·확인 전 버튼 꺼짐, 형식 아님·손상 문구, 가장 큰 글자에서 가로 스크롤 없음·터치 타깃 44px → PASS
  - 네트워크: 외부 요청 차단 상태에서 내보내기·가져오기 완료, 두 흐름 중 요청 0건 → PASS
- 수동: 보류 → backlog MV-S06 (3항목)
- 의존성 추가: 없음
- 설계 변경: DESIGN v0.14(3.11 암호 8자·두 번 입력·분실 안내 문구와 확인 체크·`outline`/`settings.persona_id` 포함, 4.2 PBKDF2-SHA256 600,000회, 열린 질문 3 해결)
- 후속:
  - S08: `provider_key` 백업은 DESIGN 4.1 필드(`provider`, `key_ciphertext`, `iv`, `key_last4`, `created_at`, keyPath `provider`) 기준으로 구현해 두었다. 저장소를 만들 때 이 형식을 따르거나 `core/backup`을 맞춘다. "API 키도 넣기" 선택지는 키가 1개 이상일 때만 보인다. 마법사 완료 화면의 백업 권장 링크 대상은 `#/settings?section=backup`(백업 패널로 스크롤).
  - S10: 스타일 프로필은 "가져온 뒤 원고 집합의 `source_hash`가 백업과 같을 때만 복원" 규칙으로 처리한다. 프로필 `source_hash` 계산 방식을 정하면 그 값으로 바꾼다.
  - S11: 가져온 역본은 `includeImportedBibles` 플래그만 있다(UI 문구 없음). 덮어쓰기로 역본을 바꿀 때 예전 `imported_verse` 행 정리가 필요하다(저장소 색인 정해지면 연결).
