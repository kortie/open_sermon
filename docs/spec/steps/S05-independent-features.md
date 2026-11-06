# S05. 내 설교에서 찾기, 말씀 구성표, 라이브러리, 페르소나, 복제 검사 (배포 가능)

| 항목 | 값 |
|------|----|
| 선행 | S03, S04 |
| DESIGN 참조 | 3.3, 3.4, 3.5, 3.8, 7.1(인명 패턴), 7.3, 12장 16 |
| 모듈 | `core/sermon`(점수화), `core/compose`, `core/persona`, `core/validate`, `core/store` |
| 관련 스킬 | `sermon-retrieval`, `persona-builder`, `generation-validator` |

## 목표
LLM 없이 쓸 수 있는 기능을 완성한다. 선택한 구절로 내 원고에서 관련 부분을 찾고, 말씀 구성표를 채우고, 라이브러리와 페르소나를 관리한다. 네트워크를 끊은 상태에서 전체 흐름이 동작하면 **첫 배포 가능** 상태다.

## 착수 전 확정
1. ~~**길이 선택지 (열린 질문 16)**~~ — 확정(2026-11-05): 1000자 고정, 공백 포함 그래핌 수, 초안 본문만 세고 덧붙이는 삶에 닿는 예시·가벼운 한마디는 제외(DESIGN 3.8, 7.1).
2. ~~라이브러리 기본 콘텐츠~~ — 확정(2026-11-05): 빈 상태로 출시, 빈 화면에 추가 방법 안내(DESIGN 3.5).
3. ~~구성표 저장 위치~~ — 확정(2026-11-05): `outline` 스토어 신설, 섹션·블록 본문 암호화, 목록에서 다시 열기·편집·삭제, 원고 삭제 시 그 원고의 발췌 블록 제거(DESIGN 3.4, 4.1).
4. ~~페르소나 구분 이름 (열린 질문 22)~~ — 확정(2026-11-05): 20자 라벨, 프롬프트 제외, 실존 인물 패턴 거부(DESIGN 3.8).

## 범위
- **In**: 청크 점수화와 상위 3개, 결과 화면(원고 일부 표시), 구성표 템플릿과 편집, 인용 블록 구분, 구성표 암호화 저장(`outline`)·목록·다시 열기·삭제, 라이브러리(`library_item`) 추가·편집·삭제·태그/구절 검색, 페르소나(`persona`) 선택지·검증·여러 개 저장, `validate`의 복제 검사와 실존 인물 패턴 검사, 액션 바의 말씀 구성표·내 설교에서 찾기 연결, 삶에 닿는 예시·가벼운 한마디 버튼 → 라이브러리 검색(키가 없을 때 경로), 네트워크 격리 테스트 전체 흐름.
- **Out**: 페르소나 블록을 프롬프트에 넣는 부분(S09), LLM 생성(S09), 임베딩 검색.

## 산출물
```
src/core/sermon/retrieve.ts       # score(chunkMeta, query) → top_k
src/core/compose/template.ts      # 구성표 구조: 제목, 도입, 본문 해설, 적용, 맺음 기도
src/core/compose/library.ts       # 라이브러리 검색
src/core/store/library.ts
src/core/store/outline.ts         # outline 스토어(암호화 본문 + 평문 메타), 원고 삭제 시 발췌 블록 제거
src/core/store/persona.ts
src/core/persona/options.ts       # 허용값 목록 (라벨은 i18n 키)
src/core/persona/validate.ts      # 허용값 외 거부, 인명 패턴 거부
src/core/validate/copy-check.ts   # n-gram(20자) 일치, 정규화, 인용 블록 제외
src/core/validate/person-name.ts  # "○○ 목사처럼" 등 패턴 (S09와 공유)
src/app/compose/  src/app/library/  src/app/persona/  src/app/retrieve/
tests/unit/sermon/retrieve.test.ts
tests/unit/compose/*.test.ts
tests/unit/persona/*.test.ts
tests/unit/validate/copy-check.test.ts
tests/e2e/independent-flow.spec.ts
tests/network/independent-offline.spec.ts
```

## 설계 상세
- **점수화**: 점수 = 구절 일치(청크 `verse_refs`가 선택 범위와 겹치면 가중치, 같은 책·장이면 낮은 가중치) + 키워드 겹침(선택 본문에서 추출한 키워드와 청크 `keywords`의 교집합 수). 가중치는 상수로 두고 테스트로 고정. 점수 0인 청크는 제외. 상위 `sermon_ingest.retrieval_top_k`(3)개만 **복호화**한다(점수화는 평문 메타만 사용). 결과는 화면에만 보여준다.
- **구성표**: 섹션마다 `{kind: 'quote_bible'|'quote_excerpt'|'user_text', text}` 블록 목록. 본문 인용은 번들 DB 원문, 발췌 인용은 선택한 결과. 문장을 새로 만들지 않고 `user_text`는 빈칸. 인용 블록은 시각적으로 구분하고 편집 불가. 저장 시 `user_text`만 복제 검사.
- **복제 검사**: 비교 전 정규화(공백 제거, 문장부호 제거, 영문 소문자화, 유니코드 NFC). 원천(발췌·가져온 역본 본문)의 20자(`copy_check_ngram_chars`) 부분 문자열 집합과 검사 대상의 20자 창을 비교. 결과는 일치 위치와 원천 id. 인용 블록(`quote_*`)은 검사 대상에서 제외. S09가 같은 함수를 쓴다.
- **라이브러리**: `kind`(example/one_liner) 라벨은 노출 이름(삶에 닿는 예시/가벼운 한마디). 태그와 `verse_refs`로 검색. 평문 저장(4.1).
- **페르소나**: 교단 전통, 강조점(복수), 설교 방식, 말투, 대상, 길이의 허용값만. 자유 입력 없음. 저장 시 허용 목록 밖 값이면 거부. 이름(name) 필드는 사용자 라벨이므로 실존 인물 패턴(예: "○○ 목사", "○○○ 목사님 스타일")을 거부한다. 라벨은 i18n 키로 표시해 언어 전환 시 즉시 바뀜.
- 액션 바: 말씀 구성표 → 구성표 화면(선택 본문 채움), 내 설교에서 찾기 → 결과 화면, 삶에 닿는 예시/가벼운 한마디 → 라이브러리 검색(구절 태그 필터). S09 이후 키가 있으면 생성 경로가 추가된다.

## 테스트 요구사항
- 점수화: 구절 일치 청크가 키워드만 겹치는 청크보다 위, 동점 시 결정적 순서, top 3 초과 없음, 점수 0 제외, **복호화 호출 수 ≤ 3**(vault 모의로 확인).
- 구성표: 섹션 5개 순서, 인용 블록은 DB 원문과 같음, `user_text` 초기값 빈 문자열, 인용 블록만 있는 구성표의 복제 검사 → 통과(발췌를 그대로 넣어도 실패하지 않음).
- 복제 검사: 원천과 연속 20자 일치 → 감지, 19자 → 미감지, 공백·문장부호만 다른 경우 → 감지, 인용 블록 안의 일치 → 미감지, 한국어·영어 각각.
- 페르소나: 허용값 저장 성공, 목록 밖 값 거부, 강조점 복수 저장, 이름에 "○○○ 목사" 패턴 거부, 여러 개 저장·선택, 언어 전환 시 라벨 변경·저장값 불변.
- 라이브러리: 추가·편집·삭제, 태그 검색, 구절 검색.
- E2E: 롱터치 선택 → 말씀 구성표 → 빈칸 입력 → 저장 / 선택 → 내 설교에서 찾기 → 상위 결과 표시 / 선택 → 가벼운 한마디 → 라이브러리 결과 / 페르소나 생성·선택. 화면 문구에 "설교 생성/예문/유머/골격/발췌 검색"이 없음(DOM 텍스트 검사).
- **네트워크(배포 기준)**: 모든 같은 출처 외 요청을 차단한 상태에서 본문 조회 → 검색 → 선택 → 원고 업로드 → 내 설교에서 찾기 → 구성표 → 라이브러리 → 페르소나 → 원고 삭제 전체 시나리오 통과, 외부 요청 시도 0건. 오프라인(`setOffline(true)`) 새로고침 후 같은 시나리오 통과.

## 검증 게이트
- 자동:
  - 위 테스트 통과, `core/validate` 커버리지 90% 이상
  - 독립 모듈의 `llm`/`generate` import 0건(ESLint + 정적 점검)
  - `tests/network/independent-offline.spec.ts` 통과 → spec README 상태 표 비고에 "배포 가능" 기록
  - `npm run build` 산출물 크기 기록(첫 배포 기준선)
- 수동:
  - [ ] PWA 설치 후 비행기 모드에서 위 전체 시나리오 동작(iOS Safari, Android Chrome)
  - [ ] 4G 환경 첫 화면 1.5초 이내
  - [ ] 구성표의 인용 블록과 빈칸이 실기기 화면에서 구분되어 보임
  - [ ] VoiceOver/TalkBack으로 구성표 빈칸 입력 가능
  - [ ] 정적 호스팅에 `dist/`만 올려 동작 확인(서버 코드 없음)

## 완료 정의
- [x] 길이 결정이 DESIGN.md에 반영
- [x] 점수화 top 3, 복호화 최소화 확인
- [x] 구성표 인용 블록 구분과 빈칸만 복제 검사
- [x] 라이브러리 CRUD와 검색
- [x] 페르소나 허용값·인명 패턴 검증, 여러 개 저장
- [x] 네트워크 차단·오프라인에서 독립 흐름 전체 동작 (배포 가능)

## 검증 기록

### 2026-11-05
- 자동: scripts/verify.sh full → PASS (단위 419개, E2E 104개, 네트워크 18개, 커버리지 core 줄 97.17%·분기 91.54%, `core/validate` 줄·분기 100%)
- 단계 게이트:
  - 점수화: 구절 일치(+3/절, 최대 9) > 같은 장(+1) > 키워드만, 동점은 구절 점수 → 최근 원고 → seq, 점수 0 제외, 원고당 최대 2개, top 3 초과 없음, 쉼표 블록(요 15:1-3, 7)의 모든 절 사용 → PASS
  - 복호화 최소화: 원고 4편(청크 수십 개)에서 `searchMySermons`의 decrypt 호출 정확히 3회, 결과 없음이면 0회(주입 모의 함수로 확인) → PASS
  - 구성표: 섹션 5개 순서, 본문 인용 = DB 원문(단위·E2E), `user_text` 5개 모두 빈 문자열, 인용 블록은 편집·삭제 불가(발췌 인용만 빼기 가능), 인용만 있는 구성표 복제 검사 통과, 빈칸에 발췌를 붙여 넣으면 경고 → PASS
  - 구성표 저장: `outline` 덤프에 섹션 본문·표지 문장 없음, 평문은 제목·ref·bible_id·인용 원고 id·날짜뿐, 같은 내용 재저장 시 IV 다름, 목록·다시 열기·삭제 → PASS
  - 원고 삭제 연쇄: 그 원고의 발췌 블록만 구성표에서 제거(다른 원고 인용·본문 인용 유지, `excerpt_sermon_ids` 갱신), 읽은 뒤 구성표가 바뀌면 트랜잭션 전체 중단(원고도 남음) → PASS
  - 복제 검사: 20자 감지·19자 미감지, 공백·문장부호 차이, 영문 대소문자, 인용 블록 제외, 한국어·영어, 분해 자모(NFD) 입력, 4바이트 문자 위치 → PASS
  - 페르소나: 필드별 허용값 전부 통과, 목록 밖 값·길이 1000 외 거부, 강조점 복수·중복 제거·빈 배열 거부, 이름 21자·"김철수 목사"·"○○○ 목사님 스타일"·"like Pastor X" 거부("담임 목사용"·"주일 오전용" 허용), 여러 개 저장·선택·삭제 시 선택 해제, 저장 후 값이 바뀐 행은 읽을 때 제외, 언어 전환 시 라벨 즉시 변경·코드·선택 유지(E2E) → PASS
  - 라이브러리: 추가·편집·삭제, 태그 검색, 구절 검색(같은 절·장 전체 > 같은 장), 종류 필터, 잘못된 구절 입력 안내, 빈 화면 추가 방법 안내 → PASS
  - 독립 모듈 `llm`/`generate` import 0건(ESLint + static:no-llm-import) → PASS
  - 네트워크(배포 기준): `tests/network/independent-offline.spec.ts` 외부 요청 차단 상태 전체 시나리오(본문 조회 → 검색 → 원고 업로드 → 선택 → 내 설교에서 찾기 → 구성표 → 라이브러리 → 페르소나 → 원고 삭제) 외부 요청 0건, `setOffline(true)` 새로고침 후 같은 시나리오 통과(chromium 360, webkit 390) → PASS, 상태 표에 "배포 가능" 기록
  - 화면 문구: 홈·구성표·라이브러리·페르소나·내 설교에서 찾기 화면(ko, en) DOM 텍스트에 "설교 생성/예문/유머/골격/발췌 검색" 없음 → PASS
  - 빌드 크기 기준선(첫 배포): `dist/` 12,877,255바이트(그중 `data/bible.sqlite` 9,789,440, 나머지 3,087,815), 첫 화면 JS `index-*.js` 334.61kB(gzip 108.71kB), CSS 11.02kB(gzip 2.57kB), 서비스 워커 사전 캐시 46항목 12,556.89KiB. S05 화면은 지연 로딩 청크(Retrieve 4.26kB, Outline 7.18kB, Library 6.60kB, Personas 8.41kB)
- 수동: 보류 → backlog MV-S05 (5항목)
- 의존성 추가: 없음
- 설계 변경: 없음(착수 전 확정 4건은 DESIGN v0.13에 반영됨)
- 구현 메모:
  - 파일 위치: 실존 인물 패턴은 단계 문서대로 `src/core/validate/person-name.ts`에 두고 `core/persona`가 가져다 쓴다(스킬의 `real-person-patterns.ts` 경로 대신). 발췌 점수화는 `src/core/sermon/retrieve.ts`.
  - 산출물 외 파일: `src/core/compose/outline.ts`(구성표 암호화·복호화, 원고 삭제용 갱신 준비), `src/core/bible/reference-overlap.ts`(참조 겹침, `canonicalRef` 이동 — 점수화와 라이브러리 검색이 공유), `src/app/compose/handoff.ts`(고른 발췌를 메모리로만 구성표에 넘김, URL에는 임의 토큰만), `tests/helpers/flow.ts`.
  - 선택한 페르소나 id는 `settings` 스토어의 `persona_id` 키에 둔다(평문, 선택값 id뿐).
  - 구성표 복제 검사에 걸리면 저장은 하되 경고를 보여준다(사용자가 직접 쓴 글이므로 막지 않음). 원천은 그 구성표가 인용한 발췌이고, S11에서 가져온 역본 본문을 `extraSources`로 더한다.
  - 페르소나의 화면 이름은 DESIGN 3.8 그대로 "페르소나"(en "Persona")로 두고 한 줄 풀이를 붙였다.
  - 액션 바의 네 버튼을 연결하면서 S03의 "준비 중" 표시와 `selection.soon` 문자열을 지웠고, `long-press.spec.ts`의 해당 단언을 "활성"으로 바꿨다.
- 후속:
  - S09: `copyCheck`·`hasImitationPattern`을 생성 검증에서 그대로 쓴다. 페르소나 블록(`buildPersonaBlock`)과 `getActivePersona` 연결.
  - S11: 복제 검사는 문자 단위 `Intl.Segmenter`를 쓰므로, 가져온 역본 전체를 원천으로 넣을 때 인덱스 크기·속도를 측정한다(인용 범위 절만 원천으로 넣는 방안 포함).
  - S06: 백업 대상에 `outline`(암호문 그대로 재암호화 여부), `library_item`, `persona`, `settings.persona_id` 포함 여부를 local-backup 스킬 기준으로 정한다.
