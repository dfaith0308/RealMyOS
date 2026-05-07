# 2026-05-07 — RES-MISSING-002 메뉴 + 원가 계산 (/settings/menus)

## 목적

- PRODUCT §8-7 정의대로 식당OS에서 **메뉴 등록/수정 + 식재료 구성 기반 원가/마진율 실시간 계산**을 제공한다.
- 원가/마진율은 **계산값(DB 저장 금지)** 으로 유지한다. (RULE-02)
- 대표메뉴는 **최대 3개**까지(서버에서 검증)로 제한한다.

## 범위 / 관련 ID

- `RES-MISSING-002`

## 구현 요약

- **화면**: `resturant_os/src/app/(app)/settings/menus/page.tsx`
  - 메뉴 목록: 메뉴명/판매가/원가/마진율/대표메뉴 표시
  - 등록/수정: 메뉴 필드 + 식자재 구성(1인분 기준) 입력
  - 원가 계산 3단계:
    - LEVEL 1: 사용자가 식재료 직접 입력
    - LEVEL 2: “대략적인 양만 입력해도 충분합니다 ±20% OK” 안내
    - LEVEL 3: 식재료가 없을 때 `menu_cost_cache` 추정 원가 표시(±15% 문구)

- **서버 액션**: `resturant_os/src/actions/menus.ts` (신규)
  - `getMenus()`에서 `menu_ingredients → ingredients(current_price)` 조인으로 원가를 계산해 반환
  - `createMenu / updateMenu / deactivateMenu` 구현 (`tenant_id` 강제, soft delete)
  - 대표메뉴 최대 3개 제한을 서버에서 검증
  - `getMenuCostEstimate(menu_name)`으로 `menu_cost_cache` 조회(정확 일치 → 부분 일치 fallback)

- **migration 파일 소급(문서용)**: `resturant_os/supabase/migrations/20260507200000_create_menus.sql`
  - `menus`, `menu_ingredients`, `menu_cost_cache` DDL + RLS + index 포함

## 변경 파일

- `resturant_os/supabase/migrations/20260507200000_create_menus.sql`
- `resturant_os/src/actions/menus.ts`
- `resturant_os/src/app/(app)/settings/menus/page.tsx`
- `resturant_os/src/components/settings/MenusClient.tsx`
- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-07_res-missing-002_menus.md`

## 테스트

- `resturant_os`: `npx tsc --noEmit` ✅

## 리스크 / 메모

- `menu_ingredients`의 물리 삭제는 RULE-10에 위배되므로, UI에서는 “구성 제외” 동작을 update 기반으로 처리(계산에서 제외)한다.

