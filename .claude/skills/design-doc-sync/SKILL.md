---
name: design-doc-sync
description: Keep docs/DESIGN.md in sync with implementation decisions — get user confirmation first, edit the relevant section, append a row to the change log (section 13), and manage open questions (section 12) without renumbering. Also keeps CLAUDE.md, docs/spec step docs, and skills consistent with the change. Use when implementation diverges from the design, an open question gets answered, or the user asks "설계 문서 갱신", "열린 질문 정리", "변경 이력 추가", "update design doc".
---

# 설계 문서 동기화

## 1. 언제 쓰나
- 모든 단계. 특히 단계 문서의 "착수 전 확정" 항목을 사용자가 결정했을 때, 구현 중 설계와 현실(DB 스키마, 제공자 정책, 라이브러리 동작)이 다를 때.

## 2. 기준 문서
- `docs/DESIGN.md` 12장(열린 질문), 13장(변경 이력), 머리말 버전 줄.
- `docs/spec/README.md` 원칙 A2·A3.

## 3. 규칙
- **설계를 바꾸는 결정은 사용자에게 먼저 확인한다.** 확인 없이 DESIGN.md 본문을 바꾸지 않는다.
- 오기·링크·번호 같은 의미 없는 수정도 변경 이력에 남긴다(한 줄).
- CLAUDE.md와 DESIGN.md가 충돌하면 작업을 멈추고 묻는다(CLAUDE.md 머리말).

## 4. 절차

### 4.1 사용자 확인
- 질문은 선택지와 추천안, 영향(어느 단계·모듈·테스트가 바뀌는지)을 함께 제시한다.
- 답을 받으면 같은 대화 안에서 4.2~4.4를 한 번에 반영한다.

### 4.2 본문 수정
- 해당 절을 고친다. 결정 근거가 사용자 결정이면 본문에 "(사용자 결정, YYYY-MM-DD)"를 붙이지 않아도 되지만 변경 이력에는 반드시 쓴다.
- 의미가 바뀌는 수정이면 머리말 버전을 올린다(v0.8 → v0.9). 버전을 올릴 때는 머리말에 `> v0.9 변경: …` 요약 줄을 맨 위에 추가한다. 오기 수정만이면 버전을 올리지 않는다.

### 4.3 변경 이력 (13장) 형식
```
| 날짜 | 버전 | 변경 내용 | 이유 |
|---|---|---|---|
| 2026-11-03 | v0.8 | 3.1.1 다중 블록 선택 정의 | "떨어진 절" 정의 없음 (사용자 결정) |
```
- 날짜는 절대 날짜(YYYY-MM-DD). 변경 내용에는 절 번호를 쓴다. 이유에 근거(사용자 결정, 공식 문서 URL과 확인 날짜, 실측 결과)를 쓴다.
- 행은 아래로 추가한다. 기존 행을 고치지 않는다.

### 4.4 열린 질문 (12장) 관리
- 번호를 다시 매기지 않는다. 새 질문은 마지막 번호 다음에 추가한다.
- 제안값이 있으면 "제안: …"과 "(SXX 착수 전 확정)"을 붙인다.
- 해결되면 질문을 지우지 않고 앞에 표시한다:
  `15. ~~원고 마스킹의 MVP 범위~~ — 해결됨(2026-11-10, 3.9)`
  그리고 결정 내용은 본문 절에 반영한다.
- 보류는 `— 보류(사유, 재검토 시점)`.

### 4.5 연쇄 갱신 확인
- [ ] `CLAUDE.md`의 해당 규칙, 4장 개발 규칙, 6장 config 예시
- [ ] `config/app.config.json` 키·값(있으면)
- [ ] 영향받는 `docs/spec/steps/SXX-*.md`의 범위·테스트·게이트, `docs/spec/README.md` 상태 표(단계 추가·순서 변경 시)
- [ ] 관련 `.claude/skills/*/SKILL.md`
- [ ] `sermon-verify`의 정적 점검과 `scripts/verify.sh`가 같은 내용인지
- 단계 문서의 검증 기록 "설계 변경" 항목에 변경 이력 행을 그대로 인용한다.

## 5. 확인 항목
- [ ] 13장 새 행의 날짜·버전·절 번호
- [ ] 12장 번호 유지, 해결 표기
- [ ] 머리말 버전과 13장 마지막 행 버전 일치
- [ ] CLAUDE.md의 설계 버전 참조(`docs/DESIGN.md`(v0.x))가 최신

## 6. 작업 후 확인
- 문서만 바뀌었으면 `scripts/verify.sh quick`(정적 점검이 문서 경로를 읽는 경우 대비). config가 바뀌었으면 `full`의 `check-config.mjs`.
