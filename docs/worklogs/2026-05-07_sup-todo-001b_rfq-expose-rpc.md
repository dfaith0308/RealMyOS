# SUP-TODO-001-B — RFQ 노출 RPC migration 초안

| 필드 | 값 |
|------|-----|
| **상태** | 부분완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | DB 미적용; `getSupplierRfqs` 앱 연동·settings 키 상수·2단계 지역 필터 후속 |

## 작업 목적

공급자는 `rfq_requests` RLS(buyer `tenant_id` 기준)로 타 buyer RFQ를 직접 조회할 수 없다. `tenant_relationships`(status=`active`)로 1단계 “기존 거래처”를 정의하고, 발주자별 `settings`의 노출 분 단위로 2·3단계 시각을 계산하는 **SECURITY DEFINER** RPC를 migration 파일로만 추가한다.

## 관련 `tasks.md` ID

- `SUP-TODO-001-B` (부모: `SUP-TODO-001`)

## 수정 파일 목록

- `supabase/migrations/20260507010000_create_get_supplier_rfqs.sql` (신규)
- `docs/tasks.md`

## 변경 내용 요약

- 함수 `public.get_supplier_rfqs(p_supplier_tenant_id uuid)`: `my_buyers` CTE, 행별 `settings`(발주자 `tenant_id`)에서 `rfq_expose_level2_minutes` / `rfq_expose_level3_minutes` 기본 30·120, `expose_level` 1/2/3, `WHERE open` 및 (기존 거래처 **또는** 경과 ≥ l2).
- 원안 대비: `expose_level`에서 3이 2보다 먼저 평가되도록 수정; `settings`에 `tenant_id` 조건; `p_supplier_tenant_id = get_my_tenant_id()` 가드; `GRANT EXECUTE … authenticated`.
- 2단계 “지역 확장” 조건은 SQL에 없음(전 단계와 동일 풀, 라벨만 2→3).

## migration 여부

파일 추가만 — **`20260507010000_create_get_supplier_rfqs.sql` (미적용)**.

## 테스트 결과

DB 실행 금지 정책에 따라 **미실행**. 적용 후 `get_supplier_rfqs(ctx.tenant_id)` 및 RLS 외 노출 범위 수동 검증 필요.

## 남은 위험

- `get_my_tenant_id`·`settings` RLS가 RPC 내부에서 기대대로 동작하는지(SECURITY DEFINER 시퀀스) 배포 환경에서 확인.
- 앱 `getSupplierRfqs`가 아직 RPC를 호출하지 않음 → 적용 전까지 목록은 기존 동작.
- `rfq_requests.status` 캐스트·enum 이름 드리프트 시 조건 조정 필요.

## 다음 권장 작업

- 승인 후 migration 적용 → `src/actions/rfq.ts`에서 `rpc('get_supplier_rfqs', { p_supplier_tenant_id: ctx.tenant_id })` 연동.
- `TenantSettings`·`DEFAULT_SETTINGS`에 `rfq_expose_level2_minutes` / `rfq_expose_level3_minutes` 추가 및 설정 UI/시드 정책 확정.
- 2단계 지역 필터(공급자/발주자 region 정합) 설계.
