# Phase 2 — RES-PARTIAL-005/006 tenant guard 보강

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

식당OS 서버 액션에서 tenant 소유권 검증/스코프가 누락된 write 경로를 보강해, 앱 레이어에서 RULE-01(tenant_id 스코프)을 명시적으로 강제한다(RULE-22).

## 관련 tasks.md ID

- RES-PARTIAL-005
- RES-PARTIAL-006

## 수정 파일 목록

- `resturant_os/src/actions/rfq.ts`
- `resturant_os/src/actions/settings.ts`
- `docs/tasks.md`
- `docs/worklogs/2026-05-06_res-partial-005-006_tenant-guard-fix.md`

## 수정 전/후 (요약)

### RES-PARTIAL-005 (`rfq.ts`)

- **수정 전**: `rfq_requests`를 `id`로만 조회 후, `tenant_id`(인자)를 `buyer_tenant_id`로 쓰지만 `rfq.tenant_id` 소유권 교차 검증이 없음.
- **수정 후**: `rfq` 조회 직후 `rfq.tenant_id !== tenant_id`이면 실패 처리(`권한 없음`)하여 소유권을 앱 레이어에서 명시 검증.

### RES-PARTIAL-006 (`settings.ts`)

- **수정 전**:
  - `upsertIngredient`의 update 경로가 `eq('id', input.id)`만 사용.
  - `deleteIngredient`가 `eq('id', id)`만 사용.
- **수정 후**:
  - `upsertIngredient` update 경로에 `eq('tenant_id', input.tenant_id)` 추가.
  - `deleteIngredient`는 함수 내부에서 `getTenantId()`로 `tenant_id`를 확보(실패 시 `인증 필요`)한 뒤, update에 `eq('tenant_id', tenant_id)` 추가.

## tenant_id 패턴 근거

- `settings.ts`는 이미 `getIngredients(tenant_id)` 등에서 `.eq('tenant_id', tenant_id)` 패턴을 사용하고 있어 동일 패턴으로 write도 강화했다.

## migration 여부

- 없음

## 테스트 결과

- 에디터 진단: 수정한 두 파일에서 linter 오류 없음

## 남은 위험

- `deleteIngredient`는 내부에서 `getTenantId()`를 호출하므로, 호출 컨텍스트에 따라 redirect 동작이 발생할 수 있다(인증/온보딩 흐름). 본 작업에서는 실패 시 `{ success: false, error: '인증 필요' }`로 처리했다.

## 다음 권장 작업

- Phase 2에서 다른 write 액션들도 동일 기준으로 tenant 스코프를 강제하고, 중복 구현을 줄인다.

