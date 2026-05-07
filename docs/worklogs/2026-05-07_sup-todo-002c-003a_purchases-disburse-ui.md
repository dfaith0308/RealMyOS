# SUP-TODO-002-C + SUP-TODO-003-A — 매입 등록·지급 분배 UI

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |

## 작업 목적

`purchases`·`payment_allocations` 스키마에 맞춰 **매입 목록/등록**과 **지급 등록+미지급 매입 분배** 화면을 추가하고, **RULE-19**에 따라 지급·분배 저장은 **`create_disbursement_with_allocations` RPC** 한 번으로 처리한다.

## 관련 `tasks.md` ID

- `SUP-TODO-002-C`
- `SUP-TODO-003-A`

## 수정 파일 목록

- `supabase/migrations/20260507050000_create_disbursement_with_allocations.sql` — `direction`을 **`'outbound'::public.payment_direction`** 로 캐스트(운영 enum typname이 다르면 `format_type` 쿼리로 확인 후 교체)
- `src/actions/payment.ts` — `createDisbursement`, 타입 export
- `src/actions/purchase.ts` — `revalidatePath` 보강
- `src/app/(app)/purchases/page.tsx`, `new/page.tsx`
- `src/app/(app)/disbursements/new/page.tsx`
- `src/components/purchases/PurchaseListClient.tsx`, `PurchaseCreateClient.tsx`
- `src/components/disbursements/DisbursementCreateClient.tsx`
- `src/components/layout/Sidebar.tsx` — 매입관리, 지급 등록 링크
- `docs/tasks.md`
- 본 worklog

## 변경 내용 요약

- **매입**: `getPurchaseList`·`getUnpaidPurchases`·`createPurchase`(RULE-01 단일 테이블 insert).
- **지급 분배**: 클라이언트에서 분배 합계 ≤ 지급액 검증 후 RPC 호출; 매입 행별 분배 + **선지급(미연결)** 금액 지원(`purchase_id` null).
- **RPC**: `payments` outbound `pending` + `payment_allocations` 다건 insert; `purchase_id` 있으면 `purchases` 테넌트 검증.

## migration 여부

- **파일**: `20260507050000_create_disbursement_with_allocations.sql` (저장소 기록).
- **운영 적용**: 본 로그 시점 **사용자 파이프라인에서 실행** — 에이전트는 DB 미실행.

## 테스트 결과

- `npx tsc --noEmit` — 통과 (realmyos).

## 남은 위험

- **`payment_direction` 명 오류**: 운영 `payments.direction`의 실제 enum 이름이 다르면 RPC 생성이 실패한다. migration 파일 상단 주석의 `format_type`/`typname` 쿼리로 확인 후 캐스트 수정.
- **`purchases.status` 자동 갱신 없음**: 분배 후에도 매입 행은 `unpaid`/`partial` 그대로일 수 있음 — 향후 집계 RPC·트리거 또는 003-D에서 정합.

## 다음 권장 작업

- `SUP-TODO-002-D` 지급 취소(reversed) 및 상세 `/disbursements/[id]`.
- `SUP-TODO-003-B`~`D` 매입·원장 연동.
