---
name: setup-wizard
description: The 9-step setup wizard for non-technical pastors — language, bible, LLM choice (skippable), provider comparison cards (verified providers only), key issuance checklist, key paste with prefix hints, one-time verification with cause-specific failure messages, manuscript transfer consent, and done screen; plus "reconnect / delete key / change provider" in settings. Use when touching src/ui/setup-wizard, wizard i18n copy, wizard.steps config, or failure messages — e.g. "마법사 단계", "키 발급 안내 문구", "건너뛰기", "검증 실패 문구", "setup wizard".
---

# 설정 마법사

## 1. 언제 쓰나
- S02(마법사 골격, 1~3단계, 건너뛰기), S08(4~9단계, 키 검증, 설정의 "연결 다시 하기"·"키 삭제"·"제공자 바꾸기").
- 위치: `src/ui/setup-wizard/`(단계별 컴포넌트), 문구 `src/i18n/{ko,en}.json`의 `wizard.*`, 단계 목록 `config.wizard.steps`, 링크 `config.providers.*`(URL은 config에서만).

## 2. 기준 문서
- DESIGN 3.6, 3.12, 3.13(전체), 3.13.1~3.13.5, 열린 질문 9·10·11.

## 3. 규칙
- 규칙 18: 건너뛸 수 있고, 건너뛰어도 독립 기능 동작. 외부 링크는 사용자가 누를 때만. 키 검증은 버튼 1회.
- 규칙 19: 안내 문구는 i18n에서만. 발급 절차 문구는 제공자 공식 문서 확인 후에만 수정, 날짜를 `docs/PROVIDERS.md`에 기록.
- 규칙 20: `browser_direct_verified: true` 제공자만 선택 가능. `false`는 `unavailable_reason`을 적은 비활성 카드로만 표시(누를 수 없음). 미검증 제공자를 "추천"으로 표시 금지.
- 규칙 4: 키 입력·저장은 `key-vault-security`.
- CLAUDE 4.3: 한 화면 한 행동, 글자 16px 이상(`ui.font_size_px`, 사용자 글자 크기 설정 반영), 동사형 짧은 버튼, 터치 44px.

## 4. 상세

### 4.1 단계 흐름 (`wizard.steps`)
| # | id | 내용 | 다음 |
|---|---|---|---|
| 1 | language | ko/en, 기기 언어(`navigator.language`) 기본 선택 → `settings` 저장, 즉시 반영 | 2 |
| 2 | bible | 기본 역본 안내(ko=krv, en=kjv), 바꾸기 가능 | 3 |
| 3 | llm_choice | "지금은 건너뛰기" → 9(완료), "AI 기능도 사용하기" → 4 | 4 / 9 |
| 4 | provider | 비교 카드(`providers_order` 순서). 검증된 제공자만 선택 가능하다. 미검증 제공자는 비활성 카드로 보인다(`pending_verification` = 확인 중, `no_browser_access` = 앱에서 바로 호출하는 방식 미제공). 추천 표시는 `beginner_recommendation`(현재 anthropic)이 verified일 때만 붙인다. 모델 선택은 `providers.<id>.models`에서 하고 기본값은 `model`이다(DESIGN 3.6 v0.15) | 5 |
| 5 | get_key | 3.13.1 번호 체크리스트, 각 항목 완료 체크, 외부 링크 버튼(사용자 탭 시 `window.open`/`<a target=_blank rel="noopener noreferrer">`) | 6 |
| 6 | paste_key | 붙여넣기 칸, 접두사 힌트(`key_format_hints`), 형식 불일치 시 호출 전 안내 | 7 |
| 7 | verify | "확인" 버튼 → `validateKey()` 1회, 성공/실패 원인별 안내 | 8 / 6 |
| 8 | consent | 원고 전송 동의 별도 체크, 기본 "보내지 않음", Gemini 무료 티어 문구 | 9 |
| 9 | done | 백업 권장(암호 분실 시 복구 불가), 독립 기능 바로가기 | - |
- 모든 단계에 "건너뛰기"(마법사 종료) 버튼. 종료 시 `settings.wizard_state = 'skipped'`, 3단계 "지금은 건너뛰기"나 9단계 완료는 `'done'`. 설정에서 다시 열기.
- 3단계 "AI 기능도 사용하기": S08 전에는 "준비 중" 안내 후 홈(`wizard_state = 'skipped'`). S08 이후 검증된 제공자가 0개면 이 선택지를 숨긴다(DESIGN 3.13, 2026-11-04 결정).
- 열린 질문 11(검증 실패 후 자동 독립 모드 전환 여부)은 S08 착수 전 사용자 확인.

### 4.2 비교 카드 항목 (i18n 키 `wizard.provider.<id>.*`)
- 시작 비용, 입력 데이터 사용, 구독과의 관계, 키 접두사, 추천 대상(DESIGN 3.13 표). 금액은 쓰지 않고 "요금은 바뀔 수 있으니 제공자 요금 페이지를 확인하세요" + 링크(config). Gemini 무료 티어 데이터 사용 문구는 반드시 표시.

### 4.3 발급 절차 문구 (3.13.1)
- 문구는 DESIGN 3.13.1을 i18n으로 옮긴다. 화면 이름은 원문(영문)과 풀이를 함께: `"Get API key"(API 키 받기)`.
- 수정 전 공식 문서 확인 → `docs/PROVIDERS.md`의 "발급 안내 문구 확인" 날짜 갱신. 확인 없이 문구를 바꾸지 않는다.
- 공통 안내(키 공유 금지, 노출 시 삭제 후 교체, 링크는 사용자가 누를 때만) 포함.

### 4.4 실패 원인별 안내 (3.13.3, `LlmErrorKind` → 키)
| 원인 | i18n 키 | 다음 행동 버튼 |
|---|---|---|
| 형식 오류(호출 전) | `wizard.error.format` | 다시 붙여넣기 |
| auth | `wizard.error.auth` | 제공자 사이트 열기(사용자 탭) |
| billing | `wizard.error.billing` | 결제 메뉴 안내 |
| rate_limit | `wizard.error.rate_limit` | 나중에 다시 |
| region | `wizard.error.region` | 다른 제공자 선택 |
| network / timeout | `wizard.error.network` | 다시 시도 / 독립 기능 계속 |
| unknown | `wizard.error.unknown` = "연결에 실패했습니다. 키를 다시 확인해 주세요" | 다시 붙여넣기 |

### 4.5 쉬운 말
- 용어 처음 등장 시 한 줄 풀이: "연결 열쇠(API 키): AI 회사가 이 앱에 내주는 비밀번호 같은 문자열".
- 버튼은 동사로 짧게: "다음", "건너뛰기", "붙여넣기", "확인하기".

## 5. 테스트 시나리오
- [ ] 건너뛰기(1단계에서) → 홈, 본문·원고·구성표 동작
- [ ] 3단계 "건너뛰기" → 완료, LLM 버튼 잠금
- [ ] 미검증 제공자는 비활성 카드(사유 표시, 선택 불가), 검증 0개면 "AI 기능" 선택지 숨김
- [ ] 형식 오류 → 호출 0, 안내 표시
- [ ] 검증 성공(모의) → 키 마스킹 표시, 8단계로
- [ ] 인증 실패, 네트워크 오류, 알 수 없는 오류(모의) → 각 문구
- [ ] "확인"을 누르기 전 네트워크 요청 0, 연타 시 1회만
- [ ] 외부 링크는 탭 전 요청 0(네트워크 테스트), 탭 시 새 창
- [ ] 동의 거절 → 원고 저장·검색·구성표 동작, 프로필 생성 잠금
- [ ] 언어 전환 즉시 문구 변경, 글자 16px 이상, 360px 가로 스크롤 없음

## 6. 작업 후 확인
- `sermon-verify`: i18n 키 일치, 화면 한글 하드코딩 점검, src URL 금지, `test:network`(마법사 진행 중 외부 요청 0), `check-config.mjs`(검증된 제공자만), E2E 360/390.
- 수동(backlog): 실제 키로 제공자별 검증 성공/실패, 실제 발급 화면과 안내 문구 일치.
