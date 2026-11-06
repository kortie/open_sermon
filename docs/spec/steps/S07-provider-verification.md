# S07. 제공자 브라우저 직접 호출 검증과 설정값 확정

| 항목 | 값 |
|---|---|
| 선행 | S00 (다른 단계와 병행 가능) |
| DESIGN 참조 | 2.2, 3.6, 3.13(비교 카드, 3.13.1, 3.13.3), 4.3, 12장 열린 질문 1·2·9·10 |
| 모듈 | `docs/PROVIDERS.md`, `config/app.config.json`, CSP 생성 스크립트 |
| 관련 스킬 | `llm-provider-adapter` |

## 목표
Gemini, OpenAI, Anthropic 각각에 대해 브라우저에서 사용자 키로 직접 호출할 수 있는지 **공식 문서로** 확인하고, 결과를 기록해 config와 CSP에 반영한다. 코드 구현(어댑터)은 하지 않는다.

## 착수 전 확정
- 없음. 단, 마무리 보고에서 열린 질문 1(PWA vs 래핑 앱), 2(제공자 범위)에 대한 결정안을 제시하고 사용자 확인을 받는다.

## 범위
- **In**: 제공자별 공식 문서 조사, `docs/PROVIDERS.md` 작성, `app.config.json`의 `endpoint`·`model`·`browser_direct_verified` 및 발급 안내 링크(`console_url`, `pricing_url`, `billing_url` 등) 채우기, 3.13.1 발급 절차 문구와 공식 문서 대조, CSP `connect-src`를 config에서 생성하는 빌드 연동, `check-config.mjs`의 제공자 규칙.
- **Out**: `LlmClient` 구현(S08), 마법사 4~9 화면(S08), 래핑 앱 구현.

## 산출물
```
docs/PROVIDERS.md
config/app.config.json            # providers.* 확정값
scripts/build-csp.mjs             # config → connect-src (vite 플러그인 또는 빌드 전 단계)
scripts/check-config.mjs          # 제공자 규칙 추가
tests/unit/config/csp.test.ts
```

## 설계 상세
- `docs/PROVIDERS.md` 제공자별 절 형식:
  ```
  ## gemini — 확인일 YYYY-MM-DD
  - 브라우저 직접 호출: 허용 | 불가 | 불명 (근거 문장 인용, 출처 URL)
  - CORS 조건: 프리플라이트 허용 헤더, 필요한 특수 헤더(있다면 문서 원문 그대로)
  - 엔드포인트(출처 포함), 인증 헤더 이름(키는 헤더로만, 쿼리 문자열 금지)
  - 모델명(출처, 무료 티어 사용 가능 여부)
  - 최소 검증 요청(가장 짧은 요청 형태, 예: 모델 목록 또는 1토큰 생성)
  - 오류 응답 → 3.13.3 원인 매핑표(HTTP 상태, 오류 코드)
  - 입력 데이터 사용 정책(무료/유료 티어별, 출처)
  - 키 접두사 확인, 발급 절차(3.13.1)와 공식 화면 이름 차이
  ```
- 판정 규칙: 공식 문서에 브라우저 직접 호출이 명시적으로 허용되고(또는 문서상 CORS 지원이 확인되고) 필요한 헤더가 확정된 경우에만 `browser_direct_verified: true`. 하나라도 불명이면 `false` 유지.
- 3.13.1 문구가 공식 화면과 다르면 수정안을 i18n에 반영하고 PROVIDERS.md에 수정 날짜를 남긴다(CLAUDE 규칙 19).
- 모든 URL은 config에만 둔다(CLAUDE 규칙 23).
- CSP `connect-src`는 `'self'` + `browser_direct_verified: true`인 제공자 엔드포인트의 **출처(origin)**만. `false`인 제공자의 도메인은 넣지 않는다.
- 래핑 앱 판단: 세 제공자 중 `true`가 하나 이상이면 PWA 유지 권장, 0개면 사용자에게 래핑 앱(Capacitor 등) 여부를 묻는다. 서버 중계는 선택지가 아니다(CLAUDE 규칙 1).

## 테스트 요구사항
- 단위: config에 verified 제공자 2개·미검증 1개가 있을 때 생성된 `connect-src`에 앞의 두 출처만 있음.
- 단위: verified 제공자의 `endpoint`가 `<...>` 자리표시자이면 `check-config.mjs` 실패.
- 단위: verified 제공자에 대응하는 `PROVIDERS.md` 절(확인일 포함)이 없으면 `check-config.mjs` 실패.
- 단위: 엔드포인트가 `https://`가 아니면 실패.

## 검증 게이트
- 자동:
  - `scripts/verify.sh full` PASS (`check-config.mjs` 제공자 규칙, `check-csp.mjs` 포함)
  - 빌드된 `dist/index.html`의 `connect-src`가 verified 제공자 출처와 정확히 일치(누락·추가 없음)
  - `src/`에 제공자 URL 문자열 없음(정적 점검 23)
- 수동:
  - [ ] verified 제공자마다 실제 키로 데스크톱 브라우저 개발자 도구에서 최소 검증 요청 → 프리플라이트·본 요청 성공, 응답 상태 기록
  - [ ] 같은 요청을 Android Chrome, iOS Safari 실기기에서 성공
  - [ ] 잘못된 키로 요청 시 실제 오류 응답이 PROVIDERS.md 매핑표와 일치
  - [ ] 3.13.1 발급 절차를 공식 사이트에서 직접 따라 하며 화면 이름이 i18n 문구와 일치

## 완료 정의
- [x] 세 제공자 모두 PROVIDERS.md에 확인일·출처 URL 있는 절이 있음(불가·불명 포함)
- [x] `browser_direct_verified`가 판정 규칙대로 설정됨
- [x] CSP `connect-src`가 config에서 생성됨
- [x] 열린 질문 1·2 결정안을 사용자에게 보고하고 DESIGN.md에 반영(확정 시)

## 검증 기록

### 2026-11-05
- 자동: scripts/verify.sh full → PASS (단위 457개, E2E 112개, 네트워크 20개, 커버리지 core 줄 96.53%·분기 91.99%)
- 단계 게이트:
  - 제공자 규칙 PASS
    - `check-config.mjs`가 확인하는 것: verified인데 자리표시자, 확인일 없음, https 아님, 추천 제공자 미검증, 비활성 카드 사유 없음, `model` ∉ `models`
  - 빌드 결과 `dist/index.html` `connect-src 'self' https://api.anthropic.com` → verified 출처와 정확히 일치(`checkCsp`가 누락·추가 모두 검사)
  - 정적 점검 23(src에 URL 없음) PASS
- 판정:
  - anthropic `true`: CORS 조건과 `anthropic-dangerous-direct-browser-access` 헤더가 문서화되어 있다.
  - openai `false`: 문서가 브라우저 노출을 금지한다.
  - gemini `false`: aistudio.google.com 연결 불가로 공식 문서 본문을 확인하지 못했다.
- 수동: 보류 → backlog MV-S07 (4항목)
- 의존성 추가: 없음
- 설계 변경: DESIGN v0.15
  - 2.2 확인 결과와 PWA 유지
  - 3.6 모델 선택(기본 `claude-haiku-5-5`)
  - 3.13 비활성 카드(Gemini 확인 중, OpenAI 미제공)
  - 3.13.1 Anthropic 발급 문구를 공식 화면에 맞춤
  - 3.13.3 원인 2개 추가
  - 열린 질문 1·2 해결
  - 위 결정에 맞춰 CLAUDE.md 규칙 20 문구를 고쳤다(사용자 결정).
- 후속:
  - Gemini는 공식 문서(aistudio.google.com/docs/api-key)를 읽을 수 있는 환경에서 다시 판정한다. `AIza` 접두사, 키 유형, 무료 티어 데이터 정책도 함께 다시 확인한다.
  - S08 착수 때 Anthropic 모델 ID를 Models API 문서로 다시 확인한다.
  - 입력 데이터 사용 정책은 열린 질문 10에 남긴다.
