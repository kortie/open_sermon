---
name: persona-builder
description: Persona options, allowed-value validation, and conversion of a saved persona into a prompt block (denomination as "tradition tendency" only, no real pastor names, no free text). Use when touching src/core/persona, the persona settings screen, option labels in i18n, or the persona block in prompts — e.g. "페르소나 선택지", "교단 옵션", "persona block", "실존 인물 이름 검사".
---

# 페르소나

## 1. 언제 쓰나
- S05(선택지, 검증, 저장, 블록 조합 — LLM 없이 동작). S09에서 프롬프트에 블록 사용.
- 위치: `src/core/persona/`, 선택지 라벨은 `src/i18n/{ko,en}.json`, 블록 템플릿은 `src/prompts/{ko,en}/persona-block.*`.

## 2. 기준 문서
- DESIGN 3.8, 3.12(언어 전환 시 선택지 라벨 즉시 변경), 4.1(`persona`), 6.1, 7.1(실존 인물 패턴), 열린 질문 16(길이).

## 3. 규칙
- 규칙 11: 실존 목회자 이름을 페르소나나 프롬프트에 넣지 않는다. 교단은 "전통 경향" 수준.
- 자유 입력을 받지 않는다(이름 필드 제외 — 4.3). 허용되지 않은 값은 거부한다.
- 규칙 16: 라벨은 i18n에서. 저장값은 언어 독립 코드.

## 4. 상세

### 4.1 허용값 (코드 → i18n 키 `persona.<field>.<code>`)
| 필드 | 형식 | 허용 코드 |
|---|---|---|
| denomination | 1개 | `presbyterian`, `methodist`, `baptist`, `holiness_pentecostal`, `nondenominational_other` |
| emphasis | 1개 이상 | `grace`, `covenant`, `practice`, `mission`, `holy_spirit`, `meditation`, `community` |
| style | 1개 | `expository`, `topical`, `narrative` |
| tone | 1개 | `exhortation`, `explanatory`, `concise_firm` |
| audience | 1개 | `individual`, `small_group`, `young_adult`, `adult` |
| length | 1개 | `1000` 고정(DESIGN 3.8, 2026-11-05 확정). 초안 본문만 세고 덧붙이는 예시·한마디는 제외 |
- 열린 질문 16 제안: MVP는 1000자 하나로 고정, 글자 수는 공백 포함 그래핌 수. **S05 착수 전 사용자 확인**.

### 4.2 타입과 검증
```ts
export interface Persona { id: string; name: string; denomination: Denomination; emphasis: Emphasis[];
  style: Style; tone: Tone; audience: Audience; length: LengthCode }
export function validatePersona(input: unknown): { ok: true; persona: Persona } | { ok: false; errors: string[] };
export function buildPersonaBlock(p: Persona, lang: 'ko' | 'en'): string;
```
- `emphasis`는 중복 제거, 빈 배열 거부. 알 수 없는 코드 → 오류(무시하지 않음).
- 저장된 페르소나를 읽을 때도 검증한다(구버전 값 방어).

### 4.3 이름 필드와 실존 인물 패턴 검사
- 페르소나 `name`은 사용자가 구분용으로 붙이는 라벨(예: "주일 오전용"). 프롬프트에 넣지 않는다.
- 이름에도 실존 인물 흉내 패턴을 거부: `[가-힣]{2,4}\s?목사(님)?(처럼|같이|스타일|풍)`, `(처럼|같이)\s?설교`, 영문 `(like|in the style of)\s+(pastor|rev\.?|reverend)\s+\w+`. 같은 패턴 목록을 `generation-validator`(7.1)와 공유한다(`src/core/validate/person-name.ts`, S05 단계 문서 기준). 선택한 페르소나 id는 `settings`의 `persona_id`.
- 길이 상한 20자. 실존 인물 패턴("○○ 목사", "○○○ 목사님 스타일" 등)이면 거부(DESIGN 3.8, 열린 질문 22 해결).

### 4.4 블록 템플릿 (예, ko)
```
[페르소나]
- 전통 경향: {denomination_label} 전통의 강조점을 참고하되 교리를 단정하지 않는다
- 강조점: {emphasis_labels}
- 설교 방식: {style_label} / 말투: {tone_label} / 대상: {audience_label}
- 분량: 약 {length}자
```
- 라벨만 넣는다. 사용자 입력 문자열은 블록에 들어가지 않는다.

## 5. 테스트 케이스
- [ ] 모든 허용값 조합 일부(필드별 경계) 통과, 알 수 없는 코드 거부
- [ ] emphasis 빈 배열 거부, 중복 제거
- [ ] 이름 "김OO 목사처럼" 거부, "주일 오전용" 허용
- [ ] 블록에 이름 필드 미포함, 언어별 라벨 사용
- [ ] 언어 전환 시 선택지 라벨이 즉시 바뀌고 저장값은 그대로
- [ ] ko/en 라벨 키가 모든 코드에 존재(i18n 점검)

## 6. 작업 후 확인
- `sermon-verify`: import 경계(`core/persona` → llm 금지), i18n 키 일치, 화면 한글 하드코딩 점검.
