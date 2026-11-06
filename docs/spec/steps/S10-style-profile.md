# S10. 스타일 프로필

| 항목 | 값 |
|---|---|
| 선행 | S09 |
| DESIGN 참조 | 3.9(스타일 프로필, 원고 수, 재생성, 삭제), 3.13.4, 4.1(`style_profile`, `consent_log`), 6.1 |
| 모듈 | `core/sermon`(스키마·무효화), `core/generate`(생성 호출), `ui/sermons` |
| 관련 스킬 | `sermon-style-profile`, `generation-validator` |

## 목표
사용자 동의가 있을 때만 원고를 제공자로 보내 말투 요약 프로필을 만들고, 원문 문장 없이 저장해 초안 생성에 반영한다. 원고가 바뀌면 프로필을 무효화한다.

## 착수 전 확정
- 없음.

## 범위
- **In**: 프로필 스키마와 검증, 생성 프롬프트(ko/en, 버전), 동의 확인, 3편 미만 안내, `source_hash` 계산과 무효화, 원문 포함 금지 검사, 내 설교 화면의 프로필 상태 표시·생성·삭제, S09 프롬프트에 프로필 블록 연결.
- **Out**: 원고별 개별 프로필, 프로필 수동 편집.

## 산출물
```
src/core/sermon/styleProfile.ts     # 스키마, 검증, sourceHash(원고 목록), isStale()
src/core/generate/styleProfile.ts   # 동의 확인 → 호출 → 파싱 → 검증 → 저장
src/prompts/{ko,en}/style-profile.txt
src/ui/sermons/StyleProfileCard.tsx
tests/unit/sermon/styleProfile.test.ts
tests/unit/generate/styleProfile.test.ts
tests/e2e/style-profile.spec.ts
```

## 설계 상세
- 스키마: `{ avg_sentence_len: number, question_ratio: 0..1, illustration_freq: number, structure: enum, tone_summary: string[≤3], frequent_phrases: string[≤10] }` + 저장 필드 `source_hash`, `prompt_version`.
- `source_hash` = 저장된 모든 원고 `sermon_meta.source_hash`를 id 순으로 정렬해 해시. 원고 추가·수정·삭제 시 값이 바뀌고, 저장된 프로필과 다르면 무효(생성 프롬프트에 넣지 않음, 화면에 "다시 만들기").
- 호출 조건: 키 있음 + `consent_log(kind=external_transfer, granted=true)` + 사용자가 "프로필 만들기" 확인 화면에서 "원고가 선택한 AI 제공자로 전송됩니다" 확인. Gemini 무료 티어면 제품 개선 사용 경고를 같은 화면에 표시.
- 원고 3편 미만이면 생성은 허용하되 "스타일 반영이 제한적입니다" 안내.
- 전송 내용: 마스킹된 원고 본문(복호화는 호출 직전, 메모리에서만).
- 원문 금지 검사: `tone_summary`, `frequent_phrases` 각 항목과 원고 사이에 연속 20자 일치가 있으면 그 항목 제거. `frequent_phrases` 항목은 20자 미만 짧은 표현이어야 한다(20자 이상이면 제거). 스키마 불일치·검사 후 빈 프로필이면 재시도 1회, 다시 실패하면 저장하지 않고 안내.
- 일일 한도와 오류 매핑은 S08·S09 재사용.

## 테스트 요구사항
- 단위: 스키마 검증(요약 4줄, 표현 11개, 비율 범위 밖 → 거부 또는 잘라내기 규칙대로).
- 단위: 원고 추가·본문 수정·삭제 각각 `source_hash` 변경 → `isStale() === true`.
- 단위(모의 fetch): 동의 없음 → fetch 0회; 키 없음 → fetch 0회; 동의 있음 → 요청 본문에 마스킹된 원고만(마스킹 전 패턴 없음).
- 단위: 응답의 `frequent_phrases`에 원고 문장 20자 이상이 있으면 제거됨.
- 단위: 잘못된 JSON → 재시도 1회 → 실패 시 저장 없음, fetch 정확히 2회.
- 단위: 원고 삭제 트랜잭션 후 무효 프로필이 S09 프롬프트에 들어가지 않음.
- 단위: S09 `buildPrompt`에 유효 프로필 블록이 들어가고 원문 문장은 없음.
- E2E(모의 응답): 원고 2편 → 제한 안내; 동의 화면 거절 → 원고 기능 계속 동작, 외부 요청 0건; 생성 성공 → 상태 표시; 원고 삭제 → "다시 만들기" 표시.

## 검증 게이트
- 자동:
  - `scripts/verify.sh full` PASS
  - `core/sermon`에 `core/llm`·`core/generate` import 없음(정적 점검 3, ESLint)
  - 동의 없는 경로에서 fetch 0회 테스트 통과
  - 저장된 프로필에 원고와 20자 이상 일치 없음 테스트 통과
- 수동:
  - [ ] 실제 키와 실제 원고 3편 이상으로 프로필 생성, 요약이 말투를 반영하는지 사용자 확인
  - [ ] 프로필 반영 전후 초안 비교(사용자 판단)
  - [ ] Gemini 무료 티어 경고가 실제 화면에서 눈에 띄는지 확인

## 완료 정의
- [x] 스키마·무효화는 `core/sermon`, 호출은 `core/generate`
- [x] 동의·키 없으면 전송 없음
- [x] 원문 문장이 프로필에 남지 않음
- [x] 3편 미만 안내, `source_hash` 무효화 동작

## 선행 단계 메모
- S06(2026-11-05): 백업 복원 시 `style_profile`은 "가져온 뒤 원고 집합의 `source_hash`가 백업과 같을 때만 복원, 원고가 추가되면 기존 프로필 삭제"로 처리한다. 프로필 `source_hash` 계산 방식을 정하면 `core/backup/import.ts`를 그 값 비교로 바꾼다.

## 검증 기록

### 2026-11-05
- 자동: scripts/verify.sh full → PASS (단위 575개, E2E 164개, 네트워크 24개, 커버리지 core 줄 97.36%)
- 단계 게이트:
  - `core/sermon`의 llm/generate import 없음 → static:no-llm-import PASS, 린트 PASS
  - 단위(`tests/unit/sermon/styleProfile.test.ts` 13개, `tests/unit/generate/styleProfile.test.ts` 15개)
    - 스키마: 요약 4줄, 표현 11개, 비율 범위 밖 거부
    - 추가·수정·삭제 각각 `source_hash` 변경 → `isStale`
    - 동의 없음(거절·기록 없음·나중 거절) → fetch 0, 키 없음 → fetch 0
    - 동의 있음 → 가린 본문만 전송(전화번호 미포함)
    - 원고 20자 복제 표현 제거, 20자 이상 표현 제거, 실존 인물 형태 제거
    - JSON 오류 → 재시도 1회 → 저장 안 함, fetch 정확히 2
    - 원고 삭제 후 무효 프로필은 S09 프롬프트에 들어가지 않음
    - `buildPrompt`에 프로필 블록이 들어가고 원고 문장은 없음
  - E2E(`tests/e2e/style-profile.spec.ts`, 360·390 각 4개)
    - 원고 2편 → 제한 안내, 확인 화면 후에만 전송
    - 동의 거절 → 원고 기능 정상, 키 확인 외 요청 0
    - 연결 없음 → 외부 요청 0
    - 성공 → 상태·항목 표시, 다음 초안에 프로필 반영
    - 원고 삭제 → "다시 만들기", 초안 안내에서 프로필 줄 사라짐
    - 잘못된 응답 2회 → 저장 안 함
- 수동: 보류 → backlog MV-S10 (3항목)
- 의존성 추가: 없음
- 설계 변경: DESIGN v0.17 변경 이력 "S10 구현 반영" 행
  - 입력 상한 40,000자, 출력 1,024토큰(config `generation.style_profile_max_input_chars`, `style_profile_max_output_tokens`)
  - 숫자 항목(문장 길이, 질문 비율)은 기기에서 계산
  - `source_hash`는 원고 해시를 id가 아니라 해시 값으로 정렬해 계산한다. 백업 복원으로 id가 달라져도 같은 값이 나온다.
  - 원고 삭제 시 프로필 내용을 지우고 빈 표시를 남겨 "다시 만들기"를 안내한다.
  - 초안 반영은 `external_transfer` 동의가 있을 때만 한다.
- 선행 메모 처리: `core/backup/import.ts`는 백업 프로필의 `source_hash`가 복원 뒤 원고 집합 해시와 같을 때만 복원한다(단위 테스트 2개 추가).
- 테스트 하네스: WebKit에서 서비스 워커가 테스트 도중 페이지를 제어하면 `context.route`가 교차 출처 요청을 가로채지 못해 모의 제공자를 우회했다(실제 엔드포인트가 가짜 키에 401을 반환).
  - 제공자를 모의하는 spec 4개(style-profile, generate, wizard-llm, generate-network)에 `serviceWorkers: 'block'`을 넣었다.
  - 앱 동작은 바뀌지 않는다(서비스 워커는 교차 출처 요청을 처리하지 않음).
- 후속:
  - 확인 화면 수락 자체는 consent_log에 따로 기록하지 않는다(전제 동의 `external_transfer`는 기록됨).
  - 전송 동의를 바꾸는 별도 설정 화면은 아직 없다. 다시 연결(마법사 8단계)로만 바꿀 수 있다.
  - Gemini 경고는 Gemini가 검증되기 전까지 화면에 나오지 않는다(코드 경로만 있음).
