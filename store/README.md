# Google Play 등록 자료 (S16)

| 파일 | 규격 (Play Console 도움말 9866151, 2026-11-06 확인) | 만드는 명령 |
|---|---|---|
| `google-play/icon-512.png` | 512×512 PNG, 1MB 이하 (모서리는 Play가 둥글게 자름) | `npm run store:graphics` |
| `google-play/feature-graphic-ko.png`, `-en.png` | 1024×500 PNG, 알파 없음 | `npm run store:graphics` |
| `google-play/screenshots/ko/*.png`, `en/*.png` | 1080×1920(9:16) PNG, 알파 없음, 언어별 6장 (추천 노출 조건: 4장 이상, 1080px 이상) | `npm run store:screenshots` |

- 스크린샷은 E2E 테스트와 같은 방식으로 실제 앱 빌드를 띄워 찍는다. 생성 결과 화면은 테스트용 모의 응답(`tests/fixtures/llm-responses/ok-*.json`)을 쓰며, 외부로 아무것도 보내지 않는다.
- 아이콘과 그래픽 원본은 `assets/brand/mark.svg`다. 그림을 바꾸면 `npm run icons`와 `npm run store:graphics`를 함께 돌린다.
- 대표 그래픽 문구(`scripts/build-store-graphics.mjs`의 `TAGLINE`)는 화면 문구가 아니라 스토어 전용이다. 내부 용어(CLAUDE.md 절대 규칙 14)를 쓰지 않는다.

## 릴리스 빌드

```bash
cp android/keystore.properties.example android/keystore.properties   # 업로드 키 정보 입력 (커밋 안 됨)
npm run android:release
```

- 결과: `android/app/build/outputs/bundle/release/app-release.aab`(Play 업로드용), `apk/release/`.
- R8 난독화·축소가 켜져 있다. 출시마다 `android/app/build/outputs/mapping/release/mapping.txt`를 Play Console에 올려야 비정상 종료 보고를 읽을 수 있다.
- `keystore.properties`가 없으면 서명 없이 만들어진다(Play에 올릴 수 없음).
