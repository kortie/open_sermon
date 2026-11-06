---
name: key-vault-security
description: Device encryption and API-key vault for the PWA — non-extractable AES-GCM CryptoKey in IndexedDB, fresh 12-byte IVs, encrypt/decrypt helpers for sermons/chunks/cache, provider key registration, last-4 masking, deletion, and leak checks. Use when touching src/core/vault, provider_key/crypto_key stores, key input UI, or anything that might log/expose secrets — e.g. "키 저장", "암호화 모듈", "키 삭제", "마스킹 표시", "encrypt sermon".
---

# 키 보관과 암호화

## 1. 언제 쓰나
- S04(암호화 모듈, 원고 암호화), S06(백업 시 복호화·재암호화), S08(제공자 키 등록·검증·삭제), S09(`gen_cache`).
- 위치: `src/core/vault/`. 저장은 `core/store`를 거친다.

## 2. 기준 문서
- DESIGN 3.6(키 삭제, 안내 문구), 4.1(`crypto_key`, `provider_key`, `sermon_body`, `sermon_chunk`, `gen_cache`), 4.2(암호화 방식), 4.3(위협), 3.13.2.

## 3. 규칙
- 규칙 4: non-extractable CryptoKey, IndexedDB 저장. 평문 저장, localStorage/sessionStorage, 콘솔, 오류 메시지 포함 금지. 화면에는 마지막 4자리만.
- 규칙 5: 비밀번호를 받지 않는다(백업 암호는 파생 후 즉시 버림, 저장 안 함).
- 규칙 6: 운영자 공용 키 금지.
- 규칙 8: 로그 금지.

## 4. 상세

### 4.1 API
```ts
export async function getDeviceKey(): Promise<CryptoKey>;   // 없으면 생성 후 crypto_key에 저장
export async function encrypt(plain: string | Uint8Array): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }>;
export async function decrypt(ciphertext: ArrayBuffer, iv: Uint8Array): Promise<Uint8Array>;
export async function decryptText(ciphertext: ArrayBuffer, iv: Uint8Array): Promise<string>;

export async function saveProviderKey(provider: ProviderId, key: string): Promise<{ last4: string }>;
export async function withProviderKey<T>(provider: ProviderId, fn: (key: string) => Promise<T>): Promise<T>;
export async function deleteProviderKey(provider: ProviderId): Promise<void>;
export async function providerKeyStatus(provider: ProviderId): Promise<{ exists: boolean; last4?: string }>;
export function maskKey(last4: string): string;   // "••••" + last4
```
- 생성: `crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt'])`.
- IV: 매 암호화마다 `crypto.getRandomValues(new Uint8Array(12))`. 재사용 금지, 카운터 금지.
- `withProviderKey`는 복호화한 키를 콜백 안에서만 쓰게 한다. 상태(React state, 전역 변수)에 평문 키를 두지 않는다.
- `key_last4`는 저장 시점에 계산해 평문으로 둔다(마지막 4자만).
- 기기 키를 잃으면(저장소 삭제) 복호화가 실패한다 → `VaultError('key_lost')`, 화면은 백업으로 복원 안내(4.2).

### 4.2 키 입력 UI 규칙 (CLAUDE 4.3)
- `type="password"`, `autocomplete="off"`, `autocapitalize="off"`, `spellcheck={false}`.
- 붙여넣기 기본, 앞뒤 공백 제거. 저장 후 입력칸을 비우고 `maskKey`로만 표시.
- 접두사 힌트는 `wizard.key_format_hints`(참고용, 최종 판단은 제공자 응답).

### 4.3 삭제 절차
1. `provider_key`에서 해당 행 삭제(한 트랜잭션).
2. 그 제공자로 만든 `gen_cache`는 남겨도 되지만, "키 삭제" 화면에서 캐시 삭제 선택지를 같이 준다(설계 변경 아님, UI 선택지).
3. 화면 상태 초기화, LLM 기능 잠금 표시.
- 기기 전체 초기화 시 `crypto_key`까지 지운다(원고 복구 불가 경고 후).

### 4.4 보안 체크리스트 (변경 후 매번)
- [ ] 콘솔: `no-console` 린트, 테스트에서 `console.*` 스파이 호출 0
- [ ] 오류: 모든 오류 경로의 message/stack/JSON에 키 없음
- [ ] 화면: DOM 텍스트에 키 전체 없음(마지막 4자만)
- [ ] 저장소 덤프: IndexedDB 모든 스토어를 직렬화해 키 원문 검색 → 0건
- [ ] localStorage/sessionStorage 비어 있음
- [ ] 백업 파일 기본값에 키 없음(`local-backup`)

## 5. 테스트 케이스
- [ ] 암호화 → 복호화 일치(문자열, 바이너리, 빈 문자열, 한글)
- [ ] 같은 평문 2회 암호화 → 암호문, IV 모두 다름
- [ ] `exportKey('raw', key)` → 거부, `key.extractable === false`
- [ ] 잘못된 IV/변조 암호문 → 복호화 실패(AES-GCM 인증)
- [ ] 키 저장 후 IndexedDB 덤프에 평문 키 없음, last4만 있음
- [ ] 키 삭제 후 `providerKeyStatus` = exists false
- [ ] fake-indexeddb에서 CryptoKey 구조적 복제가 안 되면 테스트 환경 대역을 쓰고, 실제 브라우저 확인은 E2E로 한다

## 6. 작업 후 확인
- `sermon-verify` 정적 점검: `extractable: true` 금지, localStorage/sessionStorage 금지, 콘솔 금지, 산출물의 키 형태 문자열 없음. 커버리지 `core/vault` 90% 이상.
