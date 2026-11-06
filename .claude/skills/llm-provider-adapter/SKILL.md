---
name: llm-provider-adapter
description: Add or modify an LLM provider adapter (LlmClient over fetch) for the serverless PWA — browser-direct/CORS verification, docs/PROVIDERS.md records, config endpoints/models, error mapping, timeout, header-only keys, and mocked tests. Use when verifying a provider, implementing src/core/llm, mapping provider errors, or updating CSP connect-src — e.g. "Gemini 어댑터", "제공자 추가", "CORS 확인", "401 처리", "add OpenAI adapter".
---

# LLM 제공자 어댑터

## 1. 언제 쓰나
- S07(브라우저 직접 호출 검증, `docs/PROVIDERS.md`, config 확정), S08(어댑터, 키 검증), S09(생성 호출), S10(프로필 생성 호출).
- 위치: `src/core/llm/` (인터페이스, 어댑터, 오류 매핑). 호출 오케스트레이션은 `core/generate`.

## 2. 기준 문서
- DESIGN 2.2(브라우저 직접 호출 제약), 3.6, 3.13.2(키 검증), 3.13.3(실패 원인 표), 4.4(외부 전송 규칙), 7.0(재시도 1회), 12장 열린 질문 1·2·10.

## 3. 규칙
- 서버, 프록시, 서버리스 함수 금지(규칙 1). CORS가 막히면 우회 서버를 만들지 말고 사용자에게 보고한다(래핑 앱 여부는 열린 질문 1).
- 외부 요청은 제공자 공식 엔드포인트만(규칙 2). `connect-src`는 `browser_direct_verified: true`인 제공자 출처만.
- 운영자 공용 키 금지(규칙 6). 키는 `key-vault-security`에서 받아 호출 직전에만 복호화한다.
- 검증되지 않은 제공자는 구현하지도 노출하지도 않는다(규칙 20, CLAUDE 4.5).
- 엔드포인트, 모델명은 `config/app.config.json`에서만 읽는다(규칙 23). 코드에 URL을 쓰지 않는다.
- 키는 헤더에만 넣는다(URL 쿼리 금지, 제공자가 쿼리만 허용하면 보고). 오류 객체에서 헤더·키를 제거한 뒤 던진다(규칙 4, 8).
- 응답 원문을 로그로 남기지 않는다.

## 4. 상세

### 4.1 인터페이스
```ts
export interface GenerateOpts { maxTokens: number; temperature?: number; jsonMode?: boolean; signal?: AbortSignal }
export interface LlmResult { text: string; usage?: { input?: number; output?: number } }
export interface LlmClient {
  readonly provider: ProviderId;                 // 'gemini' | 'openai' | 'anthropic'
  generate(system: string, user: string, opts: GenerateOpts): Promise<LlmResult>;
  validateKey(): Promise<void>;                  // 가장 짧은 요청 1회, 응답은 저장하지 않음
}
export type LlmErrorKind =
  | 'auth' | 'billing' | 'rate_limit' | 'region' | 'network' | 'timeout' | 'bad_response' | 'unknown';
export class LlmError extends Error { constructor(readonly kind: LlmErrorKind, readonly status?: number) { super(kind); } }
export function createClient(provider: ProviderId, getKey: () => Promise<string>): LlmClient;
```
- `LlmError.message`에는 kind만 넣는다. 응답 본문, 헤더, 키, 요청 본문을 넣지 않는다.
- 타임아웃 60초(`generation.timeout_seconds`): `AbortController`로 구현, 만료 시 `timeout`.
- 재시도는 어댑터가 하지 않는다. 검증 실패 재시도(총 1회)는 `generate`가 한다. 네트워크 오류 자동 재시도 없음.
- 호출 전 `local_stats`의 일일 한도(`local_limits.daily_llm_calls_per_device`)를 확인하는 것은 `generate` 책임.

### 4.2 오류 매핑 → 화면 문구(3.13.3)
| kind | 화면 문구 키 | 판정 근거 |
|---|---|---|
| auth | `error.auth` | 제공자 문서의 인증 실패 상태/코드 (확인 필요) |
| billing | `error.billing` | 결제·크레딧 부족 응답 (확인 필요) |
| rate_limit | `error.rate_limit` | 429 등 한도 초과 (확인 필요) |
| region | `error.region` | 지역 미지원 응답 (확인 필요) |
| network | `error.network` | `fetch` TypeError, 오프라인 |
| timeout | `error.network` | AbortController 만료 |
| bad_response / unknown | `error.unknown` | "연결에 실패했습니다. 키를 다시 확인해 주세요" — 원인 추측 금지 |
- 제공자별 상태 코드·오류 본문 형식은 공식 문서에서 확인한 뒤 `docs/PROVIDERS.md`와 이 표에 적는다. 모르는 코드는 `unknown`.

### 4.3 브라우저 직접 호출 확인 체크리스트 (S07, 제공자마다)
- [ ] 공식 문서에서 브라우저(클라이언트) 직접 호출 허용 여부와 조건(필요 헤더 등) 확인, URL과 날짜 기록
- [ ] CORS 사전 요청(OPTIONS)이 허용되는지 실제 확인(수동 항목, 개발용 키)
- [ ] 엔드포인트, 모델명, 인증 헤더 이름, 최소 검증 요청 방법 확인
- [ ] 입력 데이터 사용 정책(무료 티어 포함), 지역 제한 확인
- [ ] 오류 응답 형식과 상태 코드 확인
- [ ] 결과를 `docs/PROVIDERS.md`에 기록 → `browser_direct_verified`와 config 값 갱신

### 4.4 `docs/PROVIDERS.md` 절 형식
```
## <provider> — 확인 YYYY-MM-DD
- 브라우저 직접 호출: 허용 | 불가 | 조건부(조건) — 출처 URL
- 엔드포인트 / 모델 / 인증 헤더: … — 출처 URL
- 검증 요청: …
- 오류 매핑: 상태/코드 → kind
- 데이터 사용 정책 / 지역 제한: … — 출처 URL
- 발급 안내 문구 확인(3.13.1): YYYY-MM-DD
```

### 4.5 모킹 테스트 템플릿
```ts
const fetchMock = vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 }));
vi.stubGlobal('fetch', fetchMock);
const client = createClient('gemini', async () => 'TEST_KEY_1234');
await client.generate('sys', 'user', { maxTokens: 64 });
const [url, init] = fetchMock.mock.calls[0];
expect(String(url)).not.toContain('TEST_KEY');           // 키는 URL에 없음
expect(new URL(String(url)).origin).toBe(configOrigin('gemini'));
```

## 5. 테스트 케이스
- [ ] 요청 URL 출처가 config 엔드포인트와 같음, 키는 헤더에만
- [ ] 상태별 오류 → kind 매핑(표의 모든 행), 알 수 없는 상태 → unknown
- [ ] 던진 오류의 message, stack, JSON 직렬화에 키·헤더·요청 본문 없음
- [ ] 60초 타임아웃(가짜 타이머) → timeout
- [ ] `browser_direct_verified: false` 제공자에 `createClient` 호출 시 거부
- [ ] validateKey는 1회만 호출, 응답 저장 없음

## 6. 작업 후 확인
- `sermon-verify`: `check-csp.mjs`(connect-src = 검증된 제공자만), `check-config.mjs`(검증된 제공자의 자리표시자 없음, PROVIDERS.md 날짜), src URL 금지, 콘솔 금지, 서버 패키지 금지, 산출물의 키 형태 문자열 없음.
- 실제 키 호출은 수동 항목으로 backlog에 둔다.
