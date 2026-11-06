# S14. Gemini 제공자

| 항목 | 값 |
|---|---|
| 선행 | S08, S09 |
| DESIGN 참조 | 2.2, 3.13, 3.13.1, 3.13.3 (v0.19) |
| 모듈 | `src/core/llm/providers/gemini.ts`, `src/core/llm/errors.ts`, `src/core/llm/registry.ts`, `src/ui/setup-wizard/steps/GetKey.tsx`, `src/app/generate/Generate.tsx`, `config/app.config.json` |
| 관련 스킬 | `llm-provider-adapter`, `setup-wizard`, `key-vault-security` |

## 목표
Gemini 무료 플랜으로 말씀 나눔 초안을 만들 수 있게 하고, 처음 쓰는 분께 기본으로 추천한다.

## 착수 전 확정
- 2026-11-06 사용자 결정:
  - 사내망에서 Google 공식 문서가 막혀 있어, 사용자 제공 메모(`clipboard-text-2026-11-05T23-49-17-236Z.txt`)를 공식 가이드로 간주한다.
  - Gemini 무료 플랜을 기본 추천으로 둔다.
  - OAuth 방식은 검토하지 않는다.
- 메모에 없는 호출 조건(CORS, 엔드포인트, 헤더)은 실기기 앱 WebView에서 잘못된 키로 확인한다.

## 범위
- **In**:
  - Gemini 어댑터(`generateContent`, 키 확인은 모델 조회 GET)
  - 오류 원인 매핑
  - config 활성화(`browser_direct_verified: true`, 기본 추천, 모델 별칭 2개)
  - 마법사 5단계 발급 안내(ko/en)
  - 생성 전 무료 플랜 주의 문구
  - `docs/PROVIDERS.md` 기록, 사용자용 가이드 `docs/guides/gemini-api-key.md`
- **Out**: OAuth, 스트리밍, 유료 결제 안내 화면, 무료 한도 수치 표시.

## 산출물
```
src/core/llm/providers/gemini.ts
src/core/llm/errors.ts            # readGoogleError, geminiCause
src/core/llm/registry.ts          # ADAPTERS.gemini
src/ui/setup-wizard/steps/GetKey.tsx
src/app/generate/Generate.tsx     # generate-notice-gemini
src/i18n/ko.json, en.json         # wizard.get_key.gemini.*, llm.model_name/desc, generate.notice_gemini
config/app.config.json            # providers.gemini, wizard.beginner_recommendation
docs/PROVIDERS.md, docs/guides/gemini-api-key.md
tests/unit/llm/gemini.test.ts, tests/e2e/gemini.spec.ts
```

## 테스트 요구사항
- 키는 `x-goog-api-key` 헤더에만 넣는다. URL(`?key=`), 본문, 오류 어디에도 없어야 한다.
- 키 확인은 `GET <endpoint>/<model>` 한 번, 생성은 `POST <endpoint>/<model>:generateContent`.
- 요청 본문은 `systemInstruction`, user 한 턴, `maxOutputTokens`. 응답은 첫 후보의 text 조각만 잇고, thought 조각은 뺀다.
- 오류 매핑:
  - API_KEY_INVALID, 401, 403 → 인증
  - 429 → 사용 한도
  - 지원 안 되는 지역 → 지역
  - 그 밖 → 원인 불명
- 모델 id가 경로를 바꿀 수 있는 값이면 요청 전에 실패한다.
- 마법사 화면:
  - Gemini가 미리 골라져 있고 추천 표시가 붙는다.
  - 발급 안내는 5줄이고, 링크는 누를 때만 열린다.
  - 버튼을 누르기 전에는 요청이 없다.
  - 실패하면 원인 문구를 보여주고 키를 저장하지 않는다.
- Gemini로 연결된 상태에서는 생성 전 안내에 무료 플랜 주의가 보인다.

## 게이트
- 자동: `scripts/verify.sh full`
- 수동(backlog MV-S14):
  - [ ] 실제 Gemini 키(무료)로 마법사 확인이 성공하는지. `gemini-flash-latest` 별칭이 있는지 함께 본다(404면 원인 불명 문구).
  - [ ] 실제 키로 말씀 나눔 초안, 예시, 한마디가 검증을 통과해 나오는지. 출력 길이와 생각(thinking) 토큰 때문에 잘리지 않는지.
  - [ ] 한국에서 무료 플랜 호출이 되는지(지역 오류가 없는지).
  - [ ] 무료 한도를 넘었을 때 사용 한도 문구가 나오는지.

## 완료 정의
- [x] 자동 게이트 PASS
- [x] 검증 기록 작성, 수동 항목 backlog 이관
- [x] 상태 표 갱신

## 검증 기록 (마무리 때 작성)

### 2026-11-06
- 자동: scripts/verify.sh full → PASS (단위 634개, E2E 192개, 네트워크 24개, 커버리지 core 97.79%(lines))
- 단계 게이트:
  - 실기기 앱 WebView CORS 확인(SM-S931N, `https://localhost`, LTE): GET·POST 모두 400 `API_KEY_INVALID` 본문을 읽음 → 통과
  - `tests/unit/llm/gemini.test.ts`, `tests/e2e/gemini.spec.ts` → 통과
- 수동: 보류 → backlog MV-S14 (4항목)
- 의존성 추가: 없음
- 설계 변경: DESIGN v0.19 (2.2, 3.13, 3.13.1, 11장 S14), 변경 이력 2026-11-06 행
- 함께 고친 것:
  - ESLint 무시 목록에 `android/`, `ios/` 추가. 빌드 산출물의 `native-bridge.js`가 린트에 걸렸다.
  - CSP·네트워크 테스트의 검증 제공자 기대값을 Gemini·Anthropic으로 바꿨다.
- 후속:
  - 모델 별칭 `gemini-flash-latest`는 기억에 의존한 값이다. 실키 확인에서 404가 나오면 PROVIDERS.md와 config를 고친다.
  - 지역 오류 매핑도 실기기로 확인하지 않았다.
