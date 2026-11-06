# 제공자 확인 기록

LLM 제공자별로 **브라우저 직접 호출 허용 여부**와 호출 조건을 공식 문서로 확인한 기록이다(CLAUDE.md 4.5, 규칙 19·20, S07). 기억으로 채우지 않는다. `config/app.config.json`의 `browser_direct_verified`를 `true`로 바꾸려면 아래 해당 절에 `확인 날짜: YYYY-MM-DD`가 있어야 한다(`scripts/check-config.mjs`가 검사).

발급 안내 문구(DESIGN 3.13.1)를 고친 날짜도 여기에 기록한다.

판정 규칙(S07): 공식 문서가 브라우저 직접 호출을 명시적으로 허용하거나 CORS 지원을 문서화하고, 필요한 헤더가 확인된 경우에만 `true`로 둔다. 그 밖에는 `false`로 둔다.

## gemini
- 확인 날짜: 2026-11-06
- 근거(사용자 결정 2026-11-06: 사내망에서 Google 공식 문서가 막혀 있어, 사용자가 제공한 안내 메모를 공식 가이드로 간주한다):
  - 사용자 제공 메모 `clipboard-text-2026-11-05T23-49-17-236Z.txt`(Gemini가 답한 발급 안내). 정리본: `docs/guides/gemini-api-key.md`
  - 2026-11-05 시도 기록: ai.google.dev → aistudio.google.com 301 이동 후 ECONNRESET. github.com/googleapis/js-genai README는 "In the browser the initialization code is identical"라고 쓴다. 같은 README가 운영 환경에서는 클라이언트 코드에 키를 넣지 말라고 권한다. 이 앱은 사용자 **본인 키**를 기기 안에 암호화해 쓰므로 운영자 키 노출 문제가 없다(Anthropic과 같은 판단).
- 브라우저 직접 호출(CORS) 허용: **실기기에서 확인함.**
  - 2026-11-06 SM-S931N(Android 17, WebView 156), 앱 WebView 출처 `https://localhost`, LTE 연결
  - 잘못된 키(`AIza…` 형식의 가짜 값)로 두 요청을 보냈다.
    - `GET /v1beta/models?pageSize=2` (사용자 지정 헤더 `x-goog-api-key` → 사전 요청 발생)
    - `POST /v1beta/models/<id>:generateContent` (`content-type: application/json`)
  - 둘 다 HTTP 400 응답 본문을 페이지가 읽었다: `INVALID_ARGUMENT`, reason `API_KEY_INVALID`, "API key not valid. Please pass a valid API key."
  - 교차 출처 응답을 읽었으므로 사전 요청과 CORS가 허용된 것이다.
  - 실키 성공 응답은 아직 보지 못했다(backlog).
- 필요한 헤더(인증, 기타): `x-goog-api-key: <key>`(URL `?key=`는 쓰지 않는다). POST에는 `content-type: application/json`.
- 엔드포인트 / 모델:
  - 엔드포인트 기준: `https://generativelanguage.googleapis.com/v1beta/models` (실기기 응답으로 호스트와 경로 확인)
    - 생성: `POST <기준>/<model>:generateContent`
    - 키 확인: `GET <기준>/<model>`
  - 모델: `gemini-flash-latest`(기본), `gemini-flash-lite-latest`
    - 최신 Flash 계열을 가리키는 별칭이라 모델 세대가 바뀌어도 config를 고치지 않아도 된다.
    - **메모와 공식 문서에는 없는 값이다(기억에 의존).** 메모의 `gemini-1.5-flash`는 지난 세대라 쓰지 않았다.
    - 키 확인 요청이 이 모델 id를 조회하므로, 별칭이 없으면 실키 확인에서 바로 드러난다(404 → 원인 불명 문구). backlog MV-S14에서 실키로 확인한다.
- 요청 형식: `systemInstruction.parts[].text`, `contents[{role:"user", parts[{text}]}]`, `generationConfig.maxOutputTokens`
- 응답 형식: `candidates[0].content.parts[].text`를 잇는다. `thought: true` 조각은 뺀다.
- 최소 검증 요청: `GET <기준>/<model>`. 생성 한도를 쓰지 않는다. 사용자가 버튼을 누를 때 한 번만 보낸다(규칙 18).
- 오류 코드 → 3.13.3 원인 매핑:
  - reason `API_KEY_INVALID`(실기기 확인: 400 `INVALID_ARGUMENT`), 401, 403 → 인증
  - 429 / `RESOURCE_EXHAUSTED` → 사용 한도(무료 한도 포함)
  - 400 `FAILED_PRECONDITION` + "location is not supported" → 지역(기억에 의존, 실기기 미확인)
  - 그 밖(404 모델 없음, 5xx 등) → 원인 불명 문구
  - fetch 실패·타임아웃 → 네트워크
- 무료 플랜 입력 데이터 사용 정책(메모 인용): "무료 플랜을 통해 입력 및 출력되는 데이터는 Google의 서비스 향상을 위한 학습 데이터로 활용되거나 검토될 수 있습니다", "유료 결제 계정으로 전환하면 데이터가 학습에 사용되지 않습니다"
  - 마법사 안내(`wizard.get_key.gemini.note`), 생성 안내(`generate.notice_gemini`), 말투 분석 확인(`sermons.style.gemini_warning`)에 표시한다.
- 무료 한도: 메모의 "1.5 Flash 분당 15회, 하루 1,500회"는 지난 세대 수치라 화면에 쓰지 않는다. "횟수 제한이 있다"고만 안내한다.
- 발급 안내 문구 대조 날짜: 2026-11-06, 메모 대조
  - AI Studio 로그인 → "Get API key" → "Create API key" → (처음이면) "Create API key in new project" → 복사
  - 키는 `AIza`로 시작
  - i18n `wizard.get_key.gemini.*`에 반영
- 결론: `browser_direct_verified: true`(사용자 결정과 실기기 CORS 확인), `wizard.beginner_recommendation: gemini`(사용자 요청 "무료 플랜을 기본으로")

## openai
- 확인 날짜: 2026-11-05
- 근거 URL:
  - https://developers.openai.com/api/reference/overview (platform.openai.com/docs/api-reference/authentication은 403으로 열리지 않았다)
  - https://developers.openai.com/api/docs/guides/production-best-practices
  - https://developers.openai.com/api/docs/quickstart
- 브라우저 직접 호출(CORS) 허용: **허용하지 않음.**
  - API reference 인용: "Don't share it with others or expose it in any client-side code such as browsers or apps."
  - CORS는 언급이 없다.
- 필요한 헤더(인증, 기타): `Authorization: Bearer <key>`
- 엔드포인트 / 모델:
  - 엔드포인트: 문서 예시의 `https://api.openai.com/v1/chat/completions`, `https://api.openai.com/v1/models`
  - 모델: 미확인(비노출이라 확인 생략)
- 최소 검증 요청: 해당 없음(비노출)
- 오류 코드 → 3.13.3 원인 매핑: 해당 없음(비노출)
- 입력 데이터 사용 정책: 해당 없음(비노출)
- 발급 안내 문구 대조 날짜: 2026-11-05 quickstart 대조
  - 버튼 이름 "Create an API Key"와 결제 안내 "Add credits to keep building" / "Go to billing"을 확인했다.
  - 키 접두사(`sk-`)는 문서에 적혀 있지 않다.
  - 비노출이라 i18n 반영은 없다.
- 결론: `browser_direct_verified: false`
  - 공식 문서가 브라우저 노출을 금지한다.
  - `unavailable_reason: no_browser_access`. 마법사에는 고를 수 없는 안내 카드로만 두고, connect-src에서는 제외한다(DESIGN 3.13 v0.15).

## anthropic
- 확인 날짜: 2026-11-05
- 근거 URL:
  - https://platform.claude.com/docs/en/manage-claude/authentication#browser-based-applications
  - https://platform.claude.com/docs/en/api/overview
  - https://platform.claude.com/docs/en/api/errors
  - https://platform.claude.com/docs/en/get-api-key
  - https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript (Browser usage)
- 브라우저 직접 호출(CORS) 허용: **문서화되어 있음(조건부).**
  - 인용: "A request sent directly from a browser is a cross-origin (CORS) request. The API accepts these requests only when they include the `anthropic-dangerous-direct-browser-access: true` header"
  - 단서 1: 문서는 원칙적으로 자체 백엔드를 거치라고 권한다("Call the Claude API from your own back end"). 브라우저 사용이 괜찮은 예로 든 것은 내부 도구와 개발·디버깅뿐이다. 사용자가 **본인 키**를 넣는 이 앱은 운영자 키 노출 문제가 없다. 다만 키는 사용자 기기의 브라우저에 남는다(non-extractable 암호화로 보관).
  - 단서 2: 조직에 ZDR이나 Compliance API가 켜져 있으면 브라우저 호출이 불가능하다. 이때 401 `authentication_error`가 오고, 메시지는 `CORS requests are not allowed for this Organization`으로 시작한다. 키는 유효하다.
- 필요한 헤더(인증, 기타):
  - `Authorization: Bearer <key>`(기본). `x-api-key`는 legacy지만 계속 지원한다.
  - `anthropic-version: 2026-10-21`
  - `content-type: application/json`
  - `anthropic-dangerous-direct-browser-access: true`
  - 작업공간(workspace)에 묶이지 않은 personal key는 `anthropic-workspace-id` 헤더가 필수다. 없으면 400 `invalid_request_error`가 온다. 그래서 발급 안내에서 키를 작업공간에 묶도록 안내해야 한다.
- 엔드포인트 / 모델:
  - 엔드포인트: `POST https://api.anthropic.com/v1/messages`
  - 모델: 사용자 선택(DESIGN 3.6 v0.15, 사용자 결정 2026-11-05)
    - 목록 `models`: `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`
    - 기본 `model`: `claude-haiku-5-5`
    - 모델 ID 출처: claude-api 참조(2026-10-06 캐시)와 platform.claude.com 문서 예시(`claude-opus-5-5`)
    - 참고 가격(1M 토큰당 입력/출력): Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20. 화면에는 금액을 적지 않는다(DESIGN 3.13).
    - S08 구현 전에 Models API(`GET /v1/models`) 문서로 ID를 다시 확인한다.
- 최소 검증 요청: `POST /v1/messages`, `max_tokens` 1, user 메시지 한 줄. 사용자가 버튼을 누를 때 한 번만 보낸다(규칙 18). 200이면 성공이다.
- 오류 코드 → 3.13.3 원인 매핑:
  - 401 `authentication_error` → 인증(키 오류·만료·폐기). 단, 메시지가 `CORS requests are not allowed`로 시작하면 "이 조직은 브라우저 호출 불가"로 따로 안내한다.
  - 402 `billing_error` → 결제/크레딧
  - 400 `invalid_request_error`
    - 지출 한도 도달 → 사용 한도
    - 작업공간 헤더 누락 → "키를 작업공간에 묶어 다시 만들기" 안내
    - 그 밖 → 원인 불명 문구
  - 429 `rate_limit_error` → 사용 한도(요청 한도 또는 티어 월 지출 상한)
  - 403 `permission_error` → 원인 불명 문구(키 권한·작업공간 설정)
  - 500 / 529 / 504 → 일시 장애(원인 불명 문구)
  - fetch 실패·타임아웃 → 네트워크
  - 지역 제한: 오류 표에 별도 코드가 없다(supported-regions 페이지). 추측하지 않는다.
- 입력 데이터 사용 정책: 이번 확인 범위에 넣지 않았다. DESIGN 열린 질문 10에 남는다.
- 발급 안내 문구 대조 날짜: 2026-11-05. DESIGN 3.13.1과 다른 점(설계 반영은 사용자 확인 후):
  - 화면 경로: Settings → API keys(`platform.claude.com/settings/keys`)
  - 버튼: "Create key"(소문자 k)
  - 생성 대화상자 항목: 이름, 만료(expiration) 선택, Linked account, 작업공간 선택
  - 키는 `sk-ant-`로 시작하고 생성 때 한 번만 보인다(기존 문구와 일치).
  - 결제: Billing(`platform.claude.com/settings/billing`)
  - **DESIGN 3.13.1 Anthropic 문구 수정: 2026-11-05**(v0.15, 사용자 확인). i18n 마법사 문구는 S08에서 이 문구로 작성한다.
- 결론: `browser_direct_verified: true`
  - CORS 조건과 헤더가 문서화되어 있다.
  - 실기기·실키 확인은 backlog MV-S07에서 한다.

## 휴대폰 안 AI (`on_device_ai`, S15)

제공자 API가 아니라 OS가 제공하는 기기 안 모델이다. 엔드포인트, 열쇠, CORS가 없어서 `providers`에 넣지 않고 `config/app.config.json`의 `on_device_ai`에 둔다.

- 확인 날짜: 2026-11-06 (developers.google.com은 사내망에서 열림)
- Android: ML Kit GenAI Prompt API
  - 의존성 `com.google.mlkit:genai-prompt:1.0.0-beta4`(2026-07 공개). beta5는 2026-10-26 공개로 2주가 안 돼 쓰지 않았다.
  - minSdk 26. 입력과 출력을 합친 문맥은 4,000토큰 미만. 시스템 지시는 nano-v3 이상에서 쓰고 150단어 이하를 권장.
  - 앱이 화면 맨 앞에 있을 때만 동작한다(BACKGROUND_USE_BLOCKED). 앱별 한도(BUSY, PER_APP_BATTERY_USE_QUOTA_EXCEEDED)가 있다. 부트로더가 풀린 기기는 지원하지 않는다.
  - API(javap로 확인): `GenerativeModelFutures.from(Generation.INSTANCE.getClient())`, `checkStatus()`(AVAILABLE, DOWNLOADABLE, DOWNLOADING, UNAVAILABLE), `download(DownloadCallback)`, `generateContent(GenerateContentRequest)`, `getTokenLimit()`, `isSystemPromptAvailable()`.
  - 실기기(SM-S931N, Galaxy S25): 공식 지원 기기 목록에는 없지만 `checkStatus` 결과는 "downloadable"(2026-11-06).
  - **데이터 공개**(`developers.google.com/ml-kit/android-data-disclosure`): ML Kit은 기기 정보, 앱 정보, 성능 지표, 사용 통계, 입출력 크기 같은 진단 정보를 Google에 보낸다. 입력 글과 결과 글 자체는 포함하지 않는다고 적혀 있다. 이 전송은 앱이 끌 수 없어 절대 규칙 2의 예외로 허용했다(사용자 결정 2026-11-06). 설정 카드에 알리고 이 링크를 둔다.
- iOS: Apple Foundation Models(iOS 26 이상, Apple Intelligence 지원 기기·지역, `SystemLanguageModel.availability`). 플러그인은 맥에서 빌드해야 해서 후속(backlog MV-S15).
- 결론: Android 플러그인을 구현하고 예시와 한마디만 만든다. 기본은 꺼짐이고 사용자가 켜야 쓴다. 일일 한도에 세지 않는다.
