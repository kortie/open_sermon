# CLAUDE.md — 성경 묵상 앱 (서버 없음)

이 파일은 Claude Code가 이 저장소에서 작업할 때 따라야 할 규칙이다. 상세 설계는 `docs/DESIGN.md`(v0.20)를 기준으로 하고, 단계별 범위와 검증은 `docs/spec/`(상태 표 `docs/spec/README.md`, 단계 문서 `docs/spec/steps/SXX-*.md`)를 따른다. 설계와 이 파일이 충돌하면 작업을 멈추고 사용자에게 확인한다.

---

## 1. 프로젝트 개요

성경 본문을 읽고, 구절을 기준으로 말씀 나눔 초안, 삶에 닿는 예시, 가벼운 한마디를 얻는 **모바일 앱(Android, iOS)**이다. 하나의 웹 코드를 Capacitor로 감싸 두 플랫폼 앱으로 배포한다(DESIGN 2.1.2, v0.18).

- **서버가 없다.** 정적 웹 자산과 본문 DB를 앱 패키지 안에 넣어 배포하고, 모든 데이터와 실행은 기기 안에서 한다. 앱이 원격 웹 자산을 불러오지 않는다(Capacitor `server.url` 금지).
- 외부 통신은 사용자가 선택한 LLM 제공자의 공식 API 호출뿐이다. 예외: 휴대폰 안 AI(Android ML Kit GenAI)의 SDK 진단 정보 전송(DESIGN 2.2, 3.6.1, v0.20).
- 스택: TypeScript, Vite, React, sql.js(번들 `bible.sqlite` 읽기), IndexedDB(사용자 데이터), WebCrypto(암호화), Capacitor 8(앱 래핑, 파일 공유, 휴대폰 안 AI 네이티브 플러그인 `OnDeviceAi`), Vitest, Playwright(모바일 뷰포트 테스트, 브라우저 빌드 기준)

---

## 2. 절대 규칙

1. **백엔드, 서버, 중계 서버를 만들지 않는다.** Node 서버, Python 서버, 서버리스 함수, 프록시를 추가하지 않는다. 필요하다고 판단되면 구현하지 말고 사용자에게 먼저 묻는다.
2. **외부 네트워크 요청은 LLM 제공자 API 호출만 허용한다.** 분석 도구, 오류 수집기, 외부 폰트, CDN 스크립트, 이미지 원격 로딩을 넣지 않는다. CSP `connect-src`는 제공자 엔드포인트로 제한한다. **유일한 예외**: 휴대폰 안 AI용 ML Kit GenAI SDK(`com.google.mlkit:genai-prompt`)가 보내는 진단·사용 통계(입출력 글 제외). 설정의 휴대폰 안 AI 카드에 알리고, 그 밖의 SDK 전송은 추가하지 않는다(사용자 결정 2026-11-06).
3. **독립 모드 경로는 LLM 모듈을 import하지 않는다.** `bible`, `bible-import`, `selection`, `sermon`(스타일 프로필 생성 호출은 `generate`에 둔다), `compose`, `persona`, `validate`, `vault`, `backup`, `store`는 `llm`과 `generate`에 의존하지 않는다. 린트 규칙으로 강제한다.
4. **사용자 키는 non-extractable CryptoKey로 암호화해 IndexedDB에 저장한다.** 평문 저장, localStorage, sessionStorage, 콘솔 출력, 오류 메시지 포함을 금지한다. 화면에는 마지막 4자리만 표시한다.
5. **사용자 비밀번호를 받거나 저장하지 않는다.** 웹 로그인 자동화 코드를 작성하지 않는다.
6. **운영자 공용 키를 앱에 넣지 않는다.** 클라이언트 번들에 들어간 키는 누구나 꺼낼 수 있다. 기본 경로는 사용자가 본인 키를 입력하는 방식이다.
7. **사용자 원고는 동의 기록이 있어야 처리한다.** 파싱, 마스킹, 청크는 기기 안에서 하고, 원문과 청크는 암호화해서 저장한다.
8. **원고와 생성 결과를 로그에 남기지 않는다.** `console.log`로 사용자 데이터를 출력하지 않는다.
9. **LLM 출력은 텍스트로만 렌더링한다.** `dangerouslySetInnerHTML`과 `innerHTML`을 쓰지 않는다. 마크다운을 쓸 경우 허용 목록 기반 정제를 거친다.
10. **생성 결과는 검증 후 보여준다.** 근거 절 범위, 길이, 금지 표현, 유머 기준, 복제 검사(연속 20자 이상 일치)를 통과해야 한다.
11. **실존 목회자 이름을 페르소나나 프롬프트에 넣지 않는다.** 교단은 "전통 경향" 수준으로만 표현한다.
12. **앱은 권리 있는 역본의 본문을 포함하거나 내려받기 링크를 만들지 않는다.** 개역개정, 쉬운성경, 메시지, 새번역 계열 등은 번들, 배포, 내려받기 링크 모두 금지다. 공식 열람처 링크(읽기 전용)만 둘 수 있다.
13. **모바일 전용이다.** 호버, 우클릭, Shift 클릭 같은 데스크톱 전용 인터랙션을 구현하지 않는다. 본문 선택은 롱터치가 기본이고 체크 영역과 직접 입력이 대체 수단이다.
14. **화면 문구는 노출 이름을 쓴다.** "설교 생성", "예문", "유머", "골격", "발췌 검색"은 화면과 메시지에 쓰지 않는다. 대응표는 DESIGN.md 3.0 참고.
15. **본문 원문은 LLM이 만들지 않는다.** 인용은 번들 DB 원문을 프롬프트에 넣어 처리한다.
16. **화면 문자열은 `src/i18n/ko.json`, `en.json`에서만 관리한다.** 컴포넌트에 한국어나 영어 문자열을 직접 쓰지 않는다. 두 파일의 키 목록이 일치하는지 린트로 확인한다.
17. **기본 역본은 언어별로 고정한다.** 한국어는 개역한글(krv), 영어는 KJV(kjv). NIV는 라이선스 확인 전까지 번들, 배포, 프롬프트 인용 모두 금지한다.
18. **설정 마법사는 건너뛸 수 있어야 하고, 건너뛰어도 독립 기능이 동작해야 한다.** 마법사 안에서 외부 링크를 앱이 미리 열거나 요청하지 않는다. 키 검증은 사용자가 버튼을 누를 때 한 번만 한다.
19. **마법사 안내 문구는 `src/i18n/`의 ko, en 파일에서만 관리한다.** 발급 절차 문구는 제공자 공식 문서 확인 후에만 수정하고, 수정 날짜를 `docs/PROVIDERS.md`에 기록한다.
20. **마법사에서 고를 수 있는 제공자는 `browser_direct_verified`가 `true`인 것뿐이다.** `false`인 제공자는 사유(`unavailable_reason`)를 적은 비활성 카드로만 보여줄 수 있고, 누르거나 고를 수 없다(DESIGN 3.13, v0.15). 검증 전 제공자를 "추천"으로 표시하지 않는다.
21. **사용자가 가져오는 txt 역본은 권리 확인 체크 후에만 저장한다.** txt 외 형식은 받지 않는다. 가져온 역본은 기본적으로 백업과 배포에서 제외한다. 역본 본문을 생성 결과에 절 단위로 재인용하지 않도록 프롬프트에 지시하고, 복제 검사를 이 본문에도 적용한다.
22. **내려받기 링크는 `config/bible-sources.json`에서만 관리한다.** 퍼블릭 도메인으로 확인되고 확인 날짜가 있는 항목만 "내려받기" 버튼으로 보여준다. 링크는 사용자가 누를 때만 열린다.
23. **URL은 `config/`에서만 관리한다.** `src/`에 `http://`, `https://` 문자열을 직접 쓰지 않는다(제공자 엔드포인트, 발급 안내 링크, 역본 링크 모두 config에서 읽는다).

---

## 3. 디렉터리 구조

```
open_sermon/
├── CLAUDE.md
├── docs/
│   ├── DESIGN.md            # 설계 (v0.20)
│   ├── PROVIDERS.md         # 제공자 브라우저 직접 호출 확인 기록 (S07)
│   └── spec/
│       ├── README.md        # 단계 상태 표
│       ├── manual-verification-backlog.md  # 보류된 수동 검증 항목
│       └── steps/           # S00~S11 단계 문서
├── scripts/
│   └── verify.sh            # 검증 게이트 (quick | full)
├── .claude/
│   └── skills/              # 프로젝트 스킬 (섹션 5)
├── public/
│   ├── data/bible.sqlite    # crizin/bible-db 릴리스 원본에서 krv·kjv만 뽑은 파생 DB (npm run db:build, 해시 검증)
│   ├── manifest.webmanifest
│   └── icons/
├── src/
│   ├── app/                 # 화면 라우팅, 레이아웃
│   ├── core/
│   │   ├── bible/           # sql.js 로딩, 조회, 참조 파서
│   │   ├── bible-import/    # txt 역본 가져오기 (형식 판별, 인코딩, 검사, 미리보기, 저장)
│   │   ├── selection/       # 롱터치 상태 머신, 범위 정규화
│   │   ├── sermon/          # 업로드, 동의, 마스킹, 청크, 발췌 점수화, 스타일 프로필
│   │   ├── compose/         # 말씀 구성표 템플릿, 라이브러리 검색
│   │   ├── persona/         # 선택값 검증, 블록 조합
│   │   ├── llm/             # 제공자 인터페이스와 어댑터 (fetch)
│   │   ├── generate/        # 초안, 예시, 한마디 오케스트레이션
│   │   ├── validate/        # 구조, 유머, 복제 검사
│   │   ├── vault/           # WebCrypto 암호화, 키 저장, 마스킹 표시
│   │   ├── backup/          # 암호화 내보내기, 가져오기
│   │   └── store/           # IndexedDB 래퍼
│   ├── i18n/                # ko.json, en.json (화면 문자열, 노출 이름, 마법사 안내 문구)
│   ├── ui/setup-wizard/     # 설정 마법사 화면 (단계별 컴포넌트)
│   ├── prompts/             # 프롬프트 템플릿 (언어별 두 벌, 버전 문자열 포함)
│   └── ui/                  # 공통 컴포넌트
├── tests/
│   ├── unit/
│   ├── e2e/                 # 모바일 뷰포트, 롱터치 시나리오
│   └── network/             # 독립 모드 중 외부 요청이 없는지 확인
├── config/
│   ├── app.config.json
│   └── bible-sources.json   # 역본 열람처·내려받기 링크 레지스트리 (S11)
├── android/               # Capacitor Android 프로젝트 (npx cap sync로 dist 복사, 빌드 산출물은 커밋 안 함)
├── ios/                   # Capacitor iOS 프로젝트 (macOS·Xcode에서 빌드)
├── capacitor.config.ts
├── index.html
├── vite.config.ts
├── package.json
└── .env.example             # 빌드 시점 설정만 (비밀값 없음)
```

---

## 4. 개발 규칙

### 4.1 공통
- 작업 전 `docs/DESIGN.md`의 관련 절을 읽는다.
- 새 기능은 테스트와 함께 작성한다.
- 단계 작업은 `sermon-step` 스킬 절차를 따른다. `docs/spec/README.md` 상태 표의 순서를 지키고, 단계 문서의 검증 게이트(`sermon-verify`)를 통과한 뒤 다음 단계로 넘어간다.
- 의존성을 추가할 때는 이유를 한 줄로 남긴다. 서버 관련 패키지(express, fastify 등)는 추가하지 않는다.

### 4.2 보안 기본값
- **CSP**(`index.html` 메타. 앱과 브라우저 빌드 공통): `default-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`(sql.js WASM에 필요), `worker-src 'self'`(서비스 워커, PDF 파싱 워커), `connect-src 'self' <제공자 엔드포인트 목록>`, `img-src 'self' data: blob:`, `style-src 'self'`(인라인 스타일 최소화), `object-src 'none'`, `base-uri 'self'`. 메타 태그에서는 `frame-ancestors`가 무시되므로 호스팅 헤더로 설정할 수 있으면 함께 둔다.
- 제공자 엔드포인트 목록은 `config/app.config.json`의 `providers`에서 생성한다. 목록에 없는 도메인으로의 요청은 실패해야 한다.
- 번들 DB는 `public/data/bible.sqlite`에 두고, `npm run db:build`가 릴리스 원본 해시(`release_sha256`)를 확인한 뒤 krv·kjv만 뽑아 만든다(DESIGN 2.1.1). 빌드 후 SHA-256을 `app.config.json`의 `sha256`과 대조하는 검증 스크립트를 실행한다.

### 4.3 프런트엔드
- 상태 관리는 최소화한다. 서버 상태 라이브러리는 필요 없다. 화면 상태는 React 상태 또는 간단한 스토어로 관리한다.
- 앱 모드(`build:app`)는 서비스 워커를 등록하지 않는다. 파일 내보내기는 앱에서 공유 시트(`@capacitor/share`)로, 외부 링크는 기기 기본 브라우저로 연다. 플랫폼 분기는 `src/app/platform.ts`에만 둔다.
- 앱 화면에는 고정 상단 메뉴를 두지 않는다. 메뉴는 플로팅 버튼으로 여는 사이드 메뉴다(DESIGN 8장). 읽기 화면 위쪽은 한 줄 도구 막대(책·장, 역본, 검색)만 둔다.
- 모바일 전용: 뷰포트 `width=device-width, initial-scale=1`, 최대 폭 480px 중앙 레이아웃, 터치 타깃 44×44px 이상.
- 롱터치: 임계값 450ms(`ui.long_press_ms`). 본문 영역에서만 `contextmenu`와 기본 텍스트 선택을 막는다. `touchstart`, `touchmove`는 `passive: false`로 등록한다.
- 선택 상태는 Set 기반으로 관리하고, 연속 범위로 정규화한 뒤 참조 문자열을 만든다. 참조 생성은 파서와 같은 규칙을 공유한다.
- 체크 영역에 `aria-pressed`, 스크린리더용 "선택됨" 텍스트를 넣는다.
- 키 입력 필드는 `type="password"`, `autocomplete="off"`, 저장 후 마스킹 표시.
- 결과 화면에는 항상 "AI가 만든 초안입니다. 고쳐 쓰시면 더 좋아요." 안내를 표시한다. 영어 UI에서는 "This is an AI-generated draft. Revise it to make it your own."를 쓴다.
- 언어 전환 시 화면 문자열, 노출 이름, 페르소나 선택지 라벨이 즉시 바뀐다. 사용자 데이터는 건드리지 않는다.
- 언어 전환 시 기본 역본을 함께 바꾸되, 사용자가 역본을 직접 고른 적이 있으면 그 선택을 유지한다.
- 마법사는 한 화면에 한 가지 행동만 요구한다. 단계 수는 `config`의 `wizard.steps`로 관리한다.
- 키 입력칸은 붙여넣기를 기본으로 하고, 제공자 접두사 힌트를 보여준다. 전송 전에 형식이 맞지 않으면 안내를 먼저 띄운다.
- 실패 메시지는 3.13.3 표의 원인별 문구를 쓴다. 원인을 알 수 없으면 "연결에 실패했습니다. 키를 다시 확인해 주세요"를 쓰고 원인을 추측하지 않는다.
- 글자 크기는 기본 16px이고, 설정에서 `ui.font_size_px.options` 단계로 키울 수 있다. 모든 글자 크기는 `rem`으로 쓰고 루트 글자 크기만 바꾼다. 가장 큰 단계에서도 360px 가로 스크롤이 없어야 한다. 마법사는 줄 간격을 여유 있게 둔다. 고령 사용자를 고려해 버튼 라벨은 동사로 짧게 쓴다.

### 4.4 저장소와 암호화
- IndexedDB 접근은 `core/store`를 거친다. 화면 컴포넌트가 IndexedDB를 직접 열지 않는다.
- 암호화 키 생성: `crypto.subtle.generateKey`, `extractable: false`, 저장은 `crypto_key` 스토어.
- 암호화: AES-GCM, IV는 매번 새로 만든다(`crypto.getRandomValues`, 12바이트). IV를 재사용하지 않는다.
- 백업 암호화: PBKDF2(SHA-256, 반복 횟수는 `config`에서 읽음) 후 AES-GCM. 키 파생 결과를 저장하지 않는다.
- 원고 삭제는 `sermon_meta`, `sermon_body`, `sermon_chunk`, 관련 `style_profile`을 한 트랜잭션에서 모두 지운다.

### 4.5 LLM 어댑터
- 모든 제공자는 `LlmClient` 인터페이스만 구현한다: `generate(system, user, opts)`, `validateKey()`.
- 호출은 `fetch`로 하고, 헤더에만 키를 넣는다. 오류 객체에서 헤더 값을 제거한 뒤 던진다.
- 브라우저 직접 호출이 허용되는지 제공자 공식 문서로 확인하고, 결과를 `docs/PROVIDERS.md`에 기록한다. 확인되지 않은 제공자는 구현하지 않는다.
- 모델명과 엔드포인트는 `app.config.json`에서 읽는다. 코드에 하드코딩하지 않는다.
- 타임아웃은 60초, 재시도는 검증 실패 사유를 모두 합쳐 1회만(DESIGN 7.0). 재시도 호출도 기기별 일일 한도에 포함한다.

### 4.6 테스트 기준
- **참조 파서**: 정상 형식, 한글과 영문 약어, 장만 있는 경우, 절 범위 역순, 길이 초과 입력, 쉼표 목록("요 15:1-8, 12")
- **롱터치 상태**: 진입, 인접 절 탭 확장, 떨어진 절 탭(새 블록), 선택된 절 탭(해제, 블록 분리), 블록 병합, 해제, 취소, 스크롤과의 충돌
- **암호화**: 암호화 후 복호화 일치, 키 추출 불가 확인, 같은 평문도 매번 다른 암호문
- **마스킹**: 이름, 연락처, 교회명, 주소 패턴 제거, 동의 없는 업로드 거부
- **삭제**: 원고, 청크, 프로필이 모두 제거되는지
- **복제 검사**: 연속 20자 일치 감지, 번들 역본 인용 블록과 구성표 인용 블록은 제외, 감지 시 해당 발췌를 빼고 1회 재시도, 다시 실패하면 독립 결과로 대체
- **검증**: 근거 절 범위 밖, 길이 미달과 초과, 유머 금지 주제
- **독립 모드 네트워크 테스트**: 네트워크 요청을 차단하고 본문, 원고, 구성표, 라이브러리, 발췌 검색이 동작하는지 확인
- **외부 요청 테스트**: 생성 기능 외에는 제공자 엔드포인트 외 요청이 없는지 확인
- **모바일 E2E**: 360px, 390px 뷰포트에서 롱터치, 액션 바, 가로 스크롤 없음

---

## 5. 프로젝트 스킬 (.claude/skills)

각 스킬은 `.claude/skills/<name>/SKILL.md`로 만든다.

### 5.1 `bible-reference-parser`
- **설명**: 한국어와 영어 참조 문자열을 (책 번호, 장, 시작절, 끝절)로 바꾸는 작업을 할 때 사용한다.
- **포함**: 책 이름 매핑표(정식명, 약어, 영문 약어), 허용 형식, 오류 코드, 테스트 케이스.
- **규칙**: 화이트리스트 정규식. 입력 길이 상한 50자.

### 5.2 `bible-db-access`
- **설명**: 번들 `bible.sqlite`를 sql.js로 여는 코드, 조회와 검색 쿼리를 작성할 때 사용한다.
- **포함**: 스키마 요약(실제 파일에서 `.schema`로 확인 후 작성), 읽기 전용 로딩, 파라미터 바인딩 패턴, 해시 검증 절차.
- **규칙**: 스키마를 추측하지 않는다. 파일이 없으면 작업을 멈추고 알린다.

### 5.3 `llm-provider-adapter`
- **설명**: 새 제공자를 추가하거나 어댑터를 수정할 때 사용한다.
- **포함**: `LlmClient` 인터페이스, 요청과 응답 모델, 오류 매핑(인증, 한도, 타임아웃), 브라우저 직접 호출 확인 체크리스트, 모킹 테스트 템플릿.
- **규칙**: 제공자 공식 문서에서 브라우저 호출 허용 여부와 CORS 조건을 확인한 뒤 구현한다. 확인 결과를 `docs/PROVIDERS.md`에 남긴다.

### 5.4 `key-vault-security`
- **설명**: 사용자 키 등록, 저장, 삭제, 마스킹, 암호화 모듈을 작업할 때 사용한다.
- **포함**: non-extractable CryptoKey 생성과 저장, AES-GCM 사용법, IV 규칙, 마스킹 규칙, 키 삭제 절차, 보안 체크리스트(콘솔, 오류, 화면, 저장소 덤프에 키가 없는지).
- **규칙**: 변경 후 키가 평문으로 어디에도 남지 않는지 테스트한다.

### 5.5 `sermon-ingest-privacy`
- **설명**: 원고 업로드, 파싱, 동의 기록, 마스킹, 청크 분할, 삭제를 작업할 때 사용한다.
- **포함**: 지원 형식(txt, docx, 텍스트 PDF), 파싱 라이브러리 확인 절차, 마스킹 패턴 목록과 테스트 케이스, 청크 규칙(200~800자), 삭제 트랜잭션.
- **규칙**: 파싱과 마스킹은 기기 안에서만. 이미지 기반 PDF는 거부 메시지를 띄운다.

### 5.6 `sermon-retrieval`
- **설명**: "내 설교에서 찾기"의 점수화와 발췌 선택을 작업할 때 사용한다.
- **포함**: 키워드 겹침과 구절 일치 점수 규칙, 상위 3개 선택, 청크 복호화 시점 최소화.
- **규칙**: LLM 모듈을 import하지 않는다. 결과는 화면에만 보여준다.

### 5.7 `sermon-style-profile`
- **설명**: 스타일 프로필 스키마, 생성 프롬프트, 무효화 로직을 작업할 때 사용한다.
- **포함**: 프로필 스키마(문장 길이 평균, 질문형 비율, 예화 빈도, 구성 방식, 말투 요약 3줄, 표현 최대 10개), 최소 원고 수 3편, `source_hash` 무효화.
- **규칙**: 원문 문장을 프로필에 넣지 않는다. 생성 전에 외부 전송 동의를 확인한다. 스키마와 무효화는 `core/sermon`, LLM 호출은 `core/generate`에 둔다.

### 5.8 `persona-builder`
- **설명**: 페르소나 선택지, 허용값 검증, 블록 변환을 작업할 때 사용한다.
- **포함**: 교단, 강조점, 설교 방식, 말투, 대상, 길이의 허용값 목록, 블록 템플릿, 실존 인물 이름 패턴 검사.
- **규칙**: 자유 입력을 받지 않는다. 허용되지 않은 값은 거부한다.

### 5.9 `generation-validator`
- **설명**: 구조, 길이, 근거 절, 금지 표현, 유머 기준, 복제 검사 로직을 작업할 때 사용한다.
- **포함**: 검증 체크리스트, 재시도 정책(1회), 실패 시 사용자 안내 문구, 테스트 케이스.
- **규칙**: 검증 실패 결과를 그대로 보여주지 않는다. 독립 결과로 대체한다.

### 5.10 `mobile-long-press-selection`
- **설명**: 본문 롱터치 선택, 범위 확장, 액션 바, 접근성 대체 수단을 작업할 때 사용한다.
- **포함**: 450ms 임계값, 이벤트 옵션, 차단할 기본 동작, 범위 정규화, 참조 문자열 규칙, 스크린리더 문구, 테스트 시나리오.
- **규칙**: 호버, Shift 클릭, 우클릭 메뉴 이벤트를 추가하지 않는다.

### 5.11 `local-backup`
- **설명**: 암호화 백업 내보내기와 가져오기, 복원 검증을 작업할 때 사용한다.
- **포함**: 백업 파일 형식(버전, 솔트, IV, 암호문), PBKDF2 파라미터, 포함과 제외 항목(API 키 기본 제외), 암호 분실 안내 문구, 가져오기 시 충돌 처리.
- **규칙**: 백업 파일은 사용자가 직접 저장하고 전송한다. 앱이 외부로 보내지 않는다.

### 5.12 `design-doc-sync`
- **설명**: 구현 중 설계와 달라진 부분이 생기면 `docs/DESIGN.md`를 갱신하고 변경 이력을 남길 때 사용한다.
- **포함**: 변경 이력 형식(날짜, 변경 내용, 이유), 열린 질문 관리.
- **규칙**: 설계를 바꾸는 결정은 사용자에게 먼저 확인한다.

### 5.13 `setup-wizard`
- **설명**: 설정 마법사 화면, 단계 흐름, 제공자별 발급 안내 문구, 키 검증 흐름, 실패 안내를 작업할 때 사용한다.
- **포함**: 9단계 흐름과 `wizard.steps`, 제공자 비교 카드 항목, 3.13.1의 발급 절차 문구, 3.13.3 실패 원인 표, 키 형식 힌트 목록, 테스트 시나리오(건너뛰기, 형식 오류, 검증 성공, 인증 실패, 네트워크 오류, 동의 거절 후 기능 동작).
- **규칙**: 발급 절차 문구는 제공자 공식 문서를 확인하고 날짜를 `docs/PROVIDERS.md`에 기록한 뒤에만 고친다. 외부 링크는 사용자가 누를 때만 열리는지 테스트한다. 쉬운 말을 우선하고, 기술 용어는 한 줄 풀이를 붙인다.

### 5.14 `bible-txt-import`
- **설명**: 사용자가 가져오는 txt 역본의 형식 판별, 인코딩 처리, 검사, 미리보기, 저장, 삭제, 역본 안내 링크 레지스트리를 작업할 때 사용한다.
- **포함**: 형식 A(한 줄 한 절)와 형식 B(장 제목 후 절 줄) 파서, 혼합 거부 규칙, UTF-8 후 euc-kr 시도, 경고 규칙(범위 밖 절, 중복, 20% 초과 시 저장 차단), 권리 확인 기록, 샘플 양식 생성, 역본 삭제 트랜잭션, 백업 제외 기본값, 검색 속도 측정 기준(5초).
- **레지스트리 형식**: `config/bible-sources.json`의 항목은 `id`, `name`, `language`, `rights`(public_domain | copyrighted | unverified), `read_url`, `download_url`(확인된 경우만), `verified_on`, `note`를 가진다. `rights`가 `public_domain`이 아니거나 `verified_on`이 없으면 `download_url`을 비워 둔다.
- **규칙**: 파일 내용을 앱이 읽거나 전송하지 않는다(파싱은 기기 안에서만). 샘플 양식은 앱이 만든 빈 양식이어야 하며 실제 번역 본문을 넣지 않는다. 레지스트리에 새 링크를 넣기 전 공식 페이지를 직접 열어 확인하고 날짜를 기록한다.

### 5.15 `sermon-step` (워크플로)
- **설명**: 단계(S00~S11) 하나를 착수, 구현, 마무리할 때 사용한다. "S03 구현해줘", "다음 단계 진행" 같은 요청.
- **포함**: 선행 단계 확인, 범위 In/Out 준수, 구현 순서, 검증 기록과 상태 표 갱신, 수동 항목 backlog 이관.
- **규칙**: 한 번에 한 단계만. 선행 단계가 `DONE`이 아니면 멈추고 알린다. 단계 문서의 "착수 전 확정" 항목이 열려 있으면 사용자에게 먼저 묻는다.

### 5.16 `sermon-verify` (검증 게이트)
- **설명**: `scripts/verify.sh quick|full` 실행, 정적 점검, 결과 보고를 할 때 사용한다. 단계 완료 전, 커밋 전 필수.
- **포함**: 게이트 구성, 정적 점검 목록(절대 규칙의 기계적 확인), 수동 검증 backlog 규칙, 보고 형식.
- **규칙**: 테스트 삭제, skip, 임계값 하향으로 통과시키지 않는다. 수치는 실제 출력에서 가져온다.

---

## 6. 설정 파일 (`config/app.config.json`)

```json
{
  "bible_db": {
    "source": "crizin/bible-db",
    "release_tag": "v1.0.1",
    "release_asset": "bible.sqlite.gz",
    "release_url": "https://github.com/crizin/bible-db/releases/download/v1.0.1/bible.sqlite.gz",
    "release_sha256": "<릴리스 원본 .gz 해시>",
    "sources": ["krv", "kjv"],
    "file": "public/data/bible.sqlite",
    "sha256": "<파생 DB 해시>"
  },
  "i18n": {
    "default_language": "ko",
    "supported_languages": ["ko", "en"],
    "default_bible": { "ko": "krv", "en": "kjv" },
    "available_bibles": {
      "ko": ["krv"],
      "en": ["kjv"]
    },
    "excluded_bibles": ["niv"],
    "english_length_words": { "sermon_min": 550, "sermon_max": 750 }
  },
  "ui": {
    "platform": "mobile_only",
    "max_width_px": 480,
    "long_press_ms": 450,
    "touch_target_min_px": 44,
    "font_size_px": { "default": 16, "options": [16, 18, 20, 22] }
  },
  "home": {
    "daily_verses": ["GEN 1:1", "PSA 23:1-3", "JHN 3:16", "…"]
  },
  "providers": {
    "gemini": {
      "endpoint": "<공식 엔드포인트, 구현 시 문서 확인>",
      "model": "<모델명, 구현 시 문서 확인>",
      "browser_direct_verified": false
    },
    "openai": {
      "endpoint": "<공식 엔드포인트>",
      "model": "<모델명>",
      "browser_direct_verified": false
    },
    "anthropic": {
      "endpoint": "<공식 엔드포인트>",
      "model": "<모델명>",
      "browser_direct_verified": false
    }
  },
  "sermon_ingest": {
    "max_upload_mb": 5,
    "min_chunk_chars": 200,
    "max_chunk_chars": 800,
    "retrieval_top_k": 3,
    "min_sermons_for_style": 3,
    "copy_check_ngram_chars": 20
  },
  "generation": {
    "sermon_target_chars": 1000,
    "sermon_min_chars": 800,
    "sermon_max_chars": 1200,
    "timeout_seconds": 60,
    "max_retries_validation": 1
  },
  "local_limits": {
    "daily_llm_calls_per_device": 30
  },
  "bible_import": {
    "accepted_extensions": ["txt"],
    "max_file_mb": 10,
    "encodings_tried": ["utf-8", "euc-kr"],
    "max_warning_ratio": 0.2,
    "require_rights_consent": true,
    "include_in_backup_default": false
  },
  "wizard": {
    "steps": ["language", "bible", "llm_choice", "provider", "get_key", "paste_key", "verify", "consent", "done"],
    "skippable": true,
    "providers_order": ["gemini", "openai", "anthropic"],
    "beginner_recommendation": "anthropic",
    "key_format_hints": {
      "gemini": "AIza",
      "openai": "sk-",
      "anthropic": "sk-ant-"
    }
  },
  "backup": {
    "pbkdf2_iterations": "<구현 시 현재 권장값 확인>"
  }
}
```

- `browser_direct_verified`가 `true`로 확인되기 전에는 해당 제공자를 UI에서 고를 수 없게 한다. 비활성 카드 사유는 `unavailable_reason`(`pending_verification` | `no_browser_access`)이다.
- 위 예시는 자리표시자다. S07(2026-11-05)·S14·S15(2026-11-06)에서 확정한 값은 `config/app.config.json`과 `docs/PROVIDERS.md`를 따른다(Gemini·Anthropic 검증, 기본 추천 Gemini, 모델 목록 `models`).
- 모델명, 엔드포인트, 반복 횟수 등 값은 구현 시 공식 문서로 확인해 채운다. 추측으로 넣지 않는다.
- `local_limits`는 기기별 자가 제한이다. 전역 한도는 없다.

---

## 7. 빌드와 검증 명령

```bash
npm install
npm run dev                      # 개발 서버 (로컬 개발용, 배포 서버가 아님)
npm run lint                     # 독립 모드 모듈의 llm import 금지 규칙 포함
npm run test                     # 단위 테스트
npm run test:e2e                 # 모바일 뷰포트 E2E
npm run test:network             # 독립 모드 외부 요청 차단 테스트
npm run db:build                 # 릴리스 원본(.gz) 해시 확인 후 krv·kjv 파생 DB 생성 (개발자 1회)
npm run verify:db                # public/data/bible.sqlite 해시 검증
npm run build                    # 정적 산출물 생성 (dist/, 브라우저·PWA 빌드)
npm run build:app                # 앱 모드 빌드 (서비스 워커 없음) + npx cap sync
npm run android:debug            # Android 디버그 APK 빌드 (android/app/build/outputs/apk/debug/)
scripts/verify.sh quick          # 타입 검사, 린트, i18n 키 일치, 단위 테스트
scripts/verify.sh full           # quick + 커버리지, E2E, 네트워크, DB 해시, 빌드, 정적 점검
```

- `npm run dev`, `npm run preview`는 로컬 개발 확인용이다. 배포는 앱 패키지(Android APK/AAB, iOS 앱)로 한다.
- 작업을 마치기 전에 위 명령들을 돌리고, 통과 여부와 남은 이슈를 보고한다.

---

## 8. 작업 방식

- 큰 변경 전에는 영향 파일과 테스트 방법을 짧게 공유한다.
- 설계에 없는 기능은 임의로 추가하지 않는다.
- 외부 API의 엔드포인트, 모델명, 브라우저 호출 허용 여부, 요금은 기억에 의존하지 말고 공식 문서를 확인한다.
- 완료 보고에는 변경 파일, 실행한 테스트, 남은 이슈를 포함한다.

---

## 9. 금지 사항 요약

- 서버, 중계, 프록시, 서버리스 함수 추가
- 독립 모드 경로에서 `llm`, `generate` 모듈 import
- 외부 스크립트, 폰트, 분석 도구, 원격 이미지 추가
- 사용자 키의 평문 저장, 콘솔 출력, 화면 전체 노출
- 운영자 공용 키를 번들에 포함
- 원고를 동의 없이 처리하거나 마스킹 없이 저장
- 원고 삭제를 일부 스토어에만 적용
- LLM 출력을 HTML로 렌더링
- 검증 없이 생성 결과 표시, 복제 검사 생략
- 데스크톱 전용 인터랙션 구현
- 화면에 내부 용어("설교 생성", "예문", "유머", "골격", "발췌 검색") 노출
- 실존 목회자 이름을 페르소나나 프롬프트에 넣기
- 마법사에서 외부 링크를 앱이 미리 열거나 요청하기
- 검증되지 않은 제공자(`browser_direct_verified: false`)를 마법사에서 고를 수 있게 하거나 추천으로 표시하기
- 마법사 단계를 건너뛸 수 없게 만들어 독립 기능을 막기
- 저작권이 있는 역본의 txt 파일이나 내려받기 링크를 앱에 포함하기
- 권리 확인 없이 가져온 역본을 저장하거나 백업에 기본 포함하기
- 확인 날짜 없이 `bible-sources.json`에 내려받기 링크를 넣기
