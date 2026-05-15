| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

`commerce_order_allocations`가 **confirmed**될 때 플랫폼이 공급자에게 지급 예정인 채무를 **`supplier_payables`** 원장에 남기고, 관리자OS에서 집계·목록·allocation과의 연결 상태를 볼 수 있게 한다. 실제 지급·`payments` SSOT 변경·공급자OS UI 변경은 하지 않는다.

## 관련 `tasks.md` ID

- **`[PLATFORM-ERP-001]`** (하위 실행: **PLATFORM-ERP-P2-003**)

## 수정 파일 목록

- `supabase/migrations/20260515220000_create_supplier_payables.sql` — 테이블·UNIQUE·인덱스·CHECK·RLS
- `src/actions/admin/commerce-allocation.ts` — `createSupplierPayableFromAllocation`, `confirmCommerceAllocation` 연동, allocation 목록에 원장 조인
- `src/actions/admin/supplier-payables.ts` — `getSupplierPayablesAdminData`
- `src/components/commerce/CommerceAllocationsClient.tsx` — 원장 컬럼·경고·재시도 버튼
- `src/components/commerce/CommercePayablesClient.tsx` — 신규
- `src/app/(admin)/admin/commerce/payables/page.tsx` — 신규
- `src/app/(admin)/admin/commerce/allocations/page.tsx` — 원장 페이지 링크
- `src/app/(admin)/admin/commerce/orders/page.tsx` — 원장 페이지 링크
- `src/components/layout/AdminSidebar.tsx` — 메뉴 항목
- `docs/tasks.md` — 작업 이력·문서 인벤토리 항목

## 변경 내용 요약

- 확정 직후 `supplier_payables`에 **unpaid** 행 INSERT(동일 `commerce_order_allocation_id` UNIQUE로 중복 방지).
- `payer_tenant_id` = 플랫폼 owner 상수, `payee_tenant_id` = `supplier_tenant_id`.
- `confirmCommerceAllocation` 성공 후 원장 생성 실패 시 allocation 확정은 유지, `supplier_payable_create_failed` 로그·`payable_error` 반환.
- 관리자 `/admin/commerce/payables`에서 KPI·공급자별 요약·행 목록 조회.

## migration 여부

**파일 추가(미적용)** — `supabase/migrations/20260515220000_create_supplier_payables.sql` (운영 DB 적용은 별도 승인).

## 테스트 결과

- `npx tsc --noEmit` — **pass**
- `npm run build` — **pass** (Next.js 14.2.20)

## 남은 위험

- migration 미적용 환경에서는 런타임에서 테이블 부재 오류 가능.
- 집계 쿼리는 상한(25k / 2k)이 있어 대량 데이터에서 표본·목록이 잘릴 수 있음.

## 다음 권장 작업

- 운영 DB에 migration 적용(승인 후) 및 샘플 allocation으로 원장 생성 스모크.
- **paid** 전환·실지급·`payments` outbound 연계는 별 과제로 분리.

---

## SECTION 1 — 사전 확인 결과 (요약)

- **`payments`**: storefront 수금 등 **실제 입금 이벤트**에 사용. 이번 범위에서 **unpaid 채무를 `payments`에 섞지 않음**(요청 준수).
- **`commerce_order_allocations`**: `id`, `supplier_tenant_id`, `supplier_payable_amount`, `status`, `confirmed_at`/`confirmed_by` 등 기존 P2-001 구조 유지.
- **공급자OS**: UI·쿼리 변경 없음. `supplier_payables` RLS로 해당 공급자 tenant는 **자신의 행만 SELECT** 가능(관리자는 전체).

## SECTION 2 — `payments` 재사용 vs `supplier_payables` 신설

**선택: 옵션 B (`supplier_payables` 신설).**  
`payments`는 실제 수금/지급에 가깝고, 지급 예정 채무를 넣으면 운영·정산·공급자 화면에서 **실지급과 혼동**될 위험이 큼. 별도 원장이 settlement 확장에도 유리함.

## SECTION 3 — `supplier_payables` 구조

allocation·주문·품목·공급자·플랫폼 payer/공급자 payee, 금액(`item_amount`, `platform_fee_amount`, `payable_amount`), 상태(`unpaid`/`paid`/`cancelled`), 확정·지급·취소 감사 필드, `note`. CHECK로 비음수 및 `payable_amount + platform_fee_amount = item_amount`.

## SECTION 4 — confirmed allocation → payable 생성 흐름

1. 관리자가 allocation **지급 예정 확정** → `confirmCommerceAllocation`이 `pending`→`confirmed` 갱신 및 감사 로그.  
2. 이어서 `createSupplierPayableFromAllocation` 호출 → confirmed 검증 후 INSERT 또는 기존 행 반환.

## SECTION 5 — 중복 방지

`UNIQUE (commerce_order_allocation_id)` + 애플리케이션 선조회; DB 유니크 위반(23505) 시 기존 id 재조회.

## SECTION 6 — 관리자OS UI

- **`/admin/commerce/payables`**: KPI(미지급/지급완료 합계, 공급자 수, 미지급 건수), 공급자별 요약, 원장 목록.
- **`/admin/commerce/allocations`**: 행별 supplier 원장 연결 여부·ID·**미생성 시 재시도** 버튼(지급 실행 아님).

## SECTION 7 — RLS

- **관리자** `is_admin()` — 전체 read/write.
- **공급자** `supplier_tenant_id = get_my_tenant_id()` — **SELECT만** (insert/update/delete 없음).

## SECTION 8 — limitation

- 실제 지급 실행·은행이체 없음.
- **paid** 처리 UI·백엔드 전환 없음.
- settlement automation 없음.
- 공급자OS 알림·UI 변경 없음.
