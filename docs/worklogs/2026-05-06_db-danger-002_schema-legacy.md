# DB-DANGER-002 종료 — schema.sql 레거시 확정·운영 DB SSOT

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`resturant_os/supabase/schema.sql`과 앱 코드 간 이름 불일치로 표기되던 **DB-DANGER-002**를, **코드·DB·migration 변경 없이** 정본(SSOT) 선언과 레거시 스냅샷 라벨로 종료한다.

## 관련 tasks.md ID

- `DB-DANGER-002` (종료)
- 맥락: `DB-CHECK-006`, `DB-FAKE-002`, `RES-PARTIAL-002`, `RES-PARTIAL-003`

## 수정 파일 목록

- `resturant_os/supabase/schema.sql` — 상단 `[LEGACY SNAPSHOT]` 주석 4줄 추가
- `realmyos/docs/tasks.md` — `DB-DANGER-002` Forensic 판정·완료 기준·작업 이력
- `realmyos/docs/worklogs/2026-05-06_db-danger-002_schema-legacy.md` — 본 파일

## 변경 내용 요약

- **결정(승인)**: SSOT = **운영 realmyos Supabase** (`cqiwcyuclpuarynrreat`). `schema.sql` = **레거시 참고 스냅샷**만; 이 파일 기준 DDL 변경 금지, 정합 판단은 운영 DB 기준.
- **실행**: 주석 추가 + `tasks.md` 갱신만. 앱 소스·원격 DB·migration 미변경.

## 불일치 목록 (이력 보존 — 사전 조사 요약)

저장소 `schema.sql` 대비 `resturant_os/src`에서 확인된 대표 불일치(코드 수정은 본 라운드에서 미실시):

| 유형 | 스냅샷 | 코드 |
|------|--------|------|
| 테이블명 | `payments_outgoing` | `payments` |
| 테이블명 | (없음) | `tenants`, `users`, `menus` |
| 테이블명 | `order_items` | `restaurant_order_items` |
| 컬럼 | `rfq_bids.supplier_id` | insert 시 `supplier_tenant_id` |
| 지급 row | `supplier_name` 등 | `counterparty_name`, `direction`, `tenant_id` 등 혼용 |

## 결정 사항 (승인 반영)

- SSOT: 운영 Supabase (realmyos 통합 스키마).
- `schema.sql`: 레거시 참고 스냅샷 확정.
- 코드 수정 없음 / DB 수정 없음 / migration 없음.

## migration 여부

- **없음** — migration 파일 미생성·미적용.

## 테스트 결과

- 미실행 — 문서·주석만 변경.

## 남은 위험

- **앱 코드**는 여전히 운영 SSOT DDL과 1:1이라고 가정할 수 없음 → `RES-PARTIAL-002`·`RES-PARTIAL-003`·실 DB 대조 필요 시 별도 작업.
- `DB-FAKE-002` 등 다른 ID는 본 worklog에서 종결하지 않음.

## 다음 권장 작업

- Phase 1 잔여: `DB-DANGER-003` 등. 코드↔운영 정렬은 승인된 범위에서 점진적으로.
