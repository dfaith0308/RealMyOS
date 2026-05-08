# 2026-05-08 — admin 라우트 정규화 + HIGH 감사 수정

## 목표

- `(admin)` route group 하위 페이지들이 실제 URL에서도 `/admin/*` prefix 를 갖도록 정규화
- 전수조사에서 HIGH 로 분류된 항목들 즉시 수정
  - RULE-10 물리 삭제 제거(soft delete)
  - RULE-01 tenant_id 누락 보완
  - RULE-03 N+1 제거(배치 처리)

## 변경 요약 (realmyos)

### 1) admin 라우트 구조 정규화

- 기존 `(admin)` 하위에서 `/trades`, `/participants` 등으로 노출되던 경로를
  `src/app/(admin)/admin/*` 하위로 재배치하여 **실제 URL이 `/admin/*`** 가 되도록 변경
- `/admin` 진입점(`src/app/(admin)/page.tsx`)을 `redirect('/admin/dashboard')`로 수정

### 2) RULE-03 (N+1) 제거

- `src/actions/product.ts`
  - `updateProduct()` 내 `product_prices` upsert 를 루프 단건 호출 → **배치 upsert 1회**로 변경

### 3) RULE-01 (tenant_id) 누락 보완

- `src/actions/product.ts`
  - `getProducts()` 기본 조회에 `tenant_id` 필터 추가
- `src/app/(app)/products/[id]/edit/page.tsx`
  - 상품/공급자 조회에 `tenant_id` 필터 추가
- `src/actions/order.ts`
  - 라인 저장 실패 rollback update 에 `tenant_id` 조건 추가
- `src/actions/quote.ts`
  - `quote_logs` insert 에 `tenant_id` 기록 추가
  - 상세/목록 관련 `quote_items`, `quote_logs`, `quotes` 후속 조회들에 `tenant_id`/active 조건 보강

### 4) RULE-10 (물리 삭제 제거)

- `src/actions/quote.ts`
  - 실패 rollback 에서 `quotes.delete()` 제거 → `quotes.deleted_at` 업데이트로 변경
  - 견적 수정 시 `quote_items.delete()` 제거 → `quote_items.is_active=false` 로 soft delete

### 5) migration (코드-스키마 정합 보강)

- `supabase/migrations/20260508161000_fix_quotes_soft_delete_and_logs.sql`
  - `quote_items.is_active` 추가 (soft delete)
  - `quote_logs.tenant_id` 추가 (RULE-01)

## 변경 요약 (resturant_os)

### 1) RULE-10 (물리 삭제 제거) + RULE-01 보강

- `src/actions/settings.ts`
  - `fixed_costs.delete()` 제거 → `is_active=false` 업데이트로 변경
  - `getFixedCosts()` 는 `is_active=true`만 조회
  - update 시 `tenant_id` 조건 보강
- `supabase/migrations/20260508162000_fixed_costs_soft_delete.sql`
  - `fixed_costs.is_active` 추가 + active 인덱스 추가

### 2) RULE-01 (tenant_id) 누락 보완

- `src/actions/rfq.ts`
  - `closeRfq()` update 에 `tenant_id` 조건 추가 (현재 tenant 컨텍스트 기준)

### 3) RULE-03 (N+1) 제거

- `src/actions/import.ts`
  - supplier seed 로직의 `maybeSingle` 반복 호출 제거 → `in('name', [...])` 1회 조회 후 missing insert

## 검증

- `npx tsc --noEmit` (realmyos + resturant_os)
- `npm run build` (realmyos + resturant_os)
- 로컬에서 `/admin/dashboard` 접속 및 `/admin/*` 라우트 연결 확인

