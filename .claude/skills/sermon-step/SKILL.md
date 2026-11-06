---
name: sermon-step
description: Workflow for implementing one step (S00–S11) of the Bible meditation PWA spec in docs/spec/steps/. Use when the user asks to implement, continue, resume, or check a step — e.g. "S03 구현해줘", "다음 단계 진행", "S05 이어서", "implement step S08", "what's the next step". Enforces prerequisite checks, pre-start decisions, scope limits, verification gates, and status/record updates.
---

# 단계 구현 절차

한 번에 **한 단계**만 진행한다. 단계 문서(`docs/spec/steps/SXX-*.md`)가 범위, 산출물, 테스트, 게이트의 단일 기준이다.

## 1. 착수 전 확인

1. `docs/spec/README.md` 상태 표에서 대상 단계를 정한다. 사용자가 지정하지 않았으면 선행이 모두 `DONE`인 가장 앞의 `TODO`를 제안한다.
2. **선행 단계가 모두 `DONE`인지** 확인한다. 아니면 멈추고 알린다. 임의로 건너뛰지 않는다.
3. 다음을 읽는다.
   - 대상 단계 문서 전체
   - 단계 문서가 참조하는 `docs/DESIGN.md`의 절
   - 머리 표의 "관련 스킬" 전부
   - `CLAUDE.md` 2장(절대 규칙)과 9장(금지 사항)
4. 단계 문서의 **"착수 전 확정"** 항목이 열려 있으면 사용자에게 묻는다. 답을 받으면 `design-doc-sync` 절차로 DESIGN.md(열린 질문 → 본문, 변경 이력)에 반영한다.
5. 외부 사실(엔드포인트, 모델명, 라이선스, 릴리스 해시, 라이브러리 API)이 필요하면 공식 출처를 확인한다. 기억으로 채우지 않는다.
6. 상태 표에서 대상 단계를 `IN_PROGRESS`로 바꾼다.

## 2. 계획

- 단계 문서의 "산출물"을 기준으로 작업 목록을 만든다. 목록에 없는 파일이 필요하면 이유를 사용자에게 짧게 알린다.
- "범위 Out"은 구현하지 않는다. 필요해 보이면 후속 단계 문서의 메모로 남긴다.
- 의존성을 추가할 때는 단계 문서 검증 기록에 이유를 한 줄로 남긴다. 서버 패키지(express, fastify, koa, 서버리스 런타임 등)는 추가하지 않는다.
- 설계와 현실이 다르면(라이브러리 동작, 실제 DB 스키마, 제공자 정책) 구현하지 말고 사용자에게 보고한다. 확인을 받으면 DESIGN.md를 먼저 고친다.

## 3. 구현 순서

1. 타입과 계약(인터페이스, 스키마, config 키)
2. 실패하는 테스트: 단계 문서 "테스트 요구사항"을 항목별로
3. 구현 → 테스트 통과
4. 화면 연결(문자열은 `src/i18n/ko.json`, `en.json`에만)
5. 작은 단위마다 `scripts/verify.sh quick`

## 4. 검증 (`sermon-verify` 스킬)

- `scripts/verify.sh full`과 단계 문서의 **자동 게이트**를 전부 실행해 PASS를 확인한다. 이것이 단계 완료의 유일한 조건이다(spec README A5).
- **수동 게이트**는 실행이나 수행 요청을 하지 않고, 마무리 때 backlog로 옮긴다. 사용자가 명시적으로 수동 검증을 요청하면 그때 진행한다.
- 실패하면 원인을 고치고 다시 실행한다. 테스트 삭제, skip, 임계값 하향으로 통과시키지 않는다.

## 5. 마무리

1. 단계 문서 맨 아래 "검증 기록"에 다음 형식으로 쓴다.
   ```
   ### YYYY-MM-DD
   - 자동: scripts/verify.sh full → PASS (단위 N개, E2E N개, 네트워크 N개, 커버리지 core NN%)
   - 단계 게이트: (항목별 결과)
   - 수동: 보류 → backlog MV-SXX (N항목) | 없음
   - 의존성 추가: 패키지 — 이유
   - 설계 변경: (DESIGN.md 변경 이력 항목, 없으면 없음)
   - 후속: (남은 이슈)
   ```
2. 단계 문서의 "수동" 체크리스트를 `docs/spec/manual-verification-backlog.md`에 `## MV-SXX <단계 제목>` 절로 **원문 그대로** 추가한다.
3. 완료 정의 체크박스를 갱신한다.
4. 상태 표를 `DONE`으로 바꾸고, 수동 항목이 있었으면 수동 검증 열을 `보류`로 둔다.
5. 사용자에게 보고한다: 변경 파일, 실행한 게이트와 결과(실패도 그대로), backlog에 추가한 항목 수, 남은 이슈, 다음 단계.
6. 커밋은 사용자가 요청할 때만 한다. 메시지 접두사는 단계 ID다(`S04: ...`).
