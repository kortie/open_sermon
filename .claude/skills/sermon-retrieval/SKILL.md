---
name: sermon-retrieval
description: "Search My Sermons" (internal: excerpt search) — on-device scoring of encrypted sermon chunks by keyword overlap and verse match, top-3 selection, minimal decryption, screen-only display. Use when touching retrieval scoring, the action-bar "내 설교에서 찾기" flow, or excerpt selection for the outline — e.g. "발췌 점수", "내 설교에서 찾기 결과 이상", "top 3 excerpts", "retrieval scoring".
---

# 내 설교에서 찾기 (발췌 점수화)

## 1. 언제 쓰나
- S05(구현, 액션 바 연결, 구성표에 발췌 넣기). S09에서 생성 프롬프트의 참고 발췌로 재사용(호출은 `generate`가 함).
- 위치: `src/core/sermon/retrieve.ts`(S05 단계 문서 기준). 참조 겹침은 `src/core/bible/reference-overlap.ts`.

## 2. 기준 문서
- DESIGN 3.3, 3.4(구성표에 선택한 발췌), 4.1(`sermon_chunk`의 keywords·verse_refs 평문), 4.4(외부 전송은 동의 후 LLM 호출 시에만), 6.1(참고 발췌 최대 3개).

## 3. 규칙
- 규칙 3: `llm`, `generate`를 import하지 않는다. 결과는 화면에만 보여준다.
- 규칙 8: 발췌 원문을 로그에 남기지 않는다.
- 규칙 14: 화면 이름은 "내 설교에서 찾기"(en: Search My Sermons). "발췌 검색" 금지.

## 4. 상세

### 4.1 API
```ts
export interface RetrievalQuery { refs: Reference[]; keywords: string[] }  // 선택 블록 + 사용자/추출 키워드
export interface ScoredChunk { chunkId: string; sermonId: string; score: number; reasons: ('verse' | 'keyword')[] }
export async function scoreChunks(q: RetrievalQuery): Promise<ScoredChunk[]>;      // 복호화 없음
export async function loadExcerpts(top: ScoredChunk[]): Promise<Excerpt[]>;        // 상위 k개만 복호화
export interface Excerpt { chunkId: string; sermonTitle: string; text: string; score: number }
```

### 4.2 점수 규칙 (평문 메타데이터만 사용)
- 구절 일치: 청크 `verse_refs`가 선택 절과 같은 절을 포함하면 +3/절(최대 +9), 같은 장만 겹치면 +1.
- 키워드 겹침: 질의 키워드와 청크 `keywords`의 교집합 개수 × 1(정규화: 소문자, 조사 제거 규칙 단순화, 공백 제거).
- 동점: 구절 일치 점수 높은 것 → 최근 원고 → seq 작은 것.
- 점수 0은 제외. 같은 원고에서 최대 2개(한 원고로만 채워지지 않게).
- 상위 `sermon_ingest.retrieval_top_k`(3)개.

### 4.3 복호화 최소화
- 점수 계산은 평문 `keywords`, `verse_refs`만으로 한다.
- 상위 k개만 `vault.decryptText`로 복호화하고, 화면을 떠나면 상태에서 지운다. 캐시하지 않는다.

### 4.4 키워드 추출
- 선택 본문에서 키워드 3~5개를 뽑는 단순 규칙(빈도, 불용어 목록). 불용어 목록은 `src/core/sermon/extract.ts`의 `STOPWORDS`(청크 키워드와 같은 규칙, 질의는 최대 5개).
- 사용자가 키워드를 직접 고치거나 추가할 수 있다.

## 5. 테스트 케이스
- [ ] 구절이 일치하는 청크가 키워드만 겹치는 청크보다 위
- [ ] 같은 원고에서 3개 이상 후보가 있어도 최대 2개
- [ ] 점수 0 제외, 원고 없음 → 빈 결과(화면은 안내 문구)
- [ ] `scoreChunks` 동안 decrypt 호출 0, `loadExcerpts`는 정확히 k번
- [ ] 쉼표 블록 선택(`요 15:1-3, 7`)의 모든 절을 일치 대상으로 사용
- [ ] 네트워크 차단 상태에서 동작(E2E/network)

## 6. 작업 후 확인
- `sermon-verify`: import 경계(`core/sermon` → llm/generate 금지), 콘솔 금지, i18n 금지 용어 점검(`발췌 검색`), `test:network` 독립 흐름.
