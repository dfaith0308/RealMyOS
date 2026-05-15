# SUP-TODO-001-C — 공급자 RFQ 입찰

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |

## 작업 목적

공급자가 노출된 오픈 RFQ 상세에서 단가·납기·메모를 제출하고 `rfq_bids`에 저장한다. RLS로 buyer RFQ를 직접 읽을 수 없으므로 상세·입찰 가능 여부는 기존 `get_supplier_rfqs` RPC 결과로 한정한다.

## 관련 `tasks.md` ID

- `SUP-TODO-001-C`

## 수정 파일 목록

- `src/actions/rfq.ts`
- `src/app/(app)/rfq/[id]/page.tsx`
- `src/components/rfq/RfqDetailClient.tsx`
- `src/components/rfq/RfqHubClient.tsx`
- `supabase/migrations/20260507020000_rfq_bids_unique_supplier.sql`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-todo-001c_rfq-bid.md`

## 변경 내용 요약

- `getRfqDetail` / `normalizeSupplierRfqsRpcData`: RPC 목록에서 단건 선택.
- `getMyBidForRfq`: 상세에서 입찰 완료 UI 분기.
- `submitRfqBid`: RPC로 가시성·`open` 확인 → 중복 입찰 조회 → `tenants.name`으로 `supplier_name` → 단일 INSERT; `revalidatePath` `/rfq`, `/rfq/[id]`.
- UI: 목록 행 클릭 시 `/rfq/[id]`, 상세·폼·완료 메시지.
- migration: `(rfq_id, supplier_tenant_id)` UNIQUE (파일만, 미적용).

## migration 여부

`20260507020000_rfq_bids_unique_supplier.sql` — **운영 DB 적용 완료** (2026-05-07, 제약 `rfq_bids_rfq_supplier_unique`).

## 테스트 결과

- `npx tsc --noEmit` — 통과.

## 남은 위험

- `supplier_tenant_id` NULL 기존 데이터가 있으면 UNIQUE 추가 실패 가능.
- 입찰 직전 RPC·INSERT 사이 RFQ 마감/상태 변경은 희박한 레이스(추가 RPC로 강화 가능).

## 다음 권장 작업

- 운영에 UNIQUE migration 적용 후 smoke test.
- `SUP-TODO-001-D` 알림·`SUP-TODO-001` 나머지 상태 전이.
