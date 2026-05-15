# DB-DANGER-003 — today_events.action_kind CHECK 확장 (migration 파일만)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

운영 `today_events.action_kind` CHECK가 `payment` / `rfq` / `sku` 만 허용하는데, 식당OS 코드가 `delivery`·`order_create` 도 insert 하므로, **CHECK를 코드 기준으로 확장하는 migration**을 저장소에만 추가한다. **실 DB 실행은 하지 않음.**

## 관련 tasks.md ID

- `DB-DANGER-003` (종료 — 저장소·계획 단계)

## 수정 파일 목록

- `realmyos/supabase/migrations/20260506120000_fix_today_events_action_kind_check.sql` (신규)
- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-06_db-danger-003_today-events-check.md` (본 파일)
- `resturant_os/src/actions/today-events.ts` — **변경 없음** (`ActionKind`에 이미 `delivery`·`order_create` 포함 확인)

## 불일치 목록 (사전 조사 요약)

| CHECK (운영·승인 전제) | 코드 insert |
|------------------------|-------------|
| `payment`, `rfq`, `sku` (+ NULL) | 동일 + **`delivery`** (`TodayDeliveryCard`) + **`order_create`** (`rfq.ts` `acceptBid`) |

## 운영 DB 확인 결과

- **본 worklog 작성 시점**: Supabase에 직접 연결해 DDL을 재조회하지는 않음.
- **승인된 전제**: 운영 `today_events.action_kind` CHECK가 `payment` / `rfq` / `sku` 만 허용 중이며, 코드와 불일치 → migration으로 확장하기로 결정.

## migration 파일명

- `realmyos/supabase/migrations/20260506120000_fix_today_events_action_kind_check.sql`
- **적용 여부**: **미적용** (dev/validation/production 실행은 별 승인·`README.md` 환경 순서 따름).

## ActionKind 타입 상태

- `resturant_os/src/actions/today-events.ts` 14행:  
  `export type ActionKind = 'payment' | 'rfq' | 'sku' | 'delivery' | 'order_create'`  
- **수정 불필요** (이미 `delivery`·`order_create` 포함).

## 변경 내용 요약

- `DROP CONSTRAINT IF EXISTS today_events_action_kind_check` 후 동일 이름으로 CHECK 재추가, 허용 값에 `delivery`·`order_create` 추가.

## migration 여부

- **파일 추가** — `20260506120000_fix_today_events_action_kind_check.sql` (DB **미실행**).

## 테스트 결과

- 미실행 — DDL 파일만 추가, DB·앱 미배포.

## 남은 위험

- PostgreSQL에서 인라인 CHECK의 **실제 제약 이름**이 `today_events_action_kind_check`가 아닐 수 있음 → 적용 시 `information_schema` 또는 `\d today_events`로 확인 후 필요 시 migration 조정.
- `resturant_os/supabase/schema.sql`(레거시 스냅샷)의 CHECK 문구는 **자동 동기화하지 않음**; SSOT는 운영 + `realmyos/supabase/migrations/`.

## 다음 권장 작업

- governance에 따라 **dev → validation → production** 순으로 migration 적용 및 smoke test (`delivery`·`order_create` 로그 insert).
