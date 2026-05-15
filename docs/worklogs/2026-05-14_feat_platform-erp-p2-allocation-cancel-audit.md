| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

`commerce_order_allocations`에 **취소 audit**(`cancelled_at`, `cancelled_by`)을 추가하고, **pending → cancelled** 자동 전환 시 관리자 실행자를 기록한다. `confirmed` allocation은 변경하지 않는다.

## 관련 `tasks.md` ID

- **PLATFORM-ERP-P2-001** 후속 (동일 Epic 맥락)

## 수정 파일 목록

- `supabase/migrations/20260515210000_commerce_order_allocations_cancel_audit.sql` (신규)
- `src/actions/admin/commerce-allocation.ts` — 조회 필드·`cancelPendingCommerceOrderAllocationsForOrder`
- `src/actions/admin/commerce.ts` — 주문 `cancelled` 시 pending allocation 취소·상세 조회 필드
- `src/components/commerce/CommerceAllocationsClient.tsx` — 취소일시·취소처리자 열
- `src/components/commerce/OrdersClient.tsx` — 상세 allocation 표 열 정렬
- `docs/tasks.md`
- `docs/worklogs/2026-05-14_feat_platform-erp-p2-allocation-cancel-audit.md` (본 파일)

## migration 여부

- **파일 추가** — `20260515210000_commerce_order_allocations_cancel_audit.sql` (운영 적용 별도 승인)

## 테스트 결과

- `npx tsc --noEmit` — **pass**

## 남은 위험

- `users.email` 컬럼이 없으면 취소처리자 표시는 UUID 위주(조회 실패 시 map 비움).

## 다음 권장 작업

- `confirmed` allocation에 대한 별도 비즈니스 취소(수동)가 필요하면 별도 설계.
