| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

관리자OS에서 커머스 주문(`commerce_orders`)을 **COMMERCE-FLOW.md** 규칙에 맞게 조회·전이하고, 무통장·카카오 **결제대기** 건을 상단 큐로 노출해 수동 확인 업무를 줄인다.

## 관련 `tasks.md` ID

- `COMMERCE-003` (주 처리)
- `COMMERCE-004` (사이드바 `주문처리` 메뉴 — 본 작업에 포함)

## 수정 파일 목록

- `supabase/migrations/20260509020000_add_commerce_orders_columns.sql`
- `src/actions/admin/commerce.ts`
- `src/app/(admin)/admin/commerce/orders/page.tsx`
- `src/app/(admin)/admin/commerce/orders/loading.tsx`
- `src/components/commerce/OrdersClient.tsx`
- `src/components/layout/AdminSidebar.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-09_feat_commerce-003-admin-orders.md`

## 변경 내용 요약

- `order_number`, `refund_required`, `refund_pending_at`, `generate_order_number()` migration을 저장소에 소급 추가(헤더 주석: 운영 적용 완료 일자).
- 서버 액션: `getCommerceOrders`(미처리 큐 별도 조회 + 목록 필터·정렬), `getCommerceOrderDetail`, `updateCommerceOrderStatus`(전이 검증·`expectedCurrentStatus`·DB `status` 이중 잠금, `payment_status`/환불 필드 동기화, `admin_logs` `commerce_order_status_changed`).
- `/admin/commerce/orders`: 확인 필요 섹션, 필터, 액션 중심 테이블, `paid`→`cancelled` 확인 모달, 상세 모달, `loading.tsx`.
- `AdminSidebar`에 `주문처리` 링크 추가.

## migration 여부

파일 추가 — `20260509020000_add_commerce_orders_columns.sql` (저장소 반영; 로컬·운영 DB 적용은 환경별 확인)

## 테스트 결과

- `npx tsc --noEmit` — pass (realmyos 루트)

## 남은 위험

- 기존 행에 `order_number`가 비어 있으면 UI는 "주문번호 미할당"으로 표시; 주문 생성 시 번호 부여는 별도 작업일 수 있음.
- `generate_order_number()`는 migration에만 정의되어 있으며, 앱 insert 경로에서 아직 호출하지 않을 수 있음.

## 다음 권장 작업

- 주문 생성 시 `order_number` 자동 채움(DB 트리거 또는 앱)과 중복 시 재시도 정책 정리.
- `COMMERCE-005` 식당OS `/buy`와 주문 데이터 연계·E2E 점검.
