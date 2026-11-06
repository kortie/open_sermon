# S04. 암호화 모듈, 원고 업로드, 동의, 마스킹, 청크, 삭제

| 항목 | 값 |
|------|----|
| 선행 | S02 |
| DESIGN 참조 | 3.9(스타일 프로필 제외), 4.1, 4.2, 4.3, 12장 15 |
| 모듈 | `core/vault`, `core/sermon`, `core/store`, `src/app/sermons` |
| 관련 스킬 | `key-vault-security`, `sermon-ingest-privacy` |

## 목표
기기별 non-extractable 키로 AES-GCM 암호화 모듈을 만들고, 설교 원고를 동의 → 파싱 → 마스킹 → 청크 → 암호화 저장하는 흐름과 한 트랜잭션 삭제를 구현한다.

## 착수 전 확정
- ~~마스킹 범위 (열린 질문 15)~~ — 확정(2026-11-04): 제안안 그대로. 연락처·이메일·주소·"○○교회"·직분 호칭이 붙은 이름만 자동 마스킹, 호칭 없는 이름 유지, 미리보기에서 추가 가리기(DESIGN 3.9).
- ~~파싱 라이브러리~~ — 확정(2026-11-04): PDF는 pdfjs-dist 6.4.299(워커·한국어 CMap 같은 출처 번들), docx는 fflate 0.8.3 + `DOMParser`로 `word/document.xml` 직접 추출. 둘 다 지연 로딩. mammoth는 `new Function` 템플릿 때문에 제외(DESIGN 3.9).
- ~~이미지 PDF 판정~~ — 확정(2026-11-04): 공백 제외 추출 글자 수가 페이지당 평균 30자 미만이면 거부(`sermon_ingest.image_pdf_min_chars_per_page`).

## 범위
- **In**: `vault`(키 생성·보관, 암복호화), `crypto_key`·`sermon_meta`·`sermon_body`·`sermon_chunk`·`consent_log` 스토어, 업로드(txt, docx, 텍스트 PDF, 붙여넣기), 5MB 상한, 동의 체크와 기록, 마스킹과 미리보기, 청크 분할(200~800자), 키워드·절 참조 추출(청크 메타), 목록·삭제 화면, 이미지 PDF 거부.
- **Out**: 발췌 점수화(S05), 스타일 프로필(S10), API 키 저장(S08 — 같은 vault 사용), 백업(S06), 앱 잠금.

## 산출물
```
src/core/vault/crypto-key.ts      # getOrCreateDeviceKey (extractable:false)
src/core/vault/cipher.ts          # encrypt(plain) → {ciphertext, iv}, decrypt
src/core/vault/mask-display.ts    # last4 표시 (S08에서 사용)
src/core/store/sermon.ts          # 스토어 접근, deleteSermon(트랜잭션)
src/core/store/consent.ts         # consent_log
src/core/sermon/parse/{txt,docx,pdf}.ts
src/core/sermon/mask.ts           # 패턴 목록과 적용
src/core/sermon/chunk.ts
src/core/sermon/extract.ts        # 키워드, 절 참조 (S01 파서 사용)
src/core/sermon/ingest.ts         # 동의 확인 → 파싱 → 마스킹 → 청크 → 저장
src/app/sermons/                  # 업로드, 동의, 미리보기, 목록, 삭제
tests/unit/vault/*.test.ts
tests/unit/sermon/{mask,chunk,ingest,delete,parse}.test.ts
tests/fixtures/sermons/           # 합성 원고 txt/docx/pdf, 이미지 PDF (실제 인물·교회 정보 금지)
tests/e2e/sermon-upload.spec.ts
```

## 설계 상세
- **키**: `crypto.subtle.generateKey({name:'AES-GCM', length:256}, false, ['encrypt','decrypt'])`, `crypto_key` 스토어에 CryptoKey 객체 그대로 저장. 없을 때만 생성.
- **암호화**: 호출마다 `crypto.getRandomValues(new Uint8Array(12))`로 IV 생성. IV 재사용 금지. 반환은 `{ciphertext: ArrayBuffer, iv: Uint8Array}`.
- **저장**: `sermon_meta`(id, title, source_hash, consent_at, created_at)만 평문. 원문은 `sermon_body`, 청크 본문은 `sermon_chunk.ciphertext`. 청크의 `keywords`, `verse_refs`는 평문(검색용)이므로 원문 문장을 넣지 않고 단어·참조만 넣는다.
- `source_hash`는 마스킹 후 원문의 SHA-256(S10 무효화 기준).
- **동의**: "본인이 작성했거나 이용 권한이 있는 설교문" 체크 없이는 `ingest`가 `CONSENT_REQUIRED`로 거부(UI 버튼 비활성과 별개로 코어에서도 거부). 동의 시 `consent_log`(kind `sermon_rights`)와 `consent_at` 기록.
- **마스킹**: 확정된 패턴 목록을 `mask.ts` 한 곳에 둔다. 대체 문자열은 `[이름]`, `[교회]`, `[연락처]`, `[주소]`(i18n 아님, 저장 데이터). 저장 전 미리보기에서 사용자가 추가 구간을 가릴 수 있다. 원본(마스킹 전) 텍스트는 메모리에서만 쓰고 저장하지 않는다.
- **청크**: 문단 경계 우선, 200자 미만 문단은 다음 문단과 합치고, 800자 초과는 문장 경계로 나눈다. 마지막 청크가 200자 미만이면 앞 청크와 합친다(합쳐서 800 초과면 그대로 둔다 — 원고 전체가 200자 미만인 경우 포함, 예외로 테스트에 명시).
- **거부**: 확장자·MIME이 txt/docx/pdf가 아니면 거부, 5MB(`sermon_ingest.max_upload_mb`) 초과 거부, PDF 텍스트가 기준 미만이면 "이미지로 된 PDF는 아직 지원하지 않습니다" 안내.
- **삭제**: `sermon_meta`, `sermon_body`, `sermon_chunk`(sermon_id 전체), 해당 원고가 반영된 `style_profile`을 하나의 readwrite 트랜잭션에서 삭제. 소프트 삭제 없음. 중간 실패 시 전부 롤백.
- 오류 메시지와 로그에 원고 내용을 넣지 않는다.

## 테스트 요구사항
- vault: 암호화→복호화 일치, 같은 평문 2회 암호화 시 IV와 암호문이 다름(100회 IV 중복 없음), `crypto.subtle.exportKey('raw', key)`가 거부됨, `key.extractable === false`, 다른 키·변조 암호문 복호화 실패.
- 마스킹: 휴대폰(`010-1234-5678`, `01012345678`), 일반전화, 이메일, 도로명·지번 주소, "○○교회", "김철수 집사", "이영희 권사님" 마스킹 / "바울", "베드로", "다윗", "하나님", "예수님"은 유지 / 호칭 없는 이름은 유지(확정안 기준). 패턴당 2건 이상.
- 청크: 모든 청크 200~800자(예외 케이스 제외), 순서(`seq`) 연속, 청크를 이으면 마스킹된 원문과 같음, 경계 케이스(199자, 800자, 801자, 문장부호 없는 긴 문단).
- ingest: 동의 없이 호출 → `CONSENT_REQUIRED`, 저장 0건 / 5MB+1바이트 거부 / 이미지 PDF 거부 / docx·텍스트 PDF·txt·붙여넣기 각각 성공.
- **저장소 덤프 검사**: 픽스처 원고에 고유 표지 문자열(예: `ZQX-표지-문장`)을 넣고 저장 후 fake-indexeddb의 모든 스토어를 JSON/바이트로 덤프해 표지 문자열과 마스킹 대상 원문(전화번호 등)이 나오지 않음을 확인.
- 삭제: 원고 2개 저장 → 1개 삭제 → 그 원고의 meta/body/chunk/profile 0건, 다른 원고는 그대로. 트랜잭션 중간 실패 주입 시 아무것도 지워지지 않음.
- E2E: 업로드 → 동의 체크 전 다음 버튼 비활성 → 체크 → 미리보기(마스킹 표시) → 저장 → 목록 → 삭제 확인 → 목록에서 사라짐. 360/390px 가로 스크롤 없음.
- 네트워크: 업로드·파싱·저장·삭제 흐름에서 같은 출처 외 요청 0건(PDF 폰트·cmap·워커 포함).

## 검증 게이트
- 자동:
  - 위 테스트 통과, `core/vault` 커버리지 90% 이상
  - 정적 점검: `extractable: true` 없음, `localStorage` 없음, `console.*` 없음
  - 저장소 덤프 검사 통과
  - `dist`에 PDF 워커 등이 같은 출처 파일로 포함되고 CSP 통과
- 수동:
  - [ ] 실제 목회자 원고 형식(한글 docx, 한글 텍스트 PDF) 2종 이상으로 파싱 결과 확인 — 사용자 제공, 결과만 기록하고 내용은 남기지 않음
  - [ ] 마스킹 미리보기에서 놓친 개인정보가 없는지 사용자 확인
  - [ ] iOS Safari, Android Chrome에서 파일 선택기로 txt/docx/pdf 업로드 동작
  - [ ] 브라우저 개발자 도구 IndexedDB 화면에서 원고 평문이 보이지 않음

## 완료 정의
- [x] 마스킹 범위와 파싱 라이브러리 결정이 DESIGN.md·검증 기록에 반영
- [x] vault: non-extractable, IV 매번 새로, 복호화 일치
- [x] 동의 없는 업로드가 코어에서 거부되고 동의 기록이 남음
- [x] 청크 200~800자 규칙과 예외가 테스트로 고정
- [x] 저장소 덤프에 평문 원고 없음
- [x] 한 트랜잭션 삭제, 소프트 삭제 없음

## 검증 기록

### 2026-11-04
- 자동: scripts/verify.sh full → PASS (단위 342개, E2E 94개, 네트워크 14개, 커버리지 core 줄 96.09%, `core/vault` 92.1%)
- 단계 게이트:
  - vault: 왕복 일치, IV 100회 중복 없음, `exportKey('raw'|'jwk')` 거부, `extractable === false`, 변조·다른 키·다른 IV 복호화 실패(오류에 내용 없음) → PASS
  - 마스킹: 휴대·유선·대표번호·이메일·주소·교회명·직분 이름 패턴별 2건 이상, 성경 인명·호칭 없는 이름·"담임 목사님"·"초대교회" 유지, 재마스킹 멱등 → PASS
  - 청크: 픽스처 전부 200~800자, `seq` 연속, 이어 붙이면 원문과 같음, 199/200/800/801자·문장부호 없는 긴 문단·공백 없는 긴 줄 → PASS
  - ingest: 동의 없음 → `CONSENT_REQUIRED`(파일을 읽지 않음, 저장 0건), 5MB+1바이트 거부(읽기 전), 확장자·내용 불일치 거부, 이미지 PDF 거부, txt·docx·텍스트 PDF·붙여넣기 성공 → PASS
  - 저장소 덤프: 4편 저장 후 모든 스토어를 JSON·UTF-8·UTF-16·latin1로 덤프해 `ZQX-표지-문장`, 전화번호, 이메일, 이름, 교회명, 주소, 본문 문장이 나오지 않음 → PASS
  - 삭제: 2편 중 1편 삭제 시 meta·body·chunk·style_profile 제거, 다른 원고 유지, 트랜잭션 중간 실패 주입 시 아무것도 지워지지 않음 → PASS
  - E2E(360/390px): 업로드 → 동의 전 "다음" 비활성 → 미리보기(마스킹 요약) → 선택 구간 가리기 → 저장 → 새로고침 후 목록 유지 → 삭제 확인/취소 → 삭제, 22px에서도 가로 스크롤 없음, 터치 타깃 44px 이상 → PASS
  - 네트워크: txt·docx·PDF 업로드·저장·삭제 중 외부 요청 0건, PDF 워커가 같은 출처에서 로드됨, 설치 후 오프라인에서 PDF 추가 동작(워커·한국어 CMap 사전 캐시) → PASS
  - 정적: `extractable: true`·`localStorage`·`console.*` 없음, `dist`에 `assets/pdf.worker.min-*.mjs`와 `cmaps/*.bcmap` 24개 포함, CSP 통과 → PASS
  - 성능 참고: 약 5MB(216만 자) 원고 마스킹 48ms, 청크 14ms, 키워드·참조 추출 168ms(Node, 개발 PC)
- 수동: 보류 → backlog MV-S04 (4항목)
- 의존성 추가:
  - pdfjs-dist 6.4.299 — 텍스트 PDF 추출. 구형 휴대폰 지원을 위해 legacy 빌드 사용, eval 없음, 워커와 한국어 CMap(KSC·UniKS·Adobe-Korea1, 24개)을 같은 출처로 번들(`scripts/vite-pdf-cmaps.ts`)
  - fflate 0.8.3 — docx 압축 해제(`word/document.xml`만, 50MB 상한)
- 설계 변경: DESIGN v0.12 변경 이력(마스킹 범위, 파싱 라이브러리, 이미지 PDF 판정, 미리보기 수동 가림 `[가림]`과 저장 시 재마스킹)
- 후속:
  - 열린 질문 20(청크 `keywords`·`verse_refs` 평문)과 21(원고 수정 기능)은 DESIGN에 "S04 착수 전 확정"으로 남아 있었으나 착수 때 묻지 않았다. 단계 문서의 기존 범위대로 구현했다(단어·참조만 평문, 수정 기능 없음). → 2026-11-05 사용자 확인, DESIGN v0.13에 반영(해결).
  - 스타일 프로필 상태 표시와 생성은 S10. `style_profile` 스토어는 삭제 트랜잭션을 위해 지금 만들어 두었다.
  - 파일 선택은 숨긴 `<input type="file" hidden>`을 버튼에서 `click()`으로 연다. iOS·Android 실기기 확인은 MV-S04.
