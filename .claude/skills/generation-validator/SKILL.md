---
name: generation-validator
description: Validation of LLM outputs and outlines — JSON structure, counts, length (ko chars / en words), verse_refs within input range, forbidden expressions and real-pastor patterns, light-remark (humor) topic rules, and the 20-char copy check that skips quoted scripture/excerpt blocks; plus the single-retry policy and fallback to independent results. Use when touching src/core/validate, retry logic in generate, or failure messages — e.g. "검증 규칙", "복제 검사", "재시도", "유머 금지 주제", "copy check false positive".
---

# 생성 결과 검증

## 1. 언제 쓰나
- S05(복제 검사 — 구성표 빈칸 텍스트), S09(구조, 길이, 근거 절, 금지 표현, 한마디 기준, 재시도, 독립 결과 대체), S10(프로필 원문 문장 검사 재사용), S11(가져온 역본 본문을 원천에 추가).
- 위치: `src/core/validate/`(순수 함수, LLM import 금지). 재시도 루프는 `core/generate`.

## 2. 기준 문서
- DESIGN 3.4, 3.7, 3.12(영어 길이), 3.14(가져온 역본 재인용 금지), 6.2(출력 스키마), 7.0~7.3, 열린 질문 16·18.

## 3. 규칙
- 규칙 10: 검증 후 보여준다. 실패 결과를 그대로 보여주지 않고 독립 결과로 대체.
- 규칙 9: 출력은 텍스트로만 렌더링.
- 규칙 11: 실존 목회자 패턴 실패 처리. 규칙 21: 가져온 역본 본문에도 복제 검사.
- 재시도는 사유를 합쳐 **총 1회**(7.0, `generation.max_retries_validation`), 재시도 호출도 일일 한도에 포함.

## 4. 상세

### 4.1 API
```ts
export type Issue =
  | { kind: 'schema' } | { kind: 'count'; field: 'examples' | 'humor' }
  | { kind: 'length'; actual: number; min: number; max: number; unit: 'chars' | 'words' }
  | { kind: 'verse_out_of_range'; ref: string } | { kind: 'real_person' }
  | { kind: 'forbidden_expr'; term: string } | { kind: 'humor_topic'; index: number }
  | { kind: 'humor_purpose'; index: number } | { kind: 'copy'; sourceId: string; match: string };
export interface ValidateInput { output: unknown; inputRefs: Reference[]; lang: 'ko' | 'en';
  copySources: { id: string; text: string }[]; quotedBlocks: string[] }
export function validateGeneration(i: ValidateInput): { ok: boolean; issues: Issue[]; humorDropped: boolean };
export function copyCheck(target: string, sources: { id: string; text: string }[], n: number): Issue[];
export function countLength(text: string, lang: 'ko' | 'en'): number;  // ko: 공백 포함 그래핌(확정, DESIGN 3.8), en: 단어. 초안 본문만 센다(예시·한마디 제외)
```

### 4.2 체크리스트
| 항목 | 기준 | 실패 시 |
|---|---|---|
| 스키마 | 6.2 JSON 파싱, 필드 타입 | 재시도 |
| 개수 | examples 2, humor 2 | 재시도 |
| 길이 | ko 800~1200자(`sermon_min/max_chars`), en 550~750 단어(`english_length_words`) | 재시도 |
| 근거 절 | 모든 `verse_refs`가 입력 선택 블록 안 (`bible-reference-parser`로 파싱) | 재시도 |
| 실존 인물 | `persona-builder`의 패턴 목록 | 재시도 |
| 금지 표현 | 교리 단정 표현 목록(`src/core/validate/forbidden.{ko,en}.ts`) | 재시도 |
| 한마디 주제 | 금지 주제 키워드 목록(집단·교단 비하, 목회자 조롱, 질병·사망·고난 희화, 성적 농담, 정치 편향) | 한마디만 제거 |
| 한마디 목적 | DESIGN 7.2(v0.17 확정): purpose 비어 있지 않음 + 입력 키워드 1개 이상 포함 + 본문·purpose 모두 금지 주제 미해당(`config.generation.humor_forbidden_topics`) | 한마디만 제거 |
| 복제 | 4.3 | 해당 발췌 빼고 재시도 |
- 열린 질문 16·18은 확정 전 사용자에게 묻는다(S05, S09 착수 전).
- 한마디가 기준 미달이면 한마디 섹션만 빼고 예시는 보여준다(7.2). 이것은 재시도 사유가 아니다.

### 4.3 복제 검사
- 원천: 참고 발췌(원고 청크), 가져온 txt 역본 본문(S11 이후).
- 검사 대상: 생성 텍스트에서 `quotedBlocks`(번들 역본 인용, 구성표의 본문·발췌 인용 블록)를 뺀 나머지. 구성표는 사용자가 빈칸에 쓴 텍스트만.
- 정규화: 공백·문장부호 제거, 영문 소문자화 후 길이 `copy_check_ngram_chars`(20)의 슬라이딩 창으로 원천 n-gram 집합과 비교(롤링 해시 또는 Set).
- 감지 → 일치한 원천 발췌를 프롬프트에서 빼고 재시도 1회 → 다시 감지되면 독립 결과로 대체.

### 4.4 재시도와 대체 흐름 (`generate`)
```
call → validate → ok? show
             └ fail(재시도 가능) & retries<1 & 일일 한도 남음 → (복제면 발췌 제외) call → validate → ok? show : fallback
fallback = 말씀 구성표 + 라이브러리 결과 + 안내 문구(error.validation_fallback)
```

## 5. 테스트 케이스
- [ ] 정상 출력 통과(ko, en)
- [ ] examples 1개 → 재시도 1회 후 성공/실패 각각
- [ ] 길이 799/800/1200/1201자, en 549/550/750/751 단어
- [ ] 입력 밖 근거 절 → 실패, 쉼표 블록 안 절은 통과
- [ ] "○○ 목사처럼" → 실패
- [ ] 금지 주제 한마디 → 한마디만 제거, 예시 표시
- [ ] 발췌와 연속 20자 일치 → 감지, 19자 → 통과, 공백·문장부호 차이 무시
- [ ] 번들 역본 인용 블록 안 20자 이상 일치 → 감지하지 않음
- [ ] 구성표의 발췌 인용 블록은 제외, 빈칸에 붙여넣은 발췌 문장은 감지
- [ ] 두 번째도 실패 → 독립 결과, 호출 총 2회(일일 한도 2 차감)

## 6. 작업 후 확인
- `sermon-verify`: 커버리지 `core/validate` 90% 이상, import 경계, innerHTML 금지, 금지 용어 점검.
