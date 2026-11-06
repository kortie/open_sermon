# 구현 스펙 (단계 문서)

설계의 단일 기준은 `docs/DESIGN.md`(v0.19)다. 이 디렉터리는 설계를 **단계별로 잘라 범위, 산출물, 테스트, 검증 게이트**를 정한다. 단계 작업은 `sermon-step` 스킬, 검증은 `sermon-verify` 스킬을 따른다.

## 원칙

- **A1. 한 번에 한 단계.** 선행 단계가 `DONE`이 아니면 착수하지 않는다.
- **A2. 단계 문서가 범위의 기준이다.** "범위 Out"은 구현하지 않는다. 설계와 다른 결정이 필요하면 `design-doc-sync` 스킬로 사용자 확인 후 DESIGN.md부터 고친다.
- **A3. 착수 전 확정.** 단계 문서의 "착수 전 확정" 항목(DESIGN 12장 열린 질문 등)이 열려 있으면 사용자에게 묻고 결과를 DESIGN.md에 반영한 뒤 시작한다.
- **A4. 외부 사실은 기억으로 채우지 않는다.** 엔드포인트, 모델명, CORS 허용 여부, 라이선스, 반복 횟수 권장값, 릴리스 해시는 공식 출처를 확인하고 날짜와 함께 기록한다.
- **A5. 완료 조건은 자동 게이트다.** `scripts/verify.sh full` PASS와 단계 문서의 자동 게이트가 완료의 유일한 조건이다. 실기기, 실제 API 키, 다른 기기 설치가 필요한 **수동 항목**은 `manual-verification-backlog.md`로 옮기고 단계는 `DONE`으로 둔다(수동 검증 열 = 보류).
- **A6. 실제 외부 호출은 자동 테스트에 넣지 않는다.** LLM 호출은 모의 `fetch`로 테스트한다. 실제 키로 하는 확인은 수동 항목이다.

## 상태 표

| 단계 | 제목 | 선행 | 주 모듈 | 관련 스킬 | 상태 | 수동 검증 |
|---|---|---|---|---|---|---|
| [S00](steps/S00-scaffolding.md) | 프로젝트 셋업, PWA 셸, CSP, i18n 기반, 검증 스크립트 | - | 전체 골격 | sermon-verify | DONE | 보류 |
| [S01](steps/S01-bible-viewer.md) | 번들 DB, 뷰어, 참조 파서, 구절 검색 | S00 | `core/bible` | bible-db-access, bible-reference-parser | DONE | 보류 |
| [S02](steps/S02-language-settings.md) | 저장소 기반, 언어와 역본 설정, 홈·설정 골격, 마법사 1~3 | S01 | `core/store`, `i18n`, `ui/setup-wizard` | setup-wizard | DONE | 보류 |
| [S03](steps/S03-long-press-selection.md) | 롱터치 다중 블록 선택, 액션 바, 로컬 집계 | S02 | `core/selection` | mobile-long-press-selection, bible-reference-parser | DONE | 보류 |
| [S04](steps/S04-vault-sermon-ingest.md) | 암호화 모듈, 원고 업로드, 동의, 마스킹, 청크, 삭제 | S02 | `core/vault`, `core/sermon` | key-vault-security, sermon-ingest-privacy | DONE | 보류 |
| [S05](steps/S05-independent-features.md) | 내 설교에서 찾기, 말씀 구성표, 라이브러리, 페르소나, 복제 검사 (**배포 가능** — 2026-11-05 네트워크 차단·오프라인 전체 흐름 통과) | S03, S04 | `core/compose`, `core/persona`, `core/validate` | sermon-retrieval, persona-builder, generation-validator | DONE | 보류 |
| [S06](steps/S06-local-backup.md) | 백업 내보내기와 가져오기 | S05 | `core/backup` | local-backup, key-vault-security | DONE | 보류 |
| [S07](steps/S07-provider-verification.md) | 제공자 브라우저 직접 호출 검증, 설정값 확정 | S00 | `docs/PROVIDERS.md`, `config` | llm-provider-adapter | DONE | 보류 |
| [S08](steps/S08-llm-adapter-wizard.md) | LLM 어댑터, 키 등록과 검증, 마법사 4~9 | S04, S07 | `core/llm`, `ui/setup-wizard` | llm-provider-adapter, key-vault-security, setup-wizard | DONE | 보류 |
| [S09](steps/S09-generation-validation.md) | 초안·예시·한마디 생성, 검증, 실패 시 독립 결과 | S05, S08 | `core/generate`, `core/validate` | generation-validator, persona-builder | DONE | 보류 |
| [S10](steps/S10-style-profile.md) | 스타일 프로필 | S09 | `core/sermon`, `core/generate` | sermon-style-profile | DONE | 보류 |
| [S11](steps/S11-bible-txt-import.md) | txt 역본 가져오기, 역본 안내 레지스트리 | S06, S09 | `core/bible-import` | bible-txt-import | DONE | 보류 |
| [S12](steps/S12-screen-restructure.md) | 화면 구조 개편: 플로팅 메뉴, 읽기 도구 막대·역본 고르기, 말씀 나눔 초안 주 버튼 | S11 | `src/app`, `src/ui` | mobile-long-press-selection | DONE | 보류 |
| [S13](steps/S13-app-packaging.md) | Capacitor 앱 패키징(Android·iOS), 공유 시트 내보내기, 외부 링크 | S12 | `capacitor.config.ts`, `android/`, `ios/`, `src/app/platform.ts` | sermon-verify | IN_PROGRESS | - |
| [S14](steps/S14-gemini-provider.md) | Gemini 제공자(어댑터, 발급 안내, 기본 추천, 무료 플랜 주의) | S08, S09 | `core/llm`, `ui/setup-wizard` | llm-provider-adapter, setup-wizard | DONE | 보류 |
| [S15](steps/S15-on-device-ai.md) | 휴대폰 안 AI(Android ML Kit Gemini Nano, 짧은 결과만, 진단 정보 안내) | S09, S13 | `core/llm`, `core/generate`, `app/platform` | llm-provider-adapter, generation-validator | DONE | 보류 |

상태 값: `TODO` → `IN_PROGRESS` → `DONE`. 수동 검증 값: `-`(없음) / `보류`(backlog에 있음) / `완료`.

S07은 S00만 끝나면 다른 단계와 병행할 수 있다(문서 조사와 설정값 확정 위주).

## 단계 문서 형식

각 `steps/SXX-*.md`는 다음 절을 가진다.

1. 머리 표: 선행, DESIGN 참조 절, 모듈, 관련 스킬
2. 목표
3. 착수 전 확정 (없으면 "없음")
4. 범위 In / Out
5. 산출물 (파일 경로)
6. 설계 상세
7. 테스트 요구사항 (단위 / E2E / 네트워크)
8. 검증 게이트 (자동 / 수동)
9. 완료 정의 (체크박스)
10. 검증 기록 (마무리 때 작성)

## 공통 자동 게이트 (모든 단계)

`scripts/verify.sh full`이 PASS여야 한다. 내용은 `.claude/skills/sermon-verify/SKILL.md`를 따른다. 단계 문서의 자동 게이트는 이 공통 게이트에 **더해지는** 항목이다.
