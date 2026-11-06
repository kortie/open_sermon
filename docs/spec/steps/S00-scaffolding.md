# S00. 프로젝트 셋업, PWA 셸, CSP, i18n 기반, 검증 스크립트

| 항목 | 값 |
|------|----|
| 선행 | - |
| DESIGN 참조 | 1.3, 2.1, 4.3, 5장(CSP 보완), 10장 |
| 모듈 | 전체 골격, `src/i18n`, `config`, `scripts` |
| 관련 스킬 | `sermon-verify` |

## 목표
서버 없는 정적 PWA 골격을 만들고, 이후 모든 단계가 쓸 검증 게이트(`scripts/verify.sh quick|full`)와 규칙 강제 장치(ESLint 경계, i18n 키 일치, CSP, 설정 스키마)를 먼저 세운다.

## 착수 전 확정
- ~~의존성 버전과 서비스 워커 방식~~ — 확정(2026-11-04, 사용자 결정):
  - Node 22 LTS(`.nvmrc`), 사용자 홈에 설치. 시스템 Node 18은 최신 Vite·Vitest·ESLint·Playwright가 지원하지 않음.
  - 서비스 워커는 `vite-plugin-pwa`(generateSW, `injectRegister: 'script'`로 외부 등록 스크립트, `manifest: false`로 수동 매니페스트 유지, `runtimeCaching` 없음).
  - TypeScript 6.0.x: typescript-eslint가 `<6.1`만 지원. eslint-plugin-react는 ESLint 10 미지원이라 `react/no-danger`를 `no-restricted-syntax`로 대체.
  - CSP 메타는 `index.html` 원본이 아니라 빌드 시 Vite 플러그인이 넣는다(개발 서버 HMR 인라인 스크립트와 충돌 방지). 정책 생성과 검사는 `scripts/check-csp.mjs` 한 파일에 둔다.

## 범위
- **In**: Vite+React+TS 프로젝트, 최대 폭 480px 중앙 레이아웃 셸, `manifest.webmanifest`와 아이콘, 서비스 워커(앱 셸 사전 캐시), CSP 메타, i18n 기반(`ko.json`, `en.json`, `t()`), ESLint 경계 규칙, `scripts/verify.sh`, `check-i18n.mjs`, `check-csp.mjs`, `check-config.mjs`, Vitest·Playwright·네트워크 테스트 하네스, `config/app.config.json` 골격과 스키마, `docs/PROVIDERS.md` 골격.
- **Out**: 본문 DB(S01), 저장소(S02), 화면 기능 전부, 제공자 값 채우기(S07).

## 산출물
```
package.json                 # scripts: dev, build, lint, test, test:e2e, test:network, verify:db(S01 전엔 SKIP)
vite.config.ts
vitest.config.ts             # 커버리지 임계값 (sermon-verify §1.2)
playwright.config.ts         # chromium 360×800 hasTouch, webkit 390×844
eslint.config.js             # no-restricted-imports(경계), react/no-danger, no-console, innerHTML 금지
index.html                   # CSP 메타, viewport
public/manifest.webmanifest
public/icons/
src/main.tsx
src/app/App.tsx              # 빈 셸 (i18n 문자열 1개 이상 사용)
src/i18n/ko.json
src/i18n/en.json
src/i18n/index.ts            # t(key), 언어 상태
src/core/{bible,bible-import,selection,sermon,compose,persona,llm,generate,validate,vault,backup,store}/index.ts  # 빈 진입점
src/sw.ts                    # 또는 플러그인 설정
config/app.config.json       # CLAUDE.md 6장 골격, 자리표시자 유지
config/app.config.schema.json
scripts/verify.sh
scripts/check-i18n.mjs
scripts/check-csp.mjs
scripts/check-config.mjs
docs/PROVIDERS.md            # 제공자별 절 골격 (확인 날짜, 근거 URL, 결과 빈칸)
.env.example                 # 비밀값 없음
tests/unit/smoke.test.ts
tests/e2e/shell.spec.ts
tests/network/isolation.spec.ts
tests/helpers/network.ts     # 같은 출처 외 요청 기록·차단
```

## 설계 상세
- **CSP 메타**: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self'; object-src 'none'; base-uri 'self'`. `connect-src`의 제공자 출처는 빌드 시 `config/app.config.json`에서 `browser_direct_verified: true`인 항목만 넣는다(S00 시점은 없음).
- 개발 서버의 HMR이 CSP와 충돌하면 개발 모드에서만 완화하고, `dist/index.html`은 위 정책 그대로여야 한다(`check-csp.mjs`는 `dist`만 검사).
- **i18n**: `t(key, params?)`는 키가 없으면 개발 모드에서 예외, 운영에서는 키 문자열 반환. 언어 상태는 S02 전까지 메모리 값(기본 `ko`).
- **ESLint 경계**: 독립 모듈(`bible`, `bible-import`, `selection`, `sermon`, `compose`, `persona`, `validate`, `vault`, `backup`, `store`) → `core/llm`, `core/generate` 금지. `src/app`, `src/ui` → `idb`, `indexedDB` 직접 사용 금지.
- **verify.sh**: `set -u`, 게이트별 PASS/FAIL/SKIP을 모아 마지막에 `VERIFY <mode>: PASS|FAIL (...)` 출력. 테스트 파일이 없는 스위트, 아직 없는 디렉터리, `public/data/bible.sqlite` 부재(S01 전)는 SKIP.
- **check-config.mjs**: 스키마 검사, `excluded_bibles` 교차 검사, `browser_direct_verified: true`인데 자리표시자가 남으면 FAIL. 자리표시자 `sha256`·`pbkdf2_iterations`는 해당 단계 전까지 경고만(어느 단계부터 FAIL인지 옵션으로 받는다).
- **서비스 워커**: 앱 셸(HTML, JS, CSS, 아이콘, 매니페스트)만 사전 캐시. 외부 출처 요청은 가로채지 않는다(LLM 호출 캐시 금지).

## 테스트 요구사항
- 단위: `t()`가 ko/en에서 같은 키로 다른 값을 반환, 없는 키 처리.
- 단위: `check-i18n.mjs`가 키 불일치, 빈 값, 코드에서 쓰는데 없는 키를 각각 FAIL로 보고(픽스처 디렉터리 사용).
- 단위: `check-csp.mjs`가 `'unsafe-inline'` 포함, `wasm-unsafe-eval` 누락, 미검증 출처 포함을 FAIL로 보고.
- 단위: `check-config.mjs`가 `available_bibles`에 `niv`, 검증된 제공자의 자리표시자를 FAIL로 보고.
- E2E: 360px, 390px에서 셸이 열리고 가로 스크롤 없음(`document.documentElement.scrollWidth <= clientWidth`).
- E2E: 서비스 워커 등록 후 `context.setOffline(true)`, 새로고침해도 셸이 표시됨.
- 네트워크: 셸 로딩 중 같은 출처 외 요청 0건.

## 검증 게이트
- 자동:
  - `scripts/verify.sh quick`, `scripts/verify.sh full` PASS (미대상은 SKIP으로 표시)
  - 오프라인 새로고침 E2E 통과
  - `dist/index.html`이 `check-csp.mjs` 통과
  - **정적 점검 동작 확인**: sermon-verify §3의 각 점검마다 위반 한 줄(예: `src/core/bible/x.ts`에 `import '../llm'`, `src/ui`에 `localStorage`, `console.log`, `https://` 문자열, 한글 문자열, `ko.json`에 "유머", `extractable: true`, `package.json`에 `express`)을 임시로 넣어 `verify.sh quick`이 해당 항목 FAIL을 내는지 확인 후 원복. 결과를 검증 기록에 표로 남긴다.
  - ESLint 경계 규칙도 같은 방식으로 FAIL 확인 후 원복
- 수동:
  - [ ] Android Chrome에서 "홈 화면에 추가" 설치 후 비행기 모드로 실행 시 셸 표시
  - [ ] iOS Safari에서 "홈 화면에 추가" 설치 후 비행기 모드로 실행 시 셸 표시
  - [ ] 두 브라우저 개발자 도구 콘솔에 CSP 위반 경고 없음

## 완료 정의
- [x] `npm run dev/build/lint/test/test:e2e/test:network` 스크립트가 존재하고 동작
- [x] `scripts/verify.sh quick|full`이 PASS/FAIL/SKIP을 구분해 보고
- [x] 정적 점검·ESLint 규칙이 위반을 실제로 잡는 것을 확인
- [x] CSP가 `dist`에 반영되고 외부 요청 0건
- [x] 오프라인에서 빈 화면이 열림
- [x] `config/app.config.json` 스키마 검증 통과, 값은 자리표시자 유지
- [x] `docs/PROVIDERS.md` 골격 존재

## 검증 기록

### 2026-11-04
- 자동: `scripts/verify.sh quick` → PASS. `scripts/verify.sh full` → FAIL (network, e2e) — **webkit-mobile 프로젝트만** 브라우저 실행 실패(호스트 라이브러리 없음: libWPEWebKit 의존 libflite, libavif16, gstreamer 계열). chromium-mobile은 E2E 5개, 네트워크 1개 모두 통과.
  - 단위 26개 통과. 커버리지 core 0/0(아직 core 코드 없음, 임계값 판정 대상 없음).
  - build, dist 점검(원격 리소스·추적기·키 문자열·txt 없음), dist CSP, config 통과. verify:db SKIP(S01 전).
- 단계 게이트 — 정적 점검·ESLint 위반 주입 확인(각각 넣고 `verify.sh quick` 실행 후 원복, 원복 후 PASS):

| 위반 | FAIL 게이트 |
|---|---|
| core/bible에서 `../llm` import | lint, static:no-llm-import (처음엔 lint만 잡음 → grep 패턴을 `import '...'` 형태까지 넓힘) |
| core/sermon에서 `../generate` import | lint, static:no-llm-import |
| core/store에서 동적 `import('../../core/generate/x')` | lint, static:no-llm-import |
| src/ui `localStorage` | lint, static:no-web-storage |
| src/app `console.log` | lint, static:no-console |
| src 안 `https://` 문자열 | static:no-url-in-src |
| src/app 한글 하드코딩 | static:no-hangul-in-ui |
| ko.json 값에 "유머" | lint(check-i18n) |
| `extractable: true` | static:no-extractable-key |
| package.json `express` | static:no-server-deps |
| `innerHTML` 대입 | lint, static:no-innerHTML |
| `onMouseEnter` | static:no-desktop-events |
| CSS `font-size: 14px` | static:font-size-rem |
| available_bibles에 `niv` | static:config-bibles, unit(check-config) |
| src/app `indexedDB` 직접 사용 | lint |

- 발견해 고친 것: `check-csp.mjs`가 (1) 정책 안의 `'`에서 속성값을 끊고 (2) Vite가 쓰는 `&#39;` 엔티티를 풀지 않아 실제 dist를 잘못 판정 → 따옴표 짝 맞춤과 엔티티 해제, 테스트 추가.
- 의존성 추가(모두 S00 골격용): react, react-dom — UI / vite, @vitejs/plugin-react — 빌드 / vite-plugin-pwa — 서비스 워커 사전 캐시 / typescript 6.0 — typescript-eslint 지원 범위 / vitest, @vitest/coverage-v8, jsdom — 단위 테스트 / @playwright/test — 모바일 E2E·네트워크 / eslint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks, globals — 규칙 강제 / ajv — config 스키마 검사 / @types/* — 타입.
- `npm audit --omit=dev`: 0건. 개발 의존성(workbox-build 하위 glob, minimatch 등)에 moderate 18, low 2 — 배포 산출물에 들어가지 않음.
- Node: 공식 배포본 v22.23.4를 SHASUMS256 대조 후 `~/.local/node/22`에 설치(시스템 Node 18 유지). 실행 시 `PATH=$HOME/.local/node/22/bin:$PATH`.
- 설계 변경: 2026-11-04 v0.9 (크기 단위 px, 3.16 글자 크기 조정) — S00 범위에는 rem 정적 점검과 16px E2E만 반영.
- 재실행(사용자가 WebKit 호스트 의존성 설치 후): `scripts/verify.sh full` → **PASS** (단위 26개, E2E 10개 = 5개 × chromium-mobile·webkit-mobile, 네트워크 2개, 커버리지 core 0/0, verify:db SKIP).
  - 오프라인 새로고침 E2E, dist CSP(`check-csp.mjs`), 외부 요청 0건 — 두 브라우저 모두 통과.
- 수동: 보류 → backlog MV-S00 (3항목)
- 후속: 앱 이름("말씀 묵상 / Scripture Meditation")은 임시값, 확정되면 i18n·manifest·index.html 수정. 아이콘은 임시 단색 도형.
