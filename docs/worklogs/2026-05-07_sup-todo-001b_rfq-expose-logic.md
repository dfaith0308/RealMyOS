# SUP-TODO-001-B — RFQ 노출 단계 앱 연동

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |

## 작업 목적

운영 DB에 적용된 `get_supplier_rfqs` RPC를 공급자 RFQ 목록에 연결하고, `expose_level`(기존 거래처 / 지역 확장 / 전체 공개)을 UI에 표시한다.

## 관련 `tasks.md` ID

- `SUP-TODO-001-B`

## 수정 파일 목록

- `src/actions/rfq.ts`
- `src/components/rfq/RfqHubClient.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-todo-001b_rfq-expose-logic.md`

## 변경 내용 요약

- `getSupplierRfqs`: `rfq_requests` 직접 조회 제거 → `supabase.rpc('get_supplier_rfqs', { p_supplier_tenant_id: ctx.tenant_id })`, `SupplierRfqRow`에 `expose_level` 추가 및 응답 정규화.
- `RfqHubClient`: 발주요청 표에 `노출` 열 및 배지(1·2·3), `null`은 비표시.

## migration 여부

없음(이번 턴). RPC DDL은 기존 migration 파일·운영 적용 전제.

## 테스트 결과

- `npx tsc --noEmit` — 통과.

## 남은 위험

- Supabase 클라이언트 타입에 RPC가 없어 수동 필드 매핑 사용; 스키마 변경 시 동기화 필요.
- 2단계 지역 필터·`settings` 키 시드는 후속.

## 다음 권장 작업

- `TenantSettings`에 `rfq_expose_level2_minutes` / `rfq_expose_level3_minutes` 반영(RULE-16).
- `SUP-TODO-001-C` 입찰 UI.
