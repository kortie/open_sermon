---
name: sermon-verify
description: Run and report the verification gates for the Bible meditation PWA (scripts/verify.sh quick|full — typecheck, ESLint module boundaries, i18n key parity, Vitest unit + coverage, Playwright mobile E2E, offline/network-isolation tests, bible.sqlite hash, build, dist audit, static rule checks; manual device/real-key checks go to a backlog). Use before marking a step DONE, before committing, after any non-trivial change, or when the user asks "검증해줘", "테스트 돌려줘", "verify", "is this ready".
---

# 검증 게이트

## 1. 게이트 구성

| 명령 | 내용 | 언제 |
|---|---|---|
| `scripts/verify.sh quick` | `tsc --noEmit`, `npm run lint`(모듈 경계, i18n 키 일치 포함), `npm run test`(Vitest 단위), §3 정적 점검 | 작은 변경마다, 커밋 전 |
| `scripts/verify.sh full` | quick + 커버리지 임계값 + `npm run test:network` + `npm run test:e2e` + `npm run verify:db`(S01 DONE 이후 DB 파일이 없으면 FAIL, `npm run db:build`로 생성) + `npm run build` + §4 산출물 점검 + §5 설정 점검 | 단계 완료 전 필수 |

- 마지막 줄에 `VERIFY <quick|full>: PASS` 또는 `VERIFY <quick|full>: FAIL (<실패 게이트 목록>)`을 출력한다.
- 아직 없는 대상(해당 단계 전의 디렉터리, 빈 E2E 목록)은 **건너뛰고 SKIP으로 표시**한다. SKIP은 FAIL이 아니지만 보고에 그대로 쓴다.
- `scripts/verify.sh`가 없으면 S00이 끝나지 않은 것이다. 사용자에게 알리고 S00부터 진행한다.

### 1.1 테스트 환경
- 단위: Vitest + jsdom, IndexedDB는 `fake-indexeddb`, 암호화는 Node의 WebCrypto(`globalThis.crypto.subtle`).
- E2E: Playwright, 프로젝트 2개(Chromium 모바일 에뮬레이션 360×800 `hasTouch`, WebKit iPhone 계열 390×844). 롱터치는 터치 이벤트를 직접 보내 재현한다.
- 네트워크: Playwright에서 `page.route('**/*')`로 같은 출처 외 요청을 모두 기록하고 차단한다.
- LLM: 실제 제공자를 호출하지 않는다. `fetch` 모의 객체로 성공, 401/403, 402/결제 필요, 429, 지역 제한, 타임아웃, 네트워크 오류를 주입한다.

### 1.2 커버리지 임계값 (full)
- `src/core/**` 줄 커버리지 80% 이상. 단, `core/vault`, `core/validate`, `core/bible`의 참조 파서, `core/selection`은 90% 이상. `core/backup`은 폴더 단위 80% 이상(S06 게이트). `core/llm`은 폴더 단위 80% 이상(S08 게이트). `core/generate`는 폴더 단위 80% 이상(S09 게이트). `core/bible-import`는 폴더 단위 80% 이상(S11 게이트).
- 임계값은 `vitest.config.ts`에 두고, 이 표와 같게 유지한다. 낮추려면 사용자 승인을 받는다.

## 2. 실행 규칙

- 출력이 길면 실패 부분만 추려 보고하되, 마지막 `VERIFY ...` 줄은 그대로 인용한다.
- 실패를 통과로 바꾸려고 테스트 삭제, `.skip`/`.only`, 린트 무시 주석 추가, 임계값 하향을 하지 않는다. 불가피하면 이유를 들어 사용자 승인을 받는다.
- flaky가 의심되면 3회 재실행 결과를 함께 보고하고 원인(실시간 타이머, 공유 상태, 애니메이션 대기)을 고친다. 롱터치 테스트는 가짜 타이머 또는 명시적 대기로 450ms를 다룬다.
- 수치(테스트 수, 커버리지, 산출물 크기)는 실제 출력에서 가져온다. 추정하지 않는다.

## 3. 정적 점검 (quick, full 공통)

`scripts/verify.sh`에 같은 내용으로 구현한다. 한쪽을 바꾸면 다른 쪽도 고친다. 없는 디렉터리는 건너뛴다. 각 줄의 괄호는 근거가 되는 CLAUDE.md 규칙 번호다.

```bash
# (3) 독립 모드 모듈이 llm/generate를 import하지 않는지 — ESLint no-restricted-imports와 이중 확인
grep -rnE "(from|import)\s*\(?\s*['\"]([^'\"]*/)?(llm|generate)(/[^'\"]*)?['\"]" src/core/{bible,bible-import,selection,sermon,compose,persona,validate,vault,backup,store} && echo FAIL || echo OK
# (9) HTML 삽입 금지
grep -rnE "dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML" src && echo FAIL || echo OK
# (4) 브라우저 평문 저장소 금지 (설정값도 IndexedDB settings 스토어 사용)
grep -rnE "\b(localStorage|sessionStorage)\b" src && echo FAIL || echo OK
# (8) 콘솔 출력 금지 (테스트 제외)
grep -rnE "\bconsole\.(log|info|debug|warn|error|trace)\(" src --include=*.ts --include=*.tsx && echo FAIL || echo OK
# (23) src 안 URL 금지 — 링크와 엔드포인트는 config에서만
grep -rnE "https?://" src --include=*.ts --include=*.tsx && echo FAIL || echo OK
# (16) 화면 코드의 한글 하드코딩 금지 (책 이름표·마스킹 패턴이 있는 core, prompts는 제외)
grep -rnP "[\x{AC00}-\x{D7A3}]" src/app src/ui --include=*.tsx --include=*.ts && echo FAIL || echo OK
# (14) 노출 금지 내부 용어 — scripts/check-i18n.mjs가 ko/en 값(키 제외)에서 검사 (§3.1)
# (4) 키 추출 가능 설정 금지
grep -rnE "extractable\s*:\s*true|generateKey\([^)]*,\s*true\s*," src && echo FAIL || echo OK
# (1) 서버 패키지 금지
grep -nE "\"(express|fastify|koa|@hapi/hapi|hono|@vercel/node|@netlify/functions|firebase-functions|http-proxy|http-proxy-middleware)\"" package.json && echo FAIL || echo OK
# (13) 데스크톱 전용 이벤트 금지
grep -rnE "onMouseEnter|onMouseOver|onContextMenu=\{[^}]*\b(open|show)|shiftKey|:hover" src && echo FAIL || echo OK
# (DESIGN 3.16) 글자 크기는 rem만 — px 글자 크기 금지 (루트 크기 적용 코드는 대입식이라 걸리지 않음)
grep -rnE "font-size:\s*[0-9.]+px|fontSize:\s*['\"]?[0-9.]+px" src && echo FAIL || echo OK
# (17) NIV 등 권리 있는 역본 식별자가 번들/설정에 활성으로 들어가지 않았는지
node scripts/check-config.mjs --bibles || echo FAIL
```

- `onContextMenu`는 기본 메뉴를 막는 용도(`preventDefault`)만 허용한다.
- 오탐이 생기면 점검 패턴을 좁히고, 그 이유를 이 파일에 한 줄로 남긴다. 예외 주석으로 우회하지 않는다.

### 3.1 ESLint로 강제하는 규칙 (`npm run lint`)
- `no-restricted-imports`: 독립 모드 모듈 → `core/llm`, `core/generate` 금지. UI(`src/app`, `src/ui`) → `idb`/IndexedDB 직접 사용 금지(`core/store`만).
- `react/no-danger`, `no-restricted-syntax`(innerHTML 대입), `no-console`.
- i18n 키 일치: `scripts/check-i18n.mjs` — `ko.json`과 `en.json`의 키 집합이 같고, 빈 값이 없고, 코드에서 쓰는 `t('...')` 키가 모두 존재하는지, 값에 내부 용어(규칙 14)가 없는지.

## 4. 산출물 점검 (full, `npm run build` 후 `dist/`)

```bash
# (2) 외부 리소스 로딩 금지: 원격 script/link/img/font
grep -rnoE "<(script|link|img)[^>]+(src|href)=\"https?://" dist && echo FAIL || echo OK
grep -rnoE "fonts\.(googleapis|gstatic)\.com|googletagmanager|google-analytics|sentry|datadog|mixpanel|amplitude" dist && echo FAIL || echo OK
# (2,4.2) CSP가 index.html에 있고 필수 지시어를 포함하는지
node scripts/check-csp.mjs dist/index.html || echo FAIL
# (6) 번들에 키 형태 문자열이 없는지
grep -rnoE "AIza[0-9A-Za-z_-]{30,}|sk-ant-[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z]{20,}" dist && echo FAIL || echo OK
# (12) 번들 데이터는 bible.sqlite 하나뿐인지 (txt 역본 파일 동봉 금지)
find dist -iname "*.txt" ! -name "robots.txt" | grep . && echo FAIL || echo OK
```

`check-csp.mjs` 기준: `default-src 'self'`, `script-src`는 `'self'`와 `'wasm-unsafe-eval'`만(`'unsafe-inline'`, `'unsafe-eval'` 금지), `worker-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `connect-src`는 `'self'`와 `browser_direct_verified: true`인 제공자 엔드포인트 출처만.

## 5. 설정 점검 (full, `scripts/check-config.mjs`)

- `config/app.config.json`이 스키마를 통과한다.
- `browser_direct_verified: true`인 제공자는 `endpoint`, `model`에 `<...>` 자리표시자가 없고, `docs/PROVIDERS.md`에 확인 날짜가 있는 절이 있다.
- `i18n.available_bibles`에 `excluded_bibles`(niv) 항목이 없다.
- `backup.pbkdf2_iterations`가 숫자이고 S06 확정값 600,000과 같다(OWASP, 확인 2026-11-05). 다른 숫자면 FAIL, 자리표시자는 S06 DONE 이후 FAIL.
- `config/bible-sources.json`(S11 이후): `download_url`이 있는 항목은 모두 `rights == "public_domain"`이고 `verified_on`이 날짜 형식이다.
- `bible_db.sha256`이 자리표시자가 아니다(S01 이후).

## 6. 수동 게이트 (보류)

- 단계 진행 중에는 수동 체크리스트를 실행하거나 요청하지 않는다. `docs/spec/manual-verification-backlog.md`로 옮겨졌는지만 확인한다.
- 사용자가 수동 검증을 요청하면 backlog 항목을 **원문 그대로** 제시하고, 항목별 결과(통과/실패/미수행과 사유)를 받아 기록한다.
- 실제 API 키를 쓰는 항목 전 안내 1줄: "실제 요금이 청구될 수 있습니다. 지출 한도를 설정한 키로 진행하세요."

## 7. 보고 형식

```
## 검증 결과 — SXX
- quick: PASS
- full: FAIL — test:e2e 1 failed
  - `long-press 450ms enters selection mode (webkit)` — expected aria-pressed=true, got false
- SKIP: test:network (S00 시점 독립 흐름 없음)
- 커버리지: core 84.2% (vault 93.1%, validate n/a)
- 수동: 보류 → backlog MV-SXX (N항목)
```
