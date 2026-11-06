# S13. 앱 패키징 (Capacitor, Android·iOS)

| 항목 | 값 |
|---|---|
| 선행 | S12 |
| DESIGN 참조 | 1.2, 2.1, 2.1.2, 2.2, 10장 (v0.18) |
| 모듈 | `capacitor.config.ts`, `android/`, `ios/`, `src/app/platform.ts`, `vite.config.ts` |
| 관련 스킬 | `sermon-verify`, `local-backup`, `bible-txt-import` |

## 목표
같은 웹 코드를 Android·iOS 앱으로 묶는다. 서버 없이, 원격 자산 없이, 외부 통신은 LLM 제공자 호출뿐이다.

## 착수 전 확정
없음(2026-11-05 사용자 결정: 앱 형태로 배포). 앱 식별자는 가칭 `app.opensermon.meditation`, 스토어 등록·서명은 사용자.

## 범위
- **In**: Capacitor 8 설치(2주 이상 지난 버전), `capacitor.config.ts`(webDir `dist`, `server.url` 없음, CapacitorHttp 끔), 앱 모드 빌드(서비스 워커 등록 안 함), `android/`·`ios/` 생성, 파일 내보내기 공유 시트(백업, 샘플 양식), 외부 링크 기본 브라우저, Android 디버그 APK 빌드 스크립트, 정적 점검(원격 server.url 금지, 앱 자산에 sw.js 없음), 린트·검사 대상에서 네이티브 폴더 제외.
- **Out**: 스토어 등록, 릴리스 서명, iOS 빌드(macOS 필요), 푸시·생체 인증 등 네이티브 기능.

## 산출물
```
capacitor.config.ts
android/, ios/
src/app/platform.ts           # isNativeApp, saveFile
src/main.tsx                  # 앱 모드에서 SW 등록 안 함
package.json                  # build:app, android:debug, cap 의존성
scripts/verify.sh             # static:app-config
tests/unit/app/platform.test.ts
```

## 설계 상세
- 의존성: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/filesystem`, `@capacitor/share` — 같은 8.x, 배포 후 2주 이상 지난 버전.
- `saveFile(name, blob)`: 브라우저는 Blob 앵커 내려받기, 앱은 `Filesystem.writeFile(Directory.Cache)` 후 `Share.share({ files })`.
- 외부 링크: 별도 플러그인 없이 기존 `<a target="_blank" rel="noopener noreferrer">`를 쓴다. 앱에서는 Capacitor WebView가 `localhost` 밖 주소를 기기 기본 브라우저로 넘긴다(2026-11-05 SM-S931N에서 확인: Chrome이 열리고 앱 WebView는 그대로). 사용자가 누를 때만 열린다.
- 빌드 모드: `vite build --mode app` → `VITE_APP_TARGET=app`. 이 모드에서는 PWA 플러그인의 등록 코드를 넣지 않는다.

## 테스트 요구사항
- 단위: `platform` 브라우저 경로(앵커 내려받기), 앱 경로(모의 Filesystem·Share 호출 순서, 파일 이름).
- 정적: `capacitor.config.ts`에 `server.url` 없음, `android/app/src/main/assets/public`에 `sw.js` 없음(앱 빌드 후).
- 빌드: `npm run android:debug` 성공(로컬 SDK가 있을 때).
- 기존 웹 게이트 전부 통과.

## 검증 게이트
- 자동: `scripts/verify.sh full` PASS, Android 디버그 APK 빌드.
- 수동: Android 실기기 설치 후 오프라인 본문·선택·원고·백업 공유·txt 가져오기·외부 링크·실제 키로 초안 생성. iOS 빌드와 실기기(macOS 필요).

## 완료 정의
- [ ] Android 디버그 APK 빌드와 실기기 설치
- [ ] 앱 모드에 서비스 워커 없음, 원격 자산 없음
- [ ] 백업·샘플 양식 내보내기가 앱에서 공유 시트로 동작
- [ ] 외부 링크가 사용자 누름에만 기기 브라우저로 열림

## 검증 기록
