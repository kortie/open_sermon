---
name: sermon-style-profile
description: Sermon style profile — schema (sentence length, question ratio, illustration frequency, structure, 3-line tone summary, up to 10 phrases), minimum 3 sermons, external-transfer consent, LLM call in core/generate, source_hash invalidation, and no-original-sentence checks. Use when touching style_profile, profile generation prompts, consent flow, or invalidation — e.g. "스타일 프로필", "말투 분석", "프로필 무효화", "style profile schema".
---

# 스타일 프로필

## 1. 언제 쓰나
- S10(구현). S04는 `source_hash` 갱신, S06은 백업 포함, S09는 프롬프트 블록으로 사용.
- 위치: 스키마·검증·무효화 `src/core/sermon/styleProfile.ts`, 저장 `src/core/store/styleProfile.ts`, LLM 호출과 S09 프롬프트 블록 `src/core/generate/styleProfile.ts`, 프롬프트 `src/prompts/{ko,en}/style-profile.txt`(+ `prompt.json`의 `style_profile`·`style_block`), 화면 `src/ui/sermons/StyleProfileCard.tsx`.

## 2. 기준 문서
- DESIGN 3.9(스타일 프로필, 원고 수, 재생성), 3.13.4(원고 전송 동의, Gemini 무료 티어 문구), 4.1(`style_profile`, `consent_log`), 4.4, 6.1.

## 3. 규칙
- 규칙 3: `core/sermon`은 LLM을 부르지 않는다. 호출은 `core/generate`.
- 규칙 7: 원고 외부 전송은 별도 동의(`consent_log` kind `external_transfer`)가 있어야 한다. 기본값 "보내지 않음".
- 원문 문장을 프로필에 넣지 않는다(CLAUDE 5.7).
- 규칙 10: 프로필 결과도 검증 후 저장한다.

## 4. 상세

### 4.1 스키마
```ts
export interface StyleProfile {
  avg_sentence_len: number;            // 문장 길이 평균(글자 수, 기기에서 계산 measureSentences)
  question_ratio: number;              // 0..1, 기기에서 계산
  illustration_freq: 'low' | 'mid' | 'high';
  structure: 'expository' | 'topical' | 'narrative' | 'mixed';
  tone_summary: string[];              // 최대 3줄(4줄이면 실패), 줄당 100자 초과면 실패
  frequent_phrases: string[];          // 최대 10개(11개면 실패), 정규화 20자 이상은 제거
}
// 모델은 illustration_freq, structure, tone_summary, frequent_phrases만 답한다(validateModelAnswer).
export interface StyleProfileRecord { id: 'current'; profile_json: string | null; source_hash: string; prompt_version: string; sermon_count: number; created_at: number }
```
- `source_hash` = 현재 저장된 모든 원고의 `sermon_meta.source_hash` 값을 정렬해 줄바꿈으로 이은 값의 SHA-256(`computeSourceHash`). id가 아니라 해시 값으로 정렬하므로 백업 복원 뒤에도 같다.
- `prompt_version` = `style-` + 언어 프롬프트 VERSION(`styleProfileVersion`).
- 입력: 가린 본문을 `generation.style_profile_max_input_chars`(40,000자)를 원고 수로 나눈 만큼 앞부분만. 출력 `style_profile_max_output_tokens`(1,024).

### 4.2 생성 흐름
1. 원고 수 확인: `min_sermons_for_style`(3) 미만이면 "스타일 반영이 제한적입니다" 안내(생성은 사용자가 원하면 진행).
2. LLM 연결 확인(없으면 버튼 잠금).
3. `consent_log(external_transfer, 제공자)` 최신 기록이 granted여야 버튼이 보인다(없으면 안내만, 전송 0). 버튼 → 확인 화면 "원고가 선택한 AI 제공자로 전송됩니다"(Gemini면 무료 티어 경고 추가) → 보내기. 취소 시 종료(다른 기능 영향 없음).
4. `generate`가 마스킹된 원문을 복호화해 프롬프트에 넣고 호출(재시도 총 1회, 일일 한도 포함).
5. 검증(4.3) 통과 시 저장, 실패 시 저장하지 않고 안내.

### 4.3 검증
- JSON 스키마 일치, 배열 길이 상한.
- **원문 문장 금지**: `tone_summary`, `frequent_phrases` 각 항목과 원고 원문 사이에 연속 20자(`copy_check_ngram_chars`) 일치가 있으면 그 항목 제거. `frequent_phrases`는 20자 미만이어야 하므로 짧은 표현만 남는다.
- 실존 목회자 이름 패턴(`looksLikePersonLabel`) 포함 시 제거.
- 제거 뒤 `tone_summary`가 비면 빈 프로필 → 재시도 1회, 또 실패면 저장하지 않음.

### 4.4 무효화
- 원고 추가, 수정, 삭제 → 현재 `source_hash`가 저장된 값과 다르면 프로필은 "다시 만들기 필요" 상태. 생성 프롬프트에 무효 프로필을 넣지 않는다.
- 원고 삭제 트랜잭션에서 프로필 내용을 지우고(`wipeStyleProfilesTx`) `profile_json: null`인 빈 표시만 남긴다 → 화면은 "다시 만들기".
- S09 초안 프롬프트에는 `activeStyleProfileText`(ready일 때만)를 `external_transfer` 동의가 있을 때만 넣는다.
- 백업 복원: 백업 프로필의 `source_hash`가 복원 뒤 원고 집합 해시와 같을 때만 복원한다.

## 5. 테스트 케이스
- [ ] 동의 기록 없으면 generate 호출 0
- [ ] 원고 2편 → 제한 안내, 3편 → 안내 없음
- [ ] 모의 응답에 원문 25자 일치 표현 → 해당 항목 제거
- [ ] 배열 상한 초과 → 실패(재시도 대상)
- [ ] 원고 추가/삭제 후 프로필 무효 표시, 생성 프롬프트에서 제외
- [ ] `core/sermon` 파일이 `core/generate`/`core/llm`을 import하지 않음

## 6. 작업 후 확인
- `sermon-verify`: import 경계, 콘솔 금지, 모의 fetch로만 테스트(실제 호출은 backlog), 커버리지.
