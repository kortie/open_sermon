# S08. LLM 어댑터, 키 등록과 검증, 마법사 4~9단계

| 항목 | 값 |
|---|---|
| 선행 | S04, S07 (S02의 마법사 1~3 포함) |
| DESIGN 참조 | 3.6, 3.13 전체, 4.1(`provider_key`, `consent_log`, `local_stats`), 4.3, 2.2, 12장 열린 질문 11 |
| 모듈 | `core/llm`, `core/vault`(키), `ui/setup-wizard`, `ui/settings` |
| 관련 스킬 | `llm-provider-adapter`, `key-vault-security`, `setup-wizard` |

## 목표
S07에서 검증된 제공자만 대상으로, 사용자 키를 안전하게 등록·검증·삭제하고 마법사 4~9단계를 완성한다. 생성 기능은 S09.

## 착수 전 확정
- 열린 질문 11: 마법사 완료 후 연결 확인이 실패했을 때 독립 모드로 자동 전환할지, 사용자가 선택하게 할지.
- S07에서 `browser_direct_verified: true`인 제공자가 1개 이상인지. 0개면 착수하지 않고 사용자에게 알린다.

## 범위
- **In**: `LlmClient` 인터페이스와 verified 제공자 어댑터, 오류 매핑, 타임아웃, 키 저장·마스킹·삭제, 형식 힌트 사전 검사, 마법사 4~9단계, 설정의 "연결 다시 하기 / 키 삭제 / 제공자 바꾸기", 일일 자가 한도 카운터, 원고 전송 동의 기록.
- **Out**: 프롬프트·생성·검증(S09), 스타일 프로필(S10), 미검증 제공자 어댑터.

## 산출물
```
src/core/llm/
  types.ts           # LlmClient { generate(system, user, opts), validateKey() }, LlmError(cause)
  errors.ts          # HTTP/오류 코드 → cause 매핑 (auth, billing, quota, region, network, timeout, format, unknown)
  fetchWithTimeout.ts
  providers/<verified>.ts   # 검증된 제공자만
  registry.ts        # config에서 verified 제공자만 노출
  dailyLimit.ts      # local_stats 기반 기기별 자가 한도
src/core/vault/providerKey.ts   # 저장, last4, 삭제
src/ui/setup-wizard/steps/{Provider,GetKey,PasteKey,Verify,Consent,Done}.tsx
src/ui/settings/ConnectionPanel.tsx
src/i18n/{ko,en}.json
tests/unit/llm/*.test.ts, tests/unit/vault/providerKey.test.ts
tests/e2e/wizard-llm.spec.ts
```

## 설계 상세
- 엔드포인트·모델·헤더 이름은 config에서 읽는다(하드코딩 금지). 키는 요청 헤더에만 넣는다.
- `LlmError`는 `cause`와 i18n 키만 가진다. 원본 응답·요청 헤더·키를 담지 않는다. 던지기 전 메시지·스택에서 키 문자열을 제거한다.
- 타임아웃 `generation.timeout_seconds`(60초), `AbortController` 사용. `validateKey()`는 S07의 최소 검증 요청을 한 번 보내고 응답 본문을 저장하지 않는다.
- 3.13.3 매핑: 알 수 없는 원인 → "연결에 실패했습니다. 키를 다시 확인해 주세요"(추측 금지).
- 형식 힌트: `wizard.key_format_hints` 접두사가 다르면 호출 전 안내. 형식 검사는 참고용, 사용자가 그래도 확인을 누르면 제공자 응답으로 판단.
- 검증은 "확인" 버튼 누를 때 1회. 자동 재시도·반복 호출 없음. 진행 중 버튼 비활성.
- 저장: `provider_key{provider, key_ciphertext, iv, key_last4, created_at}`. 화면에는 `••••last4`만. 입력칸 `type="password"`, `autocomplete="off"`, 저장 후 입력칸 비움.
- 마법사: 4단계 비교 카드는 `registry`가 주는 verified 제공자만, 추천 표시는 `beginner_recommendation`이 verified일 때만. 5단계 체크리스트, 외부 링크는 `<a target="_blank" rel="noopener noreferrer">`로 사용자가 누를 때만(프리페치·`window.open` 자동 호출 금지). 8단계 동의 기본값 "보내지 않음", 선택 시 `consent_log(kind=external_transfer)` 기록, Gemini 무료 티어면 경고 문구. 9단계 백업 권장(S06 화면으로 이동).
- 각 단계 건너뛰기 가능, 건너뛰면 독립 기능만 동작(규칙 18).
- 일일 한도: `local_limits.daily_llm_calls_per_device`, `local_stats`의 날짜별 카운트. `validateKey`도 1회로 센다. 초과 시 호출하지 않고 안내.
- 키 삭제: 저장소에서 즉시 삭제, 메모리 참조 해제, 화면 갱신.

## 테스트 요구사항
- 단위(모의 fetch): 성공, 401, 403, 402/결제 필요, 429, 지역 제한 응답, 타임아웃(가짜 타이머 60초), 네트워크 오류, 알 수 없는 500 → 각각 정확한 `cause`.
- 단위: 요청 키가 헤더에만 있고 URL·본문에 없음. 엔드포인트가 config 값과 일치.
- 단위: 모든 오류 경로에서 `String(err)`, `err.message`, `err.stack`, `JSON.stringify(err)`에 키 문자열 없음.
- 단위: `registry`가 `browser_direct_verified: false` 제공자를 반환하지 않음.
- 단위: 키 저장 후 `fake-indexeddb` 전체 덤프에 키 평문 없음, `key_last4`만 일치, 같은 키 두 번 저장 시 IV·암호문 다름, 삭제 후 레코드 없음.
- 단위: 형식 힌트 불일치 시 fetch 호출 0회.
- 단위: 일일 한도 도달 시 fetch 호출 0회, 날짜가 바뀌면 초기화.
- E2E(모의 fetch 라우트): 마법사 건너뛰기 → 본문·원고 기능 동작; 형식 오류 안내; 검증 성공 → 마스킹 표시; 인증 실패 안내; 네트워크 오류 안내; 동의 거절 후 원고 저장·검색 동작.
- E2E: 키 입력·검증·저장 흐름 동안 콘솔 메시지, DOM 텍스트(`document.body.innerText`), `localStorage`/`sessionStorage`에 키 문자열 없음.
- E2E: 5단계 화면 진입만으로는 제공자 도메인 요청 0건, 링크 클릭 시에만 새 탭.
- E2E: 확인 버튼 1회 클릭에 검증 요청 정확히 1건.

## 검증 게이트
- 자동:
  - `scripts/verify.sh full` PASS, `core/llm` 커버리지 ≥ 80%, `core/vault` ≥ 90%
  - 키 비노출 검사(콘솔·오류·DOM·IndexedDB 덤프·localStorage) 전부 통과
  - 독립 모드 네트워크 테스트: 키가 없거나 마법사 건너뛰기 시 외부 요청 0건
  - 미검증 제공자가 UI·registry·CSP 어디에도 나타나지 않음
- 수동:
  - [ ] 실제 키(지출 한도 설정)로 verified 제공자마다 마법사 끝까지 진행해 검증 성공
  - [ ] 실제 잘못된 키·삭제된 키로 인증 실패 안내가 맞게 뜸
  - [ ] 비행기 모드에서 네트워크 오류 안내 후 독립 기능 계속 사용
  - [ ] 고령 사용자 관점: 16px 이상, 버튼 라벨이 짧은 동사, 한 화면 한 행동(실기기 360px)
  - [ ] iOS Safari에서 붙여넣기 칸에 키 붙여넣기와 마스킹 동작

## 완료 정의
- [x] `LlmClient` 인터페이스만 구현, verified 제공자만 등록
- [x] 3.13.3 원인별 문구가 ko/en에 있고 매핑 테스트 통과
- [x] 키 평문이 어디에도 남지 않음(테스트로 확인)
- [x] 마법사 4~9단계 건너뛰기 가능, 외부 링크는 클릭 시에만
- [x] 설정에서 연결 다시 하기·키 삭제·제공자 바꾸기 동작

## 선행 단계 메모
- S07(2026-11-05, DESIGN v0.15, `docs/PROVIDERS.md`):
  - 검증된 제공자는 Anthropic뿐이다.
    - 엔드포인트: `POST https://api.anthropic.com/v1/messages`
    - 헤더: `Authorization: Bearer`, `anthropic-version: 2026-10-21`, `anthropic-dangerous-direct-browser-access: true`. 값은 config `providers.anthropic`에서 읽는다.
  - 모델: 사용자 선택(`models`), 기본 `claude-haiku-5-5`. S08 착수 때 모델 ID를 Models API 문서로 다시 확인한다.
  - 4단계 카드:
    - Gemini: `pending_verification` 비활성 카드
    - OpenAI: `no_browser_access` 안내 카드
    - 둘 다 선택할 수 없다.
    - `registry`는 선택 가능 목록(verified)과 표시 목록(verified + 비활성)을 구분해 준다.
  - 오류 매핑은 PROVIDERS.md anthropic 절을 따른다. 다음 둘은 3.13.3에 추가한 원인이다.
    - 400 작업공간 미지정
    - 401 `CORS requests are not allowed`
  - 이 앱은 fetch로 직접 호출한다(CLAUDE.md 4.5). SDK의 `dangerouslyAllowBrowser`는 쓰지 않는다.
- S06(2026-11-05): `core/backup`은 `provider_key`를 DESIGN 4.1 필드(`provider` keyPath, `key_ciphertext`, `iv`, `key_last4`, `created_at`)로 읽고 쓴다. 다르게 만들면 `core/backup`과 테스트를 함께 고친다. 마법사 완료 화면의 백업 권장 링크 대상은 `#/settings?section=backup`이다.

## 검증 기록

### 2026-11-05
- 자동: scripts/verify.sh full → PASS (단위 495개, E2E 138개, 네트워크 22개, 커버리지 core 줄 96.63%, `core/llm` 98.7%, `core/vault` 94.23%)
- 단계 게이트:
  - 모의 fetch 원인 매핑: 성공, 401(인증·조직 차단), 402, 403, 지역 유사 응답, 429, 400(작업공간·지출 한도·기타), 404, 500, 529, 비JSON 500, 네트워크, 60초 타임아웃(가짜 타이머) → PASS (`tests/unit/llm/anthropic.test.ts`)
    - 지역 제한: Anthropic은 별도 코드가 문서에 없어(PROVIDERS.md) 지역 유사 403을 `unknown`으로 둔다. `region` 원인과 문구는 다른 제공자용으로 남긴다.
  - 키는 `authorization` 헤더에만, URL·본문 없음, 엔드포인트 = config → PASS
  - 모든 오류 경로에서 `String(err)`, `message`, `stack`, `JSON.stringify(err)`에 키 없음 → PASS
  - registry가 미검증 제공자를 반환하지 않음, 미검증 제공자 클라이언트 생성 거부(요청 0건) → PASS
  - 키 저장: IndexedDB 전체 덤프에 평문 없음, `key_last4`만, 두 번 저장 시 IV·암호문 다름, 삭제 후 레코드 없음 → PASS
  - 형식 힌트 불일치 → fetch 0회 / 일일 한도 도달 → fetch 0회, 날짜 바뀌면 초기화 → PASS
  - E2E(`tests/e2e/wizard-llm.spec.ts`, 2개 뷰포트): 4단계 카드(비활성 사유, 추천은 verified만), 5단계 진입 시 제공자 요청 0건·링크 클릭 시에만 새 탭, 성공 시 마스킹 표시, 형식 오류 안내, 인증·네트워크·결제·원인 불명 안내, 확인 1회 = 요청 1건(진행 중 비활성), 동의 거절 후 원고 저장·내 설교에서 찾기 동작, 콘솔·DOM·localStorage·sessionStorage·IndexedDB 덤프에 키 없음, 설정 모델 변경·키 삭제 → PASS
  - 마법사 4~6단계 건너뛰기 후 독립 기능 동작(`wizard-skip.spec.ts`) → PASS
  - 독립 모드 네트워크: 키 없이 마법사 1~6단계 진행·건너뛰기, 설정 연결 패널 → 외부 요청 0건(`tests/network/wizard-offline.spec.ts`, `isolation.spec.ts`) → PASS
  - CSP connect-src = `'self' https://api.anthropic.com`, 미검증 제공자 없음(dist-csp, config) → PASS
- 수동: 보류 → backlog MV-S08 (5항목)
- 의존성 추가: 없음
- 설계 변경: DESIGN v0.16 3.13.2·3.13.3(착수 전 확정, 열린 질문 11·24), 4.1 필드 이름 명시(`llm_provider`, `llm_model`, `llm_calls`)
- 구현 메모:
  - 저장소 v5 마이그레이션 `provider_key`(keyPath `provider`). `core/backup`과 필드가 같아 백업 코드 변경 없음(테스트 픽스처만 조정)
  - 제공자·모델 선택은 `settings`의 `llm_provider`, `llm_model`(평문 id). 키는 `provider_key`에만 암호화 저장
  - 붙여넣은 키는 마법사 컴포넌트 메모리에만 있고 확인 시도 후 비운다. 7단계에서 새로고침하면 6단계로 돌아간다
  - 8단계 동의는 고른 값(보냄/안 보냄)을 `consent_log(kind=external_transfer, target_id=제공자)`에 남긴다
  - 검증 요청: `max_tokens` 1, user 한 줄(PROVIDERS.md 최소 검증 요청). `thinking` 파라미터는 보내지 않는다(Opus 5.5는 끌 수 없음)
  - S09용 `connectedClient()`를 `core/llm/connection.ts`에 두었다
- 후속:
  - S09: 생성 호출마다 `takeDailySlot()`을 먼저 부르고, `connectedClient()`로 클라이언트를 얻는다
  - `wizard_state`가 `done`인 사용자가 설정의 "연결 다시 하기"에서 건너뛰기를 누르면 상태가 `skipped`로 바뀐다(첫 실행 판정에만 쓰여 영향 없음)
