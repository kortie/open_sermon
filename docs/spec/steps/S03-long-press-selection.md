# S03. 롱터치 다중 블록 선택, 액션 바, 로컬 집계

| 항목 | 값 |
|------|----|
| 선행 | S02 |
| DESIGN 참조 | 3.1.1, 4.1(`local_stats`), 8장(뷰어), 10장 |
| 모듈 | `core/selection`, `src/app/viewer`, `src/ui` |
| 관련 스킬 | `mobile-long-press-selection`, `bible-reference-parser` |

## 목표
본문 절을 롱터치(450ms)로 선택하고, 다중 블록으로 확장·분리·병합하며, 하단 액션 바에서 참조 문자열과 함께 다음 행동으로 넘긴다. 체크 영역과 스크린리더로도 같은 선택이 가능해야 한다.

## 착수 전 확정
없음 (선택 의미는 DESIGN 3.1.1 v0.8에서 확정).

## 범위
- **In**: 선택 상태 머신(순수 함수), 롱터치 인식, 드래그 확장, 체크 영역, 액션 바(복사 동작), 선택 해제 수단, 진동, 접근성 문구, `local_stats` 스토어와 집계, 설정 화면의 로컬 통계 표시.
- **Out**: 액션 바의 말씀 구성표·내 설교에서 찾기 연결(S05), 삶에 닿는 예시·가벼운 한마디의 LLM 연결(S09). 장을 넘는 선택.

## 산출물
```
src/core/selection/state.ts       # 순수 리듀서: enter, tap, toggle, drag, clear, chapterChange
src/core/selection/normalize.ts   # Set<number> → 정렬된 블록 목록 [{start,end}]
src/core/selection/stats.ts       # 집계 이벤트 → local_stats
src/core/store/local-stats.ts
src/app/viewer/useLongPress.ts    # touchstart/move/end, passive:false, 450ms
src/app/viewer/VerseList.tsx
src/ui/ActionBar.tsx
tests/unit/selection/state.test.ts
tests/unit/selection/normalize.test.ts
tests/unit/selection/stats.test.ts
tests/e2e/long-press.spec.ts
```

## 설계 상세
- **상태**: `{ mode: 'idle'|'selecting', verses: Set<number>, chapterKey }`. 블록은 항상 `normalize(verses)`로 계산한다(블록을 따로 저장하지 않음).
- **규칙(DESIGN 3.1.1)**:
  - idle에서 절 450ms 누름 → selecting, 그 절 선택, 진동(`navigator.vibrate?.(10)`, 미지원 시 무시).
  - selecting에서 미선택 절 탭: 어느 블록이든 바로 앞/뒤 절이면 그 블록 확장, 아니면 새 블록. (둘 다 Set에 추가 후 정규화하면 같은 결과가 나오는지 테스트로 보장.)
  - 선택된 절 탭 → 그 절만 해제. 블록 중간이면 두 블록으로 나뉨. 마지막 절이 해제되면 idle.
  - 누른 채 드래그: 시작 절~현재 절 범위를 절 단위로 갱신(드래그 시작 전 선택은 유지). 화면 가장자리(상하 각 48px)에서만 자동 스크롤.
  - 장 이동 → 선택 해제, idle.
  - 해제 수단: "선택 해제"(마지막 블록 해제), "전체 해제", 본문 밖 빈 곳 탭.
- **롱터치 인식**: `touchstart`, `touchmove`를 `passive: false`로 등록. 450ms 전에 10px 이상 이동하면 스크롤로 보고 취소. 본문 영역에서만 `contextmenu` `preventDefault`, `user-select: none`, `-webkit-touch-callout: none`. 다른 영역(입력창 등)의 기본 동작은 그대로.
- **체크 영역**: 각 절 왼쪽 44×44px 버튼, `aria-pressed`, 스크린리더용 숨김 텍스트 "선택됨, 27절"(i18n 키, 절 번호 파라미터). 체크 탭은 롱터치 없이 selecting 진입.
- **액션 바**: 선택 ≥ 1이면 하단 고정. 참조 문자열은 S01 `reference-format`으로 만들고, 그 문자열이 `reference-parser`로 같은 선택으로 돌아오는지 보장. 버튼: 복사(참조 + 본문 텍스트를 클립보드에), 말씀 구성표, 내 설교에서 찾기, 삶에 닿는 예시, 가벼운 한마디 — 복사 외에는 비활성(라벨은 노출 이름, "준비 중" 표시).
- **집계**: 기기 안에서만. 진입 성공률 = 롱터치 진입 / (롱터치 진입 + 450ms 전 취소), 취소율 = 진입 후 아무 행동 없이 해제 / 진입, 직접 입력 우회율 = 참조 입력창 사용 / (참조 입력 + 선택 진입). 날짜별 카운터만 저장.
- 호버, 우클릭 메뉴, Shift 클릭 이벤트를 추가하지 않는다.

## 테스트 요구사항
- 단위(리듀서, 표 기반):
  - 진입: idle + longPress(5) → {5}
  - 인접 확장: {1..3} + tap(4) → [1–3→1–4]; {3..5} + tap(2) → [2–5]
  - 떨어진 절: {1..3} + tap(7) → [1–3], [7]
  - 병합: [1–3], [5] + tap(4) → [1–5]
  - 선택 절 해제: [1–5] + tap(3) → [1–2], [4–5]; [5] + tap(5) → idle
  - 드래그: 시작 3, 현재 6 → 3–6 추가, 역방향 드래그 처리
  - 장 이동 → idle, 전체 해제 → idle
- 단위: 블록 → 참조 문자열 → 파서 → 같은 Set (왕복 20건 이상), 예: "요 15:1–8, 12", "요 15:1–3, 5–7".
- 단위: 집계 공식과 일별 저장, 외부 전송 함수가 없음(모듈 import 검사).
- E2E(가짜 시간 또는 명시적 대기, 터치 이벤트 직접 전송):
  - 449ms 누름 → 진입 안 함 / 450ms 이상 → 진입, `aria-pressed=true`
  - 450ms 전 15px 이동 → 진입 안 함, 스크롤 발생
  - 인접 탭 확장, 떨어진 탭 새 블록, 선택 절 탭 분리, 전체 해제, 빈 곳 탭 해제
  - 드래그 범위 변경, 장 이동 시 해제
  - 본문 영역에서 `contextmenu` 기본 동작 차단, 참조 입력창에서는 차단 안 함
  - 체크 영역만으로 선택·해제(롱터치 없이)
  - 액션 바 참조 문자열 표시, 복사 결과가 참조+본문
  - 360/390px 가로 스크롤 없음, 체크 영역·액션 바 버튼 44×44px 이상
- 네트워크: 선택·복사·집계 흐름에서 같은 출처 외 요청 0건.

## 검증 게이트
- 자동:
  - 위 테스트 통과, `core/selection` 커버리지 90% 이상
  - 정적 점검(데스크톱 전용 이벤트 금지) 통과
  - chromium·webkit 두 프로젝트 모두에서 롱터치 E2E 통과
- 수동:
  - [ ] iOS Safari 실기기: 450ms 롱터치 진입, 텍스트 선택 메뉴·돋보기·콜아웃이 뜨지 않음
  - [ ] Android Chrome 실기기: 롱터치 진입, 진동, 텍스트 선택 메뉴가 뜨지 않음
  - [ ] 실기기 스크롤 중 실수로 선택 모드에 들어가지 않음
  - [ ] 드래그 확장과 가장자리 자동 스크롤이 자연스러움
  - [ ] VoiceOver/TalkBack에서 체크 영역이 "선택됨, 27절"로 읽힘
  - [ ] 설정 화면의 로컬 통계 값이 실제 사용과 맞음

## 완료 정의
- [x] DESIGN 3.1.1 규칙이 리듀서 테스트로 모두 커버됨
- [x] 참조 문자열이 파서와 왕복 일치
- [x] 체크 영역·스크린리더 대체 수단 동작
- [x] 액션 바 복사 동작, 나머지 버튼은 비활성 표시
- [x] 로컬 집계 저장과 표시, 외부 전송 없음

## 검증 기록

### 2026-11-04
- 자동: scripts/verify.sh full → PASS (단위 255개, E2E 82개(41×2 뷰포트), 네트워크 10개(5×2), 커버리지 core 93.06% lines — `core/selection` 100%, store 88.37%, verify:db PASS)
- 단계 게이트:
  - 리듀서 표 테스트(`tests/unit/selection/state.test.ts`): 진입, 인접 앞·뒤 확장, 떨어진 절 새 블록, 블록 사이 병합, 중간 해제 분리, 마지막 절 해제 → idle, 드래그 정·역방향과 기존 선택 유지, 장 이동·전체 해제·빈 곳 탭 → idle, Set+정규화와 같은 결과 통과
  - 왕복(`normalize.test.ts`): 24건 × ko·en = 48건, 블록 → `formatReference` → `parseReference` → 같은 Set. "요 15:1–8, 12", "요 15:1–3, 5–7" 확인
  - 집계(`stats.test.ts`): 공식, 일별 저장(fake-indexeddb), `core/selection`·`local-stats`에 네트워크 API와 llm/generate import 없음
  - E2E(`long-press.spec.ts`, Playwright 가짜 시계 + 터치 이벤트 직접 전송, chromium·webkit 모두): 449ms 진입 안 함 / 450ms 진입·`aria-pressed=true`, 450ms 전 15px 이동 시 진입 안 함·`touchmove` 기본 동작 막지 않음, 인접·떨어진·분리·병합, 선택 해제·전체 해제·빈 곳 탭, 드래그 범위 변경(드래그 중에만 `touchmove` 차단), 장 이동 해제, 본문 `contextmenu` 차단·참조 입력창은 허용, 체크 영역만으로 선택·해제와 접근 이름 "선택됨, 3절"/"3절 선택", 복사 = 참조 + 본문, 나머지 4개 버튼 비활성·"준비 중", 360/390px 가로 스크롤 없음·44px 이상·마지막 절이 액션 바에 가리지 않음, 설정 화면 통계 표시
  - 네트워크: 선택·복사·집계·설정 통계 흐름에서 같은 출처 외 요청 0건
  - 정적 점검 `no-desktop-events` PASS
- 수동: 보류 → backlog MV-S03 (6항목)
- 의존성 추가: 없음
- 설계 변경: 없음
- 구현 메모:
  - `local_stats` 스토어는 `MIGRATIONS`에 v2로 추가(키 = 기기 날짜 `YYYY-MM-DD`, 카운터만)
  - 집계 정의: 롱터치 취소는 "임계값의 절반(225ms) 이상 움직이지 않고 누르다가 450ms 전에 뗀 경우"만 센다. 빠른 탭과 스크롤 제스처까지 세면 진입 성공률이 의미를 잃기 때문이다. 취소율 분모는 롱터치·체크 영역 진입 합계, 우회율 = 참조 입력 / (참조 입력 + 선택 진입). 설정 화면은 최근 30일 합계
  - "선택 해제"는 가장 최근에 추가한 절이 속한 블록을 지운다(없으면 장 순서상 마지막 블록). "전체 해제"는 모두
  - 롱터치로 선택 중에 다시 롱터치하면 기존 선택을 유지한 채 그 절에서 드래그를 시작한다
  - 체크 영역은 절 번호를 보여 주는 44×44px 토글 버튼으로, 기존 절 번호 칸을 대신한다
  - 빈 곳 탭은 iOS에서 비대화형 요소에 `click`이 오지 않는 문제를 피하려고 문서 `touchend`(10px 이내 이동)로 판별한다
  - 드래그 중 절 판별은 `elementsFromPoint`로 액션 바 아래까지 본다. 아래쪽 자동 스크롤 영역은 화면 끝이 아니라 액션 바 위 48px이다(액션 바가 화면 아래를 가리므로)
  - 실제 손가락 스크롤 발생은 합성 이벤트로 재현할 수 없어, 자동 테스트는 "이동 시 `preventDefault`를 하지 않음"으로 대신 확인한다(실제 스크롤은 수동 항목)
  - 스킬 `mobile-long-press-selection`의 파일 위치를 단계 문서 산출물(`src/app/viewer/`, `src/ui/ActionBar.tsx`)에 맞춰 고쳤다
- 후속:
  - S05: 액션 바 "말씀 구성표"·"내 설교에서 찾기" 연결, S09: "삶에 닿는 예시"·"가벼운 한마디" 연결
  - 액션 바가 22px 글자 크기에서 화면 아래쪽을 많이 차지한다. 실기기 확인(MV-S03) 후 접기 등을 검토

