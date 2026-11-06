---
name: mobile-long-press-selection
description: Mobile long-press verse selection — 450ms threshold, touch event options, blocking native long-press menus in the reader only, multi-block selection state (adjacent tap extends, distant tap adds a block, tapping a selected verse removes it), drag selection, action bar, checkbox fallback with aria, and local-only metrics. Use when touching src/core/selection, the reader verse list, or the action bar — e.g. "롱터치 선택", "액션 바", "범위 확장 버그", "long press", "selection blocks".
---

# 모바일 롱터치 선택

## 1. 언제 쓰나
- S03(구현). S05·S09에서 액션 바 버튼을 실제 기능에 연결.
- 위치: 상태 머신·정규화 `src/core/selection/`(DOM 의존 없음), 이벤트 바인딩 `src/app/viewer/`(`useLongPress.ts`, `useSelection.ts`, `VerseList.tsx`), 액션 바 `src/ui/ActionBar.tsx`.

## 2. 기준 문서
- DESIGN 3.1.1(다중 블록, 한 장 한정, 액션 바, 해제, 접근성, 측정), 10장(450ms, 44px, 360px), 4.1(`local_stats`).

## 3. 규칙
- 규칙 13: 호버, Shift 클릭, 우클릭 메뉴 이벤트 추가 금지. `onContextMenu`는 `preventDefault` 용도만.
- 규칙 16: 문구는 i18n. 규칙 14: 액션 이름은 노출 이름.
- 측정은 기기 안 집계만, 외부 전송 없음.

## 4. 상세

### 4.1 상태 머신
```ts
type Mode = 'idle' | 'pressing' | 'selecting' | 'dragging';
export interface SelectionState { mode: Mode; book: BookNo; chapter: number; verses: ReadonlySet<number>; anchor?: number }
export type SelEvent =
  | { t: 'press_start'; verse: number } | { t: 'press_timeout' } | { t: 'press_cancel' }   // 이동/떼기 < 450ms
  | { t: 'tap'; verse: number } | { t: 'drag_to'; verse: number } | { t: 'drag_end' }
  | { t: 'toggle_check'; verse: number } | { t: 'clear' } | { t: 'tap_empty' } | { t: 'chapter_change' };
export function reduce(s: SelectionState, e: SelEvent): SelectionState;
export function toBlocks(verses: ReadonlySet<number>): VerseRange[];   // 정렬, 인접·겹침 병합
```
| 상황 | 결과 |
|---|---|
| idle에서 450ms(`ui.long_press_ms`) 누름 | selecting, 해당 절 선택, `navigator.vibrate?.(10)` |
| 450ms 전 이동(임계 px 초과)/떼기 | idle(스크롤 우선), 취소 집계 |
| selecting에서 미선택 절 탭 | 그 절 추가 → `toBlocks`가 인접하면 블록 확장, 떨어지면 새 블록 |
| 선택된 절 탭 | 그 절만 해제(중간이면 블록 둘로) |
| 누른 채 드래그 | anchor~현재 절로 블록 교체(다른 블록 유지) |
| 선택 0개 | idle |
| "선택 해제"/"전체 해제"/빈 곳 탭 | idle |
| 장 이동 | idle(한 장 한정) |
- 체크 영역 탭(`toggle_check`)은 롱터치 없이 selecting으로 진입·토글.
- "선택 해제"는 마지막 블록 해제, "전체 해제"는 전부(문구 구분은 i18n).

### 4.2 이벤트와 기본 동작 차단
- 본문 컨테이너에만: `touchstart`, `touchmove`를 `{ passive: false }`로 등록. 선택 모드·롱프레스 대기 중에만 `preventDefault`(평상시 스크롤 보장).
- 본문 영역 CSS: `-webkit-user-select: none; user-select: none; -webkit-touch-callout: none;`(본문 영역에만).
- `contextmenu`는 본문 영역에서 `preventDefault`만.
- 자동 스크롤은 드래그 중 화면 가장자리(예: 상하 48px)에서만.

### 4.3 참조 문자열과 액션 바
- `formatReference({book, chapter, ranges: toBlocks(verses)}, lang)` — 예 `요 15:1–8, 12`. 파서와 같은 규칙(`bible-reference-parser`).
- 액션 바(선택 ≥1): 복사 / 말씀 구성표 / 삶에 닿는 예시 / 가벼운 한마디 / 내 설교에서 찾기. 버튼 44×44px 이상, 하단 고정, 본문을 가리지 않게 패딩.
- 복사: 참조 + 원문(DB 텍스트)을 클립보드에. 키가 없으면 LLM 버튼은 라이브러리 결과로 연결(S05/S09에서 연결).

### 4.4 접근성
- 체크 영역: `role="button"` 또는 `<button>`, `aria-pressed`, 접근 가능한 이름 "선택됨, 27절" / "27절 선택"(i18n 키, 절 번호 보간).
- 액션 바 등장 시 `aria-live="polite"`로 "N절 선택됨".

### 4.5 로컬 집계 (`local_stats`)
- 진입 성공(롱터치로 selecting), 취소(press_cancel 후 다시 시도 없이 끝남), 직접 입력 우회(참조 입력창 사용) 횟수를 날짜별로 기록. 설정 화면에서만 표시.

## 5. 테스트 케이스
- 단위(reduce):
  - [ ] 450ms 진입, 449ms 떼기 취소, 이동 시 취소
  - [ ] 인접 탭 확장(앞/뒤), 떨어진 탭 새 블록, 블록 사이 절 탭 시 병합
  - [ ] 선택된 중간 절 탭 → 블록 분리, 마지막 절 해제 → idle
  - [ ] 드래그 위/아래, 다른 블록 유지
  - [ ] 장 이동 → idle, 전체 해제 → idle
  - [ ] `toBlocks` + `formatReference` = `요 15:1–3, 5–7`
- E2E(360px, 390px; Chromium/WebKit):
  - [ ] 롱터치 → 체크 표시, 액션 바, 가로 스크롤 없음
  - [ ] 체크 영역만으로 선택 가능, `aria-pressed=true`
  - [ ] 평상시 세로 스크롤 동작(롱터치와 충돌 없음)
  - [ ] 액션 바 버튼 크기 ≥ 44px

## 6. 작업 후 확인
- `sermon-verify`: 데스크톱 이벤트 금지 점검(`onMouseEnter`, `shiftKey`, `:hover`), 화면 한글 하드코딩 점검, 커버리지 `core/selection` 90% 이상, E2E 두 프로젝트.
- 수동(backlog): 실제 iOS Safari·Android Chrome에서 텍스트 선택 메뉴가 뜨지 않음, 진동, 스크린리더 낭독.
