# S15. 휴대폰 안 AI

| 항목 | 값 |
|---|---|
| 선행 | S09, S13 |
| DESIGN 참조 | 2.2, 3.6.1 (v0.20) |
| 모듈 | `android/app/.../OnDeviceAiPlugin.java`, `src/app/platform.ts`, `src/core/llm/device.ts`, `src/core/generate/device.ts`, `src/core/validate/short.ts`, `src/ui/settings/DeviceAiPanel.tsx`, `src/app/generate/Generate.tsx`, `src/ui/result/ResultPanel.tsx` |
| 관련 스킬 | `llm-provider-adapter`, `generation-validator` |

## 목표
연결 열쇠가 없어도 휴대폰에 들어 있는 OS AI로 삶에 닿는 예시와 가벼운 한마디를 만든다.

## 착수 전 확정
- 2026-11-06 사용자 결정:
  - Ollama처럼 통신하는 방식이 아니라 앱 안(OS 제공) 모델을 쓴다(A안: Android ML Kit GenAI / iOS Foundation Models).
  - ML Kit 진단 정보 전송은 절대 규칙 2의 예외로 허용하고, 개인정보 안내에 적고, CLAUDE.md와 DESIGN을 고친다.
  - 범위는 짧은 결과(예시, 한마디)만. 말씀 나눔 초안은 Gemini나 Claude 연결이 필요하다고 안내한다.

## 범위
- **In**:
  - Android 네이티브 플러그인 `OnDeviceAi`(status, download, generate, 고정 원인 코드), minSdk 26
  - JS 브리지(`src/app/platform.ts`), core 클라이언트와 원인 매핑, 켜기 설정(기본 꺼짐)
  - 짧은 프롬프트(ko/en), 짧은 결과 검증, 기기 생성 흐름(일일 한도·캐시 제외, 본문 길이 상한)
  - 설정 카드(상태, 누를 때만 내려받기, 켜기/끄기, 진단 정보 안내와 링크)
  - 생성 화면 연결(열쇠 없음 + 짧은 결과 + 켜짐 + 준비됨), 초안 연결 없음 안내 한 줄
- **Out**: iOS 플러그인(맥과 Xcode 필요, 후속), 마법사에 휴대폰 안 AI 단계 추가, 초안 생성, 스트리밍, 결과 캐시.

## 산출물
```
android/variables.gradle                  # minSdkVersion 26
android/app/build.gradle                  # com.google.mlkit:genai-prompt:1.0.0-beta4
android/app/src/main/java/app/opensermon/meditation/OnDeviceAiPlugin.java, MainActivity.java
src/app/platform.ts                       # deviceAiBridgeFor, nativeDeviceAi
src/main.tsx                              # setDeviceAiBridge
src/core/llm/device.ts, types.ts          # device_busy / device_unavailable / device_too_long
src/core/generate/device.ts               # buildDevicePrompt, generateOnDevice
src/core/validate/short.ts                # validateShort
src/core/store/settings.ts, preferences.ts # device_ai_enabled
src/prompts/ko/device.json, en/device.json
src/ui/settings/DeviceAiPanel.tsx, src/app/settings/Settings.tsx
src/app/generate/Generate.tsx, src/ui/result/ResultPanel.tsx (only)
src/i18n/ko.json, en.json                 # settings.device_ai.*, generate.device_*, llm.error.device_*
config/app.config.json, app.config.schema.json # on_device_ai
tests/unit/llm/device.test.ts, tests/unit/generate/device.test.ts, tests/unit/validate/short.test.ts, tests/unit/app/platform.test.ts
tests/e2e/device-ai.spec.ts
```

## 테스트 요구사항
- 원인 매핑: busy·quota·background → 바쁨, too_large → 너무 김, unavailable·disk → 준비 안 됨, 그 밖 → 원인 불명. 오류 메시지에 입력 글이 없다.
- 시간 초과와 취소는 바로 끝난다. 이미 취소된 요청은 OS를 부르지 않는다.
- 켜기 설정은 기본 꺼짐. 클라이언트는 브리지 있음 + 켜짐 + 준비됨일 때만.
- 프롬프트: 시스템 지시 150단어 미만, 본문·핵심어·할 일·형식만. 발췌와 스타일 프로필이 들어가지 않는다. 제외 역본, 절 없음, 길이 초과는 호출 전에 막는다.
- 검증: 예시 2개(근거 절 범위, 금지 표현, 복제), 한마디 2개(기준에 안 맞는 것만 빼고 하나도 안 남으면 실패). 재시도 1회 후 독립 결과.
- 일일 한도에 세지 않는다.
- 브라우저 빌드: 설정 카드 없음, 열쇠 없이 예시는 라이브러리로, 초안은 연결 없음 안내. 외부 요청 없음.

## 게이트
- 자동: `scripts/verify.sh full`
- 수동(backlog MV-S15):
  - [ ] Android 실기기에서 설정 카드 상태가 맞게 나오고, "내려받기"를 누를 때만 모델 내려받기가 시작되는지. 진행 표시와 완료 후 "준비됨".
  - [ ] 켜기 후 열쇠 없이 예시와 한마디가 한국어로 검증을 통과해 나오는지. 걸린 시간 기록.
  - [ ] 앱을 뒤로 보냈을 때와 연속 호출 때 바쁨 문구가 나오는지.
  - [ ] 긴 본문(장 전체)에서 "구절을 줄여 달라" 문구가 나오는지.
  - [ ] 열쇠를 연결하면 연결된 제공자를 먼저 쓰는지.
  - [ ] iOS Foundation Models 플러그인 구현과 빌드(맥 필요).

## 완료 정의
- [x] 자동 게이트 PASS
- [x] 검증 기록 작성, 수동 항목 backlog 이관
- [x] 상태 표 갱신

## 검증 기록 (마무리 때 작성)

### 2026-11-06
- 자동: scripts/verify.sh full → PASS (단위 658개, E2E 194개, 네트워크 24개, 커버리지 core 97.85%(lines))
- 단계 게이트:
  - `tests/unit/llm/device.test.ts`, `tests/unit/generate/device.test.ts`, `tests/unit/validate/short.test.ts`, `tests/unit/app/platform.test.ts`(브리지), `tests/e2e/device-ai.spec.ts` → 통과
  - Android 디버그 APK 빌드·설치 → 통과. 실기기(SM-S931N) 플러그인 `status` → "downloadable"
- 수동: 보류 → backlog MV-S15 (6항목). 실기기 내려받기·생성은 휴대폰 잠금 상태라 아직 못 했다.
- 의존성 추가: `com.google.mlkit:genai-prompt:1.0.0-beta4` — Android 기기 안 Gemini Nano 호출(beta5는 2주 미만이라 제외)
- 설계 변경: DESIGN v0.20 (2.2, 3.6.1, 11장 S15), 변경 이력 2026-11-06 행. CLAUDE.md 절대 규칙 2에 ML Kit 진단 정보 예외 추가
- 후속:
  - iOS Foundation Models 플러그인(맥 필요)
  - 마법사에는 휴대폰 안 AI 단계를 넣지 않았다. 설정 카드에서만 켠다.
  - 시스템 지시를 못 쓰는 구형 모델(nano-v3 미만)에서는 지시를 사용자 글 앞에 붙인다(실기기 확인 필요).
