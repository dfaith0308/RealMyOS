# SUP-DANGER-001 주문 생성 N+1 제거 (cache upsert)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

주문 생성 시 `customer_product_prices`(거래처별 마지막 거래 단가 캐시) 갱신이 라인 수만큼 `maybeSingle → update/insert`로 반복되는 N+1(RULE-05)을 제거하고, **배치 upsert 1회 호출**로 고정 횟수 DB 왕복으로 줄인다.

## 관련 tasks.md ID

- SUP-DANGER-001

## 수정 파일 목록

- `realmyos/src/actions/order.ts`
- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-06_sup-danger-001_n1-fix-cache-upsert.md`

## 변경 내용 요약

- `createOrder`의 `lineRows` 루프에서 수행하던 아래 동작을 제거했다.
  - `customer_product_prices` 존재 여부 `maybeSingle` 조회
  - 존재 시 `update`, 미존재 시 `insert` 분기 (라인 수만큼 반복)
- 동일 데이터를 `cacheRows` 배열로 구성한 뒤, 아래 1회 호출로 대체했다.
  - `supabase.from('customer_product_prices').upsert(cacheRows, { onConflict: 'customer_id,product_id' })`
- `onConflict` 키는 운영 DB에서 `UNIQUE(customer_id, product_id)` 인덱스가 존재함을 전제로 한다.

## migration 여부

- 없음

## 테스트 결과

- 미실행 — 로직 변경은 완료했으나 로컬/CI 테스트는 수행하지 않았다.

## 남은 위험

- `upsert`가 실패하더라도 주문 생성 자체는 성공으로 처리된다(현행은 `console.error` 로깅만). 캐시는 “보조 데이터”로 취급한다는 전제가 필요하다.

## 다음 권장 작업

- 주문 생성 경로에서 `customer_product_prices` upsert 실패 빈도를 운영 로그로 관찰하고, 필요 시 재시도/백오프/에러 리포팅 정책을 정한다.

