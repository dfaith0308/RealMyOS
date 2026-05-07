# SUP-TODO-001-D — RFQ 낙찰/탈락 알림 (MVP)

| 필드 | 값 |
|------|-----|
| **상태** | 부분완료 |
| **완료일** | 2026-05-07 |

## 작업 목적

PRODUCT §6-2 알림 중 **입찰 낙찰·탈락**을 최소 구현한다. `accept_bid_and_create_order_atomic`가 `rfq_bids` 상태를 갱신한 뒤, 공급자 테넌트 `notifications` 행을 생성하고 공급자OS에서 목록·미읽음 표시를 제공한다.

## 관련 `tasks.md` ID

- `SUP-TODO-001-D` (부모: `SUP-TODO-001`)

## 수정 파일 목록

**realmyos**

- `src/actions/notifications.ts` (신규)
- `src/lib/rfq-notify-suppliers.ts` (신규)
- `src/actions/rfq.ts` (주석)
- `src/app/(app)/rfq/page.tsx`
- `src/components/rfq/RfqHubClient.tsx`
- `docs/tasks.md`

**resturant_os** (동일 DB — 발주 확정 후 알림 트리거)

- `src/lib/rfq-notify-suppliers.ts` (신규, realmyos와 동일 로직)
- `src/actions/rfq.ts` (`acceptBidAndCreateOrder` 내 호출)

- `docs/worklogs/2026-05-07_sup-todo-001d_rfq-notifications.md`

## 변경 내용 요약

- `notifyRfqBidOutcomesAfterAccept`: buyer 세션으로 RFQ 소유 검증 후 입찰별 `accepted`/`rejected`에 맞춰 알림 insert.
- 공급자OS: `getNotifications`, `getUnreadNotificationCount`, `markNotificationRead` (RULE-01 `tenant_id`).
- `/rfq` 미읽음 배지 + 알림 카드(읽음/이동).
- 임의 `tenant_id`로 알림 insert 가능한 server action은 **노출하지 않음** (보안).

## migration 여부

없음.

## 테스트 결과

- `npx tsc --noEmit` — realmyos, resturant_os 각각 통과.

## 남은 위험

- `notifications` RLS가 buyer 세션의 **타 테넌트** `tenant_id` insert를 막으면 알림이 생성되지 않음 → 정책 또는 SECURITY DEFINER RPC 후속.
- 신규 RFQ·마감 임박·supplier_bid_viewed 등 §6-2 나머지는 미구현.

## 다음 권장 작업

- 운영에서 발주 확정 후 알림 insert 스모크 테스트.
- 알림 RLS·중복 방지(dedup) 및 나머지 §6-2 이벤트.
