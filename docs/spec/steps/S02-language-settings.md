# S02. 저장소 기반, 언어와 역본 설정, 글자 크기, 홈·설정 골격, 마법사 1~3

| 항목 | 값 |
|------|----|
| 선행 | S01 |
| DESIGN 참조 | 3.0, 3.12, 3.13(1~3단계, 원칙), 3.16, 4.1(`settings`, 버전 관리), 8장(홈 오늘의 본문) |
| 모듈 | `core/store`, `src/i18n`, `src/ui/setup-wizard`, `src/app` |
| 관련 스킬 | `setup-wizard` |

## 목표
IndexedDB 래퍼와 `settings` 스토어를 만들고, UI 언어·역본 설정과 마법사 앞 3단계(건너뛰기 포함)를 구현한다. 이후 단계의 화면이 들어갈 홈과 설정 골격을 둔다.

## 착수 전 확정
- ~~IndexedDB 래퍼~~ — 확정(2026-11-04): 직접 구현(얇은 Promise 래퍼), 테스트는 fake-indexeddb(dev).
- ~~스토어 버전 관리~~ — 확정(2026-11-04): 순차 `MIGRATIONS` 배열(DESIGN 4.1). 이후 단계는 배열 끝에 덧붙이기만 한다.
- ~~3단계 "AI 기능도 사용하기"~~ — 확정(2026-11-04): S08 전에는 "준비 중" 안내 후 홈(`wizard_state = skipped`), S08 이후 검증된 제공자가 0개면 숨김(DESIGN 3.13).
- ~~오늘의 본문 목록~~ — 확정(2026-11-04): `config.home.daily_verses` 참조 31개, 기기 날짜로 순환(DESIGN 8장).
- ~~크기 단위~~ — 확정(2026-11-04): CSS px, 기본 16px, 글자 크기 조정 기능(DESIGN 3.16).

## 범위
- **In**: `core/store`(열기, 버전 업그레이드, get/put/delete/transaction), `settings` 스토어, 언어 전환(즉시 반영), 언어별 기본 역본과 "직접 선택" 유지, 글자 크기 조정(3.16), 첫 실행 기기 언어 추천, 홈 화면 골격(오늘의 본문, 검색창, 내 설교 진입 자리), 설정 화면 골격(마법사 다시 열기, 언어, 글자 크기, 기본 역본, 출처 표기), 마법사 1~3단계와 건너뛰기, 마법사 완료/건너뜀 기록.
- **Out**: 마법사 4~9단계(S08), 다른 스토어(S04 이후), 가져온 역본 목록(S11), 백업(S06).

## 산출물
```
src/core/store/db.ts            # openDb, 버전 업그레이드
src/core/store/settings.ts      # getSetting, setSetting (타입 있는 키)
src/app/font-size.ts            # 루트 글자 크기 적용 (rem 기준)
src/core/store/index.ts
src/i18n/index.ts               # 언어 상태 → settings 연동
src/app/home/
src/app/settings/
src/ui/setup-wizard/            # WizardShell, StepLanguage, StepBible, StepLlmChoice
tests/unit/store/settings.test.ts
tests/unit/i18n/language.test.ts
tests/e2e/language.spec.ts
tests/e2e/wizard-skip.spec.ts
tests/e2e/font-size.spec.ts
```

## 설계 상세
- `settings` 키: `ui_language`, `bible_id`, `bible_user_chosen`(bool), `wizard_state`(`not_started|skipped|done`), `wizard_step`, `font_size_px`(`config.ui.font_size_px.options` 중 하나, 기본 16). 키, 원고, 개인정보를 넣지 않는다.
- **언어 전환**: 화면 문자열, 노출 이름(3.0), 이후 페르소나 라벨이 다시 그려진다. 새로고침 없이 반영. 사용자 데이터는 변경하지 않는다.
- **역본 규칙**: 언어를 바꾸면 `bible_user_chosen == false`일 때만 기본 역본(`config.i18n.default_bible`)으로 바꾼다. 설정에서 역본을 직접 고르면 `bible_user_chosen = true`. 마법사 2단계에서 기본값을 그대로 "확인"한 것은 직접 선택으로 보지 않고, 다른 역본을 고른 경우만 직접 선택으로 기록한다.
- **첫 실행**: `navigator.language`가 `ko`로 시작하면 한국어, 아니면 English를 미리 선택(추천일 뿐 사용자가 바꿀 수 있음).
- **마법사**: 단계 목록은 `config.wizard.steps`에서 읽는다. 한 화면에 한 행동. 모든 화면에 "건너뛰기"가 있고, 건너뛰면 `wizard_state = skipped`로 홈으로 간다. 3단계에서 "AI 기능도 사용하기"를 고르면 S08 전까지는 "준비 중" 안내 화면을 보여주고 완료 처리 없이 홈으로 이동한다(독립 기능 사용 가능). 마법사 글자 16px 이상, 버튼 라벨은 짧은 동사.
- **글자 크기**: 설정에서 기본/크게/더 크게/아주 크게(16/18/20/22px, config 값) 중 고른다. `document.documentElement.style.fontSize`만 바꾸고 모든 글자 크기는 `rem`으로 쓴다(`px` 글자 크기 금지 — 스타일 점검으로 확인). 미리보기 문장 표시, 즉시 반영, 새로고침 후 유지. options 밖 값은 기본값으로 되돌린다.
- 마법사는 외부 링크를 열거나 요청하지 않는다(1~3단계에는 링크 없음).

## 테스트 요구사항
- 단위: `settings` 저장·조회·재열기 후 유지(fake-indexeddb), 스토어 버전 업그레이드 시 기존 값 유지.
- 단위: 역본 규칙 표 — (ko→en, 직접 선택 없음) → kjv / (ko→en, 직접 선택 kjv… 예: krv 직접 선택) → krv 유지 / 마법사 기본값 확인은 직접 선택 아님.
- 단위: 기기 언어 `ko-KR` → ko, `en-US`·`ja-JP` → en.
- E2E: 언어 전환 즉시 화면 문자열 변경(새로고침 없음), 새로고침 후 유지.
- E2E: 첫 실행 → 1단계에서 건너뛰기 → 홈 → 뷰어·검색 동작. 각 단계(1, 2, 3)에서 건너뛰기 가능.
- E2E: 3단계 "AI 기능도 사용하기" → 준비 중 안내 → 홈, 독립 기능 동작.
- E2E: 설정에서 "마법사 다시 열기" 동작.
- 단위: 글자 크기 설정 저장·조회, options 밖 값(예: 12, 30) → 16.
- E2E: 마법사·홈 본문 글자의 계산된 `font-size` ≥ 16px, 버튼 44×44px 이상, 360/390px 가로 스크롤 없음.
- E2E: 설정에서 22px 선택 → 새로고침 없이 본문 계산 크기 22px, 새로고침 후 유지, 22px 상태로 홈·설정·마법사 1~3에서 360px 가로 스크롤 없음과 버튼 44×44px 이상.
- 네트워크: 마법사 1~3과 설정 화면에서 같은 출처 외 요청 0건.

## 검증 게이트
- 자동:
  - 위 단위·E2E·네트워크 테스트 통과
  - `check-i18n.mjs`: 추가된 키가 ko/en 모두 존재
  - UI 코드가 IndexedDB를 직접 쓰지 않음(ESLint 경계)
  - `src/**/*.css`, `*.tsx`에 `font-size: NNpx` 없음(정적 점검, rem만 허용)
- 수동:
  - [ ] 실기기에서 마법사 글자 크기와 버튼이 고령 사용자에게 읽기 쉬운지 확인
  - [ ] 실기기에서 "아주 크게"(22px)로 바꾼 뒤 홈·뷰어·설정·마법사가 잘리거나 겹치지 않는지 확인
  - [ ] iOS VoiceOver, Android TalkBack으로 마법사 1~3단계와 건너뛰기를 끝까지 진행 가능
  - [ ] 기기 언어 한국어/영어 각각에서 첫 실행 추천 언어 확인

## 완료 정의
- [x] `core/store`와 `settings` 스토어, 버전 업그레이드 규칙 문서화
- [x] 언어 전환 즉시 반영, 사용자 데이터 불변
- [x] 역본 직접 선택 유지 규칙 구현과 테스트
- [x] 글자 크기 4단계 즉시 반영·유지, 최대 크기에서도 가로 스크롤 없음
- [x] 마법사 1~3단계, 모든 단계에서 건너뛰기 가능, 건너뛰어도 독립 기능 동작
- [x] 홈·설정 골격과 출처 표기

## 검증 기록

### 2026-11-04
- 자동: scripts/verify.sh full → PASS (단위 166개, E2E 60개(30×2 뷰포트), 네트워크 8개(4×2), 커버리지 core 90.59% lines — bible 93.12%, store 85.91%, verify:db PASS)
- 단계 게이트:
  - 단위: `tests/unit/store/settings.test.ts`(fake-indexeddb 저장·재열기 유지, v1→v2 업그레이드 시 기존 값 유지, 예외 시 트랜잭션 롤백), `tests/unit/i18n/language.test.ts`(기기 언어 추천, 역본 규칙 표, 마법사 기본값 확인은 직접 선택 아님, 글자 크기 12·17·30 → 16, `dailyIndex`), `tests/unit/app/home-and-router.test.ts`(`home.daily_verses` 31개 모두 krv·kjv에서 조회 가능) 통과
  - E2E: `language.spec.ts`(en-US 첫 실행 추천, 마법사·설정 언어 즉시 전환, 새로고침 후 유지, 직접 고른 역본 유지), `wizard-skip.spec.ts`(1·2·3단계 건너뛰기 → 홈·검색·뷰어 동작, "AI 기능도 사용하기" → 준비 중 → 홈, 이전 단계 복귀, 설정에서 다시 열기, 마법사·홈 글자 16px 이상, 44px 이상, 가로 스크롤 없음), `font-size.spec.ts`(22px 즉시 반영·새로고침 후 유지, 22px에서 홈·설정·뷰어·마법사 가로 스크롤 없음과 44px 이상) 통과
  - 네트워크: 마법사 1~3, 준비 중 화면, 홈, 설정(언어·글자 크기 변경, 마법사 다시 열기)에서 같은 출처 외 요청 0건
  - `check-i18n`: ko/en 키 일치 OK. ESLint 경계(UI의 IndexedDB 직접 사용 금지) PASS. `static:font-size-rem` PASS
- 착수 전 확정: IndexedDB 직접 구현(fake-indexeddb 테스트), 순차 `MIGRATIONS` 배열, 3단계 "AI 기능도 사용하기"는 S08 전까지 준비 중 안내 후 `wizard_state=skipped`, 오늘의 본문은 `config.home.daily_verses` 31개를 기기 날짜로 순환(모두 사용자 결정)
- 수동: 보류 → backlog MV-S02 (4항목)
- 의존성 추가: fake-indexeddb 6.2.7(dev) — Node에서 IndexedDB 단위 테스트
- 설계 변경: `| 2026-11-04 | v0.11 | 4.1 IndexedDB 버전 관리 규칙(순차 `MIGRATIONS`, 직접 구현), 3.13 3단계 "AI 기능도 사용하기"의 S08 전후 처리, 8장 오늘의 본문 목록(`home.daily_verses`)과 순환 규칙 | … |`
- 구현 메모:
  - 마법사 1~3단계는 단계별 파일 대신 `src/ui/setup-wizard/SetupWizard.tsx` 하나에 두었다. S08에서 4~9단계를 붙일 때 단계별 컴포넌트로 나눈다
  - 라우팅은 해시 방식(`#/`, `#/read?ref=`, `#/search?q=`, `#/settings`, `#/wizard`). 첫 실행(`wizard_state=not_started`)에서 홈으로 들어오면 마법사로 보내고, 딥 링크는 그대로 연다
  - IndexedDB를 쓸 수 없는 환경(사생활 모드 등)에서는 설정을 메모리에만 두고 앱은 계속 동작한다
  - 언어·역본·글자 크기 선택은 네이티브 라디오/셀렉트 대신 `aria-pressed` 토글 버튼 묶음(`src/ui/ChoiceGroup.tsx`)으로 만들었다(WebKit CSP 문제 회피, 44px 확보)
  - 16px 하한 점검에서 선택지 설명(15px)과 홈 절 번호(12px 위첨자)가 걸려 둘 다 1rem으로 올렸다
  - Playwright 기본 locale을 `ko-KR`로 고정했다(언어 테스트만 `en-US`로 덮어씀). 기존 뷰어·네트워크 테스트는 첫 실행 마법사를 피하려고 `/#/read`로 바로 연다
- 후속:
  - S08: 3단계 "AI 기능도 사용하기"를 4단계 연결로 바꾸고, 검증된 제공자가 0개면 숨김
  - `core/store/db.ts`의 `getDb()`·`versionchange` 경로는 E2E로만 지나감(단위 커버리지 76%)

