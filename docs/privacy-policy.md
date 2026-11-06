---
title: 말씀 묵상 개인정보처리방침 / Scripture Meditation Privacy Policy
---

# 말씀 묵상 개인정보처리방침

**시행일: 2026년 11월 6일**

JuanStudio(이하 "개발자")는 앱 **말씀 묵상**(영문명 Scripture Meditation, Android 패키지명 `com.juanstudio.open_sermon`, 이하 "앱")을 만들고 운영합니다. 이 방침은 앱이 어떤 정보를 다루는지 설명합니다.

## 1. 개발자가 수집하는 개인정보

개발자는 **개인정보를 수집하지 않습니다.** 앱에는 개발자가 운영하는 서버가 없습니다. 회원가입·로그인 기능도 없습니다. 이름, 이메일, 연락처, 위치, 기기 식별자를 요청하거나 개발자에게 보내지 않습니다. 광고, 분석(통계), 오류 수집 도구도 쓰지 않습니다.

## 2. 기기에 저장되는 정보

아래 정보는 **사용자의 기기 안에만** 저장되며 개발자에게 전송되지 않습니다.

- 설정(화면 언어, 역본, 글자 크기 등), 말씀 구성표, 라이브러리, 페르소나 선택값
- 사용자가 올린 설교 원고와 그 발췌, 스타일 프로필
  - 원고를 처리하기 전에 사용자의 동의를 받습니다.
  - 이름·연락처·교회명·주소처럼 보이는 부분은 기기 안에서 가린 뒤 저장합니다.
  - 원고는 기기 안에서 암호화해 저장합니다.
- 사용자가 입력한 AI 제공자 API 키
  - 기기 안에서 암호화해 저장합니다.
  - 화면에는 마지막 4자리만 표시합니다.
- 사용자가 직접 가져온 txt 역본, 사용자의 동의 기록, 기기 안 사용 횟수(하루 AI 요청 횟수 제한용)

앱을 삭제하거나 앱 데이터를 지우면 함께 삭제됩니다. 원고는 앱 안에서 언제든 지울 수 있습니다. 원고를 지우면 발췌와 스타일 프로필도 함께 지워집니다.

기기에서 Android 백업이 켜져 있으면 이 데이터가 사용자 본인의 Google 계정 백업에 포함될 수 있습니다. 이 백업은 Google이 관리하며 개발자는 볼 수 없습니다.

앱의 "백업 파일 만들기"로 만든 파일은 사용자가 정한 비밀번호로 암호화됩니다. 사용자가 직접 저장하거나 보낼 곳을 고릅니다. 앱이 이 파일을 어디로도 보내지 않습니다. API 키와 가져온 역본은 기본적으로 백업 파일에 넣지 않습니다.

## 3. AI 제공자로 보내는 정보 (사용자가 연결한 경우만)

AI 기능(말씀 나눔 초안, 삶에 닿는 예시, 가벼운 한마디, 스타일 프로필)은 **사용자가 본인의 API 키로 AI 제공자를 연결한 경우에만** 동작합니다. 연결하지 않아도 본문 읽기, 원고, 말씀 구성표, 라이브러리 기능은 모두 쓸 수 있습니다.

AI 기능을 쓰면 요청은 개발자를 거치지 않고 **기기에서 사용자가 고른 제공자로 바로** 보내집니다. 보내는 내용은 다음과 같습니다.

- 선택한 성경 구절의 본문과 참조
- 페르소나 선택값(전통 경향, 강조점, 말투, 대상, 길이 등)
- 사용자가 외부 전송에 동의한 경우에만: 가려진 원고 발췌와 스타일 프로필
  - 스타일 프로필을 만들 때는 가려진 원고 앞부분을 보냅니다. 보내기 전에 따로 확인을 받습니다.
- API 키(요청 인증용)

보낸 정보는 각 제공자의 약관과 개인정보처리방침에 따라 처리됩니다. 개발자는 이 정보를 받거나 볼 수 없습니다.

- Google Gemini API: [Gemini API 추가 서비스 약관](https://ai.google.dev/gemini-api/terms), [Google 개인정보처리방침](https://policies.google.com/privacy). 무료 등급에서는 보낸 내용이 Google 서비스 개선에 쓰이거나 사람이 검토할 수 있습니다.
- Anthropic Claude API: [Anthropic 개인정보처리방침](https://www.anthropic.com/legal/privacy)

## 4. 휴대폰 안 AI (Android)

지원되는 Android 기기에서는 Google의 휴대폰 안 AI(ML Kit GenAI, Gemini Nano)를 고를 수 있습니다.

- 글 생성은 기기 안에서 이루어지며 입력한 글과 결과는 기기 밖으로 나가지 않습니다.
- 다만 ML Kit SDK가 **진단 정보와 사용 통계**를 Google에 보낼 수 있습니다. 입력한 글과 결과는 포함되지 않습니다.
- [ML Kit 약관](https://developers.google.com/ml-kit/terms)과 [Google 개인정보처리방침](https://policies.google.com/privacy)이 적용됩니다.

## 5. 후원 결제 (Android)

만든이 화면의 "커피 한 잔 사 주기"는 **Google Play 결제 시스템**으로 처리되며, 사용자가 누를 때만 동작합니다.

- 결제 수단, 이름, 청구 정보는 Google이 처리하며 개발자에게 전달되지 않습니다.
- 앱은 결제가 완료되었는지만 확인합니다.
- [Google 개인정보처리방침](https://policies.google.com/privacy)이 적용됩니다.

## 6. 권한

앱은 Android에서 다음 권한만 사용합니다.

- 인터넷과 네트워크 상태 확인: AI 제공자 요청과 Google Play 결제용
- Google Play 결제(`com.android.vending.BILLING`)
- 휴대폰 안 AI 서비스 연결(`com.google.android.apps.aicore.service.BIND_SERVICE`)

카메라, 마이크, 연락처, 위치, 저장소 권한은 사용하지 않습니다. 원고와 역본 파일은 사용자가 시스템 파일 선택 화면에서 고른 파일만 읽습니다.

## 7. 제3자 제공

개발자는 개인정보를 수집하지 않으므로 제3자에게 제공하거나 판매하지 않습니다. 3~5절의 전송은 사용자가 그 기능을 직접 사용할 때 기기에서 해당 회사로 바로 이루어집니다.

## 8. 아동의 개인정보

앱은 누구의 개인정보도 수집하지 않으며, 만 14세 미만 아동의 개인정보도 수집하지 않습니다.

## 9. 방침의 변경

이 방침이 바뀌면 이 페이지에 변경 내용과 새 시행일을 게시합니다.

## 10. 문의

- 개발자: JuanStudio
- 이메일: kortie00@gmail.com
- GitHub Issues: <https://github.com/kortie/open_sermon/issues>

---

# Scripture Meditation Privacy Policy

**Effective date: November 6, 2026**

JuanStudio ("the developer") makes the app **Scripture Meditation** (Korean name 말씀 묵상, Android package `com.juanstudio.open_sermon`, "the app"). This policy explains what information the app handles.

## 1. Personal information the developer collects

The developer **does not collect personal information.** The app has no developer-run server and no sign-up or login. It never asks for your name, email address, contacts, location or device identifiers, and it sends none of them to the developer. It contains no ads, analytics or crash-reporting tools.

## 2. Information stored on your device

The following is stored **only on your device** and is never sent to the developer:

- Settings (language, Bible translation, font size and so on), message outlines, library items and persona choices
- Sermon manuscripts you add, their excerpts, and your style profile
  - The app asks for your consent before processing a manuscript.
  - Parts that look like names, phone numbers, church names or addresses are masked on the device before saving.
  - Manuscripts are encrypted on the device.
- API keys you enter for an AI provider
  - Keys are encrypted on the device.
  - Only the last 4 characters are shown on screen.
- Bible translations you import from txt files, your consent records, and an on-device usage count (for the daily AI request limit)

This data is deleted when you uninstall the app or clear its data. You can delete a manuscript in the app at any time. Its excerpts and your style profile are deleted with it.

If Android backup is turned on for your device, this data may be included in your own Google account backup. That backup is managed by Google and is not visible to the developer.

Files made with "Make backup file" are encrypted with a password you choose. You decide where to save or send them; the app never sends them anywhere. API keys and imported translations are left out of backup files by default.

## 3. Information sent to an AI provider (only if you connect one)

AI features (message drafts, everyday examples, light remarks, style profile) work **only after you connect an AI provider with your own API key**. Without one, reading, manuscripts, outlines and the library all still work.

When you use an AI feature, the request goes **directly from your device to the provider you chose**, never through the developer. It contains:

- The text and reference of the Bible verses you selected
- Your persona choices (tradition tendency, emphasis, tone, audience, length and so on)
- Only if you agreed to external transfer: masked manuscript excerpts and your style profile
  - Creating a style profile sends the beginning of your masked manuscripts. The app asks you to confirm before it sends them.
- Your API key, to authenticate the request

What you send is handled under that provider's terms and privacy policy. The developer cannot receive or see it.

- Google Gemini API: [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms), [Google Privacy Policy](https://policies.google.com/privacy). On the free tier, content you send may be used to improve Google's services and may be reviewed by people.
- Anthropic Claude API: [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)

## 4. On-device AI (Android)

On supported Android devices you can choose Google's on-device AI (ML Kit GenAI, Gemini Nano).

- Text is generated on the device; what you enter and the results never leave it.
- The ML Kit SDK may send **diagnostic and usage information** to Google. This does not include your input or the results.
- The [ML Kit Terms](https://developers.google.com/ml-kit/terms) and the [Google Privacy Policy](https://policies.google.com/privacy) apply.

## 5. Donations (Android)

"Buy me a coffee" on the About screen is processed by the **Google Play billing system** and runs only when you tap it.

- Your payment method, name and billing details are handled by Google and are not shared with the developer.
- The app only checks whether a purchase completed.
- The [Google Privacy Policy](https://policies.google.com/privacy) applies.

## 6. Permissions

On Android the app uses only these permissions:

- Internet and network state: for AI provider requests and Google Play billing
- Google Play billing (`com.android.vending.BILLING`)
- Connection to the on-device AI service (`com.google.android.apps.aicore.service.BIND_SERVICE`)

It does not use the camera, microphone, contacts, location or storage permissions. It reads only the manuscript and translation files you pick in the system file picker.

## 7. Sharing with third parties

Because the developer collects no personal information, none is shared with or sold to third parties. The transfers in sections 3–5 happen directly from your device to those companies, only when you use those features.

## 8. Children's privacy

The app collects no personal information from anyone, including children.

## 9. Changes to this policy

If this policy changes, the updated version and its new effective date will be posted on this page.

## 10. Contact

- Developer: JuanStudio
- Email: kortie00@gmail.com
- GitHub Issues: <https://github.com/kortie/open_sermon/issues>
