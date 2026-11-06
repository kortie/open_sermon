# S12. 화면 구조 개편 (플로팅 메뉴, 읽기 도구 막대, 말씀 나눔 초안 주 버튼)

| 항목 | 값 |
|---|---|
| 선행 | S11 |
| DESIGN 참조 | 3.1, 3.1.1, 3.7, 3.12, 8장 (v0.18) |
| 모듈 | `src/app`(App, viewer, generate), `src/ui`(ActionBar, Menu, settings) |
| 관련 스킬 | `mobile-long-press-selection`, `setup-wizard` |

## 목표
실기기 확인(2026-11-05)에서 나온 세 문제를 고친다. 상단 메뉴 때문에 본문이 스크롤해야 보이고, 역본 선택이 설정에만 있으며, 구절 선택 후 말씀 나눔 초안 기능이 보이지 않는다.

## 착수 전 확정
없음(2026-11-05 사용자 지시: 역본 선택은 성경 읽기에, 메뉴는 플로팅 버튼으로 여는 사이드 메뉴, 선택 후 초안 기능 필수).

## 범위
- **In**: 상단 헤더·탭 제거, 플로팅 메뉴 버튼과 사이드 메뉴(홈, 성경 읽기, 내 설교, 설정), 읽기 화면 한 줄 도구 막대(책·장 패널 토글, 역본 고르기, 검색), 설정의 역본 고르기 제거(관리만 유지), 액션 바 "말씀 나눔 초안" 주 버튼, 연결 없을 때 안내 화면(AI 연결하기 / 말씀 구성표로 쓰기), 기존 E2E 갱신.
- **Out**: 앱 패키징(S13), 새 기능.

## 산출물
```
src/ui/Menu.tsx                       # 플로팅 버튼 + 사이드 메뉴
src/app/App.tsx                       # 헤더 제거, Menu 연결
src/app/viewer/{Viewer,ReaderToolbar,ChapterView}.tsx
src/ui/ActionBar.tsx                  # draft 주 버튼
src/app/generate/Generate.tsx         # kind=sermon, 연결 없을 때 안내
src/ui/settings/bibles/BibleSettings.tsx
src/i18n/{ko,en}.json
tests/e2e/*.spec.ts
```

## 설계 상세
- 메뉴 버튼: `position: fixed`, 오른쪽 아래(엄지 위치, 액션 바가 떠 있으면 액션 바 위), 48×48px, `aria-expanded`, `aria-controls`. 사이드 메뉴는 `role="dialog"` `aria-modal`, 배경 누르기·Esc·항목 선택으로 닫힘, 현재 화면 `aria-current`.
- 도구 막대: 책·장 버튼(`aria-expanded`), 역본 `<select>`(번들 + 가져온 역본, 44px 이상), 검색 토글. 책·장 패널에는 기존 책·장 고르기와 참조 입력.
- 말씀 나눔 초안: `navigate('generate', { ref, kind: 'sermon' })`. Generate는 연결이 없으면 요청 없이 안내(`generate-no-connection`). `example`·`one_liner`는 기존대로 라이브러리로 간다.

## 테스트 요구사항
- E2E: 360×640에서 읽기 화면 첫 절이 화면 안에 보임(스크롤 없이).
- E2E: 메뉴 열기·닫기(배경, 항목), 각 항목 이동, 마법사에서 메뉴 숨김.
- E2E: 읽기 화면에서 역본 바꾸기 → 본문 바뀜, 설정에는 역본 고르기 없음.
- E2E: 선택 → "말씀 나눔 초안" 보임 → 연결 없음 안내 → "말씀 구성표로 쓰기" 이동, 외부 요청 0. 연결 있음(모의) → 생성 화면.
- 기존 E2E·네트워크 테스트 전부 통과(선택자 갱신).

## 검증 게이트
- 자동: `scripts/verify.sh full` PASS, 위 E2E.
- 수동: 실기기에서 메뉴 버튼이 본문·액션 바를 가리지 않는지, 한 손 조작.

## 완료 정의
- [x] 상단 탭 없이 플로팅 메뉴로 이동
- [x] 읽기 화면에서 역본 고르기
- [x] 선택 후 말씀 나눔 초안 주 버튼과 연결 없을 때 안내
- [x] 360×640에서 본문 첫 절이 스크롤 없이 보임

## 검증 기록

### 2026-11-05
- 자동: scripts/verify.sh full → 정적 점검 1건(no-hangul-in-ui, 주석의 "8장") 외 PASS (단위 611개, E2E 188개, 네트워크 24개, 커버리지 core 97.75%). 주석 수정 후 scripts/verify.sh quick → PASS
- 단계 게이트:
  - 360×640에서 요한복음 3장 1절이 스크롤 없이 보임, 도구 막대 한 줄(높이 80px 미만) → PASS (`tests/e2e/reader-layout.spec.ts`)
  - 메뉴: 플로팅 버튼 `aria-expanded`, 배경·Esc·항목으로 닫힘, 현재 화면 `aria-current`, 마법사에서 숨김, 선택 중(액션 바)에는 숨김 → PASS
  - 읽기 화면 역본 바꾸기 → 본문 바뀜·새로고침 후 유지, 설정에 역본 고르기 없음(관리만) → PASS
  - 선택 → "말씀 나눔 초안" 주 버튼 → 연결 없음 안내(AI 연결하기 / 말씀 구성표로 쓰기), 외부 요청 0 / 연결 있음(모의) → 전송 안내 화면, 키 확인 외 전송 0 → PASS
  - 기존 E2E 선택자 갱신(메뉴 `nav()` 도우미, 책·장 패널 `openBookPanel()`, 역본 `chooseReaderBible()`) → 두 엔진 PASS
- 수동: 보류 → backlog MV-S12 (1항목)
- 의존성 추가: 없음
- 설계 변경: DESIGN v0.18 변경 이력 "실기기 확인 … (사용자 결정)" 행
- 후속: 선택 중에는 메뉴 버튼이 숨으므로 다른 화면으로 가려면 선택을 해제해야 한다. 실기기 사용감에 따라 액션 바 위로 옮길지 검토.

