---
name: local-backup
description: Encrypted local backup export/import — file format (version, salt, IV, ciphertext), PBKDF2-SHA256 + AES-GCM with iterations from config, included/excluded data (API keys and imported bibles excluded by default), lost-password notice, and conflict handling on import. Use when touching src/core/backup or backup screens — e.g. "백업 내보내기", "백업 복원", "백업 파일 형식", "PBKDF2", "restore backup".
---

# 로컬 백업

## 1. 언제 쓰나
- S06(구현). S08(키 포함 옵션), S10(프로필 포함), S11(가져온 역본 포함 옵션)에서 항목 추가.
- 위치: `src/core/backup/`.

## 2. 기준 문서
- DESIGN 3.11, 3.13.5(완료 화면 백업 권장), 3.14(가져온 역본 백업 기본 제외), 4.1, 4.2(PBKDF2), 열린 질문 13(3은 2026-11-05 해결).

## 3. 규칙
- 백업 파일은 사용자가 직접 저장하고 전송한다. 앱은 외부로 보내지 않는다(규칙 2).
- 규칙 4: 파생 키를 저장하지 않는다. 백업 암호는 메모리에서만 쓰고 버린다(규칙 5: 계정 비밀번호와 다름, 저장 금지).
- API 키 기본 제외, 포함 시 별도 확인(`consent_log` kind `backup_include_key`). 가져온 역본 기본 제외(규칙 21, kind `backup_include_bible`).

## 4. 상세

### 4.1 파일 형식 (`*.osbackup`, JSON 컨테이너)
```json
{ "format": "open-sermon-backup", "version": 1, "created_at": "ISO8601",
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 0, "salt": "base64(16B)" },
  "cipher": { "name": "AES-GCM", "iv": "base64(12B)" },
  "ciphertext": "base64" }
```
- 평문 머리에는 개인 데이터를 넣지 않는다(제목, 개수도 암호문 안에).
- 복호화된 내용(payload): `{ version, stores: { persona, sermon_meta, sermon_body, sermon_chunk, style_profile, library_item, outline, settings, consent_log, provider_key?, imported_bible?, imported_verse? } }`. `settings`는 `ui_language`, `bible_id`, `bible_user_chosen`, `persona_id`만. `outline`의 발췌 인용은 원고가 함께 복원되지 않아도 유지한다. 기기 키로 암호화된 필드는 **복호화한 평문**으로 넣는다(기기 키는 기기마다 다름).
- `iterations`: `config.backup.pbkdf2_iterations` = **600,000**(OWASP Password Storage Cheat Sheet, PBKDF2-HMAC-SHA256 권장값, 확인 2026-11-05). 가져올 때는 파일에 적힌 값을 쓴다(상한 10,000,000으로 비정상 파일 거부).

### 4.2 내보내기
1. 포함 항목 선택(기본: 원고·청크, 페르소나, 라이브러리, 말씀 구성표, 스타일 프로필, 설정). 키·가져온 역본은 기본 꺼짐, 켜면 확인 문구.
2. 암호 2회 입력(8자 이상, 일치해야 함). 암호 분실 안내를 항상 표시하고 확인 체크를 해야 내보내기 버튼이 켜진다. 문구(DESIGN 3.11): "이 암호를 잊으면 백업 파일을 열 수 없고, 누구도(앱 제작자도) 복구해 드릴 수 없습니다. 암호를 종이에 적어 안전한 곳에 보관하세요."
3. `deriveKey(PBKDF2, salt 16B 랜덤)` → AES-GCM(IV 12B 랜덤) → 파일 생성 → `Blob` + `<a download>`(사용자 동작). 업로드·전송 코드 없음.
4. 평문 payload, 파생 키 참조를 즉시 해제.

### 4.3 가져오기
1. 파일 선택 → 형식·버전 확인(모르는 버전 거부).
2. 암호 입력 → 복호화 실패 시 "암호가 맞지 않거나 파일이 손상되었습니다"(원인 구분 불가, 추측 금지).
3. 충돌 처리: 같은 id가 있으면 사용자에게 "건너뛰기 / 덮어쓰기" 선택(전체 일괄). 기본은 건너뛰기.
4. 기기 키로 재암호화하며 한 트랜잭션으로 저장. 실패 시 전부 롤백.
5. `source_hash` 재계산 → 스타일 프로필 유효성 갱신.

### 4.4 API
```ts
export async function exportBackup(opts: { password: string; includeKeys: boolean; includeImportedBibles: boolean }): Promise<Blob>;
export async function inspectBackup(file: File): Promise<{ version: number; created_at: string }>;
export async function importBackup(file: File, password: string, onConflict: 'skip' | 'overwrite'): Promise<ImportReport>;
```

## 5. 테스트 케이스
- [ ] 내보내기 → 빈 저장소(새 fake-indexeddb)에 가져오기 → 모든 스토어 내용 일치(다른 기기 시뮬레이션)
- [ ] 같은 데이터 2회 내보내기 → salt, IV, 암호문 다름
- [ ] 틀린 암호 → 실패, 저장소 변화 없음
- [ ] 변조 파일(암호문 1바이트) → 실패
- [ ] 기본값에서 payload에 provider_key, imported_* 없음
- [ ] 키 포함 선택 시 확인 기록 후에만 포함
- [ ] 충돌 skip/overwrite 각각
- [ ] 내보내기·가져오기 중 네트워크 요청 0
- [ ] 평문 머리에 제목·원문 없음
- [ ] 암호 8자 미만·불일치·안내 미확인 시 내보내기 불가

## 6. 작업 후 확인
- `sermon-verify`: `check-config.mjs`(pbkdf2_iterations가 숫자 600000), `test:network`, localStorage·콘솔 금지, import 경계(`core/backup` → llm 금지).
- 수동(backlog): 실제 다른 기기(iOS↔Android)에서 파일 저장·복원.
