# SUP-TODO-002-A — 지급관리 라우트·목록 (Phase 5)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |

## 작업 목적

PRODUCT §6-9 지급관리에 맞춰 공급자OS에 **`/disbursements` 지급 목록** 진입점을 두고, 운영 `payments` 테이블에서 **`direction='outbound'`** 지급만 RULE-01(`tenant_id`/`payer_tenant_id` 스코프)로 조회한다.

## 관련 `tasks.md` ID

- `SUP-TODO-002-A` (상위 `SUP-TODO-002`는 B~D 잔여)

## 수정 파일 목록

- `src/actions/payment.ts` — `getDisbursementList`, `DisbursementListItem`
- `src/app/(app)/disbursements/page.tsx`
- `src/components/disbursements/DisbursementsClient.tsx`
- `src/components/layout/Sidebar.tsx` — 지급관리 메뉴
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-todo-002a_disbursements-route.md`

## 변경 내용 요약

- **조회**: `direction=outbound` AND (`payer_tenant_id` OR 레거시 `tenant_id`) = `ctx.tenant_id`; 컬럼은 운영 스키마에 맞춤; `due_date` 오름차순(nulls last)·`created_at` 보조, **limit 50**.
- **UI**: 거래처명·금액(`formatKRW`)·지급예정일·상태·결제수단; 상태 쿼리 필터 `pending`/`confirmed`/`reversed`(전체는 미지정).
- **IA**: Sidebar에 지급관리 그룹(목록 활성, 등록/상세 준비중).
- **DB**: 이번 작업 **migration 없음**; 사용자 제공 `information_schema` 기준으로 select 컬럼 정합.

## migration 여부

없음.

## 테스트 결과

- `npx tsc --noEmit` — 통과 (realmyos).

## 남은 위험

- 일부 outbound 행은 **`status=planned`** 등 필터 옵션에 없는 값일 수 있음 — “전체”에서는 표시됨.
- `payment_date` NOT NULL은 **이번 조회 미사용**; 향후 지급 등록(002-B~) 시 기본값·정합 필요.

## 다음 권장 작업

- `SUP-TODO-002-B`~`D`: 등록·상세·allocations·reversed 흐름 및 PRODUCT 6-9 나머지.
