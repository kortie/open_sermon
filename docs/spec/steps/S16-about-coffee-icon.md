# S16. 만든이 화면, 커피 사 주기, 앱 아이콘과 시작 화면

| 항목 | 값 |
|---|---|
| 선행 | S12, S13 |
| DESIGN 참조 | 2.2, 3.17, 8장 (v0.21) |
| 모듈 | `src/app/about/About.tsx`, `src/app/platform.ts`, `src/ui/Menu.tsx`, `android/app/.../CoffeePlugin.java`, `assets/brand/mark.svg`, `scripts/build-icons.mjs`, `scripts/build-notices.mjs` |
| 관련 스킬 | `sermon-verify` |

## 목표
사이드 메뉴에서 만든이(JuanStudio), 문의 메일, 라이선스를 볼 수 있고, Android에서는 Google Play 결제로 만든이에게 커피를 사 줄 수 있다. 앱 아이콘과 시작 화면을 새 그림으로 바꾼다.

## 착수 전 확정
- 2026-11-06 사용자 결정:
  - 라이선스: Apache-2.0.
  - 커피 사 주기: Android만(Google Play 소모성 상품 `coffee`), iOS는 숨김. Play 결제 통신은 절대 규칙 2의 예외.
  - 아이콘: 책 + 작은 십자가(남색 바탕). 시작 화면도 같은 그림과 "JuanStudio".
  - 문의 메일: kortie00@gmail.com (사용자 결정 2026-11-06).

## 범위
- **In**:
  - 만든이 화면(앱 이름·버전, JuanStudio, 문의 메일, Apache-2.0 전문, 오픈소스 고지, 본문 출처), 사이드 메뉴 항목
  - `LICENSE`, `NOTICE`, 고지 생성기(`npm run notices`)와 게이트 확인
  - Android `Coffee` 플러그인(Play Billing 9.1.0: 상품 조회, 결제, 바로 소비, 대기 중 결제, 남은 구매 소비), JS 브리지
  - 아이콘·시작 화면 생성기(`npm run icons`, Playwright Chromium으로 SVG 렌더), Android 12+ 시스템 시작 화면 테마, 웹 시작 화면
- **Out**: iOS StoreKit(숨김), 영수증 서버 검증(서버 없음), 구매 기록 저장.

## 산출물
```
assets/brand/mark.svg, scripts/build-icons.mjs        # 아이콘·시작 화면 원본과 생성기
android/app/src/main/res/mipmap-*/, drawable-*/splash*.png, values/ic_launcher_background.xml, values-v31/styles.xml
ios/App/App/Assets.xcassets/AppIcon.appiconset, Splash.imageset
public/icons/*.png, public/manifest.webmanifest, index.html (시작 화면), src/main.tsx (최소 0.6초)
LICENSE, NOTICE, scripts/build-notices.mjs, public/licenses/app.txt, third-party.txt
android/app/build.gradle                              # com.android.billingclient:billing:9.1.0
android/app/src/main/java/com/juanstudio/open_sermon/CoffeePlugin.java, ShellPlugin.java(S17에서 Launch → Shell), MainActivity.java
src/app/platform.ts                                   # coffeeBridgeFor, coffeeFailure, nativeCoffee, APP_VERSION
src/app/about/About.tsx, src/app/router.ts, src/app/App.tsx, src/ui/Menu.tsx, src/app/app.css
src/i18n/ko.json, en.json                             # nav.about, about.*
config/app.config.json, app.config.schema.json        # about, support.coffee
vite.config.ts, vitest.config.ts, src/env.d.ts, package.json (version 1.0.0)
tests/unit/app/platform.test.ts, tests/e2e/about.spec.ts
```

## 테스트 요구사항
- 커피 브리지: 설정된 상품 id를 넘기고, 알려진 필드만 받는다. 이상한 응답은 "없음"/"취소"로, 거절은 고정 원인 코드(network, unavailable, busy, 그 밖 unknown)로.
- 브라우저 빌드에는 커피 브리지와 카드가 없다.
- 만든이 화면: 메뉴로 들어가고, JuanStudio·버전·Apache-2.0이 보이고, 전문과 고지를 펼치고 닫을 수 있다. 360px에서 가로 스크롤이 없고 외부 요청이 없다.
- 문의 메일 버튼은 실제 주소가 있을 때만 `mailto:`로 보인다.
- 시작 화면이 앱이 뜬 뒤 사라진다. 웹 시작 화면 최소 시간은 브라우저에만 있고, 앱에서는 준비 신호를 보낸다(브라우저에서는 아무것도 안 함).
- 고지 파일이 `node_modules`와 맞는다(`build-notices --check`, 정적 점검).

## 게이트
- 자동: `scripts/verify.sh full`
- 수동(backlog MV-S16):
  - [ ] Play Console에 일회성 상품 `coffee`(소모성)를 만들고 내부 테스트 트랙 빌드에서 가격 표시, 결제, "고맙습니다", 다시 사기가 되는지.
  - [ ] 대기 중 결제(테스트 카드 "느린 결제")에서 "처리 중"이 보이고, 결제가 끝난 뒤 다음 실행에서 소비되는지.
  - [ ] Play 배포가 아닌 디버그 빌드에서는 커피 카드가 숨겨지는지.
  - [ ] Android 실기기에서 새 아이콘(적응형, 둥근 모양)과 시작 화면(Android 12+ 시스템 시작 화면, 웹 시작 화면 이어짐)이 자연스러운지.
  - [ ] "메일 보내기"가 메일 앱을 kortie00@gmail.com으로 여는지.
  - [ ] 오픈소스 고지의 네이티브 라이브러리(AndroidX, ML Kit, Play Billing) 약관 표기를 공식 문서로 확인.
  - [ ] iOS 아이콘·시작 화면 확인과 커피 숨김(맥 필요).
  - [ ] 업로드 키를 만들어 `android/keystore.properties`에 넣고, 서명된 AAB를 Play Console 내부 테스트 트랙에 올린다. `mapping.txt`도 함께 올린다.
  - [ ] 스토어 등록정보에 `store/google-play/`의 아이콘, 대표 그래픽, 스크린샷을 올리고 화면에서 잘리는 곳이 없는지 본다.

## 완료 정의
- [x] 자동 게이트 PASS
- [x] 검증 기록 작성, 수동 항목 backlog 이관
- [x] 상태 표 갱신

## 검증 기록 (마무리 때 작성)

### 2026-11-06
- 자동: scripts/verify.sh full → PASS (단위 663개, E2E 200개, 네트워크 24개, 커버리지 core 97.85%(lines))
- 단계 게이트:
  - `tests/unit/app/platform.test.ts`(커피 브리지), `tests/e2e/about.spec.ts`, 정적 점검 `static:notices` → 통과
  - Android 디버그 APK 빌드·설치 → 통과. 실기기 화면 확인은 휴대폰이 잠겨 있어 못 했다.
- 수동: 보류 → backlog MV-S16 (7항목)
- 의존성 추가: `com.android.billingclient:billing:9.1.0` — Android "커피 사 주기" Google Play 결제(2026-06-18 배포)
- 설계 변경: DESIGN v0.21 (2.2 Play 결제 예외, 3.17, 8장 메뉴, 11장 S16), 변경 이력 2026-11-06 행. CLAUDE.md 절대 규칙 2에 두 번째 예외 추가
- 검증 스크립트 조정:
  - 첫 실행에서 E2E 1건(`independent-flow.spec.ts` 홈 확인)이 실패했다. 시작 화면(최소 0.6초) 때문에 마법사가 뜨기 전에 "건너뛰기 버튼이 있는지"를 한 번만 보고 넘어간 탓이다. 마법사나 홈 중 하나가 뜰 때까지 기다리도록 고쳤다(확인 내용은 그대로).
  - `dist-no-txt-bibles`가 라이선스 파일 두 개(`dist/licenses/app.txt`, `third-party.txt`)에 걸렸다. 이 두 경로만 정확히 허용했다.
- 후속:
  - 문의 메일 kortie00@gmail.com을 `about.contact_email`에 넣었다.
  - 오픈소스 고지의 네이티브 라이브러리 약관 표기는 공식 문서 확인 전이다.

### 2026-11-06 (시작 화면 수정)
- 사용자 보고: 시작 화면이 두 번 나온다. 실기기 연속 캡처로 확인: Android 12 시스템 시작 화면(큰 아이콘, 아래 JuanStudio) 뒤에 웹 시작 화면(작은 아이콘, 가운데 JuanStudio)이 약 0.8초 더 나왔다.
- 수정: 앱에서는 시스템 시작 화면을 웹 첫 화면이 그려질 때까지 붙잡고(`MainActivity` OnPreDrawListener, 최대 3초), 웹이 `Launch.ready`로 알린다(S17에서 `Shell.ready`로 이름 변경). 웹 시작 화면 최소 0.6초는 브라우저에만 둔다.
- 실기기 재확인: 홈 → 시스템 시작 화면 → 앱 첫 화면, 시작 화면 한 번.

### 2026-11-06 (릴리스 빌드, 스토어 자료)
- 사용자 요청: 릴리스 빌드 난독화, 스토어 등록용 앱 아이콘·그래픽 이미지·스크린샷.
- 릴리스: `minifyEnabled true`, `shrinkResources true`, `proguard-android-optimize.txt`. 앱 규칙은 줄 번호만 남기고 원본 파일 이름 숨김(플러그인 클래스는 Capacitor 소비자 규칙이 지킴). 업로드 키는 `android/keystore.properties`(gitignore, 예시 파일 `keystore.properties.example`), 없으면 서명 없이 빌드. `npm run android:release` → AAB 7.0MB, APK 6.0MB(디버그 15.8MB).
- 실기기: 릴리스 APK를 디버그 키로 임시 서명해 설치. 디버그 불가(flags=0x0) 상태로 실행, 비정상 종료 없음, 시작 화면이 약 0.6초에 걷힘(Launch 플러그인이 난독화 뒤에도 동작).
- 스토어 자료(`store/`): 규격은 Play Console 도움말 9866151(2026-11-06 확인). 512 아이콘, 대표 그래픽 ko·en(1024×500, 알파 없음), 스크린샷 ko·en 각 6장(1080×1920, 알파 없음; 홈, 구절 선택, 예시와 한마디, 읽기, 말씀 구성표, 만든이). 생성 결과 화면은 테스트 모의 응답을 쓴다.
- 새 명령: `npm run android:release`, `store:screenshots`, `store:graphics`.
