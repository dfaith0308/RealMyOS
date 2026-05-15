# RES-PARTIAL-001-F — `payments_outgoing` 레거시 주석 처리

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`resturant_os/supabase/schema.sql`에 남아있는 `payments_outgoing` 테이블 정의가 “현재 SSOT”로 오인되어, 식당OS 돈관리 구현이 레거시 테이블을 기준으로 회귀하는 위험을 차단한다. 주석만 추가하고 로직/DDL 자체는 변경하지 않는다.

## 관련 tasks.md ID

- RES-PARTIAL-001-F
- (연계) RES-PARTIAL-001 — 단일 `payments`(direction='outbound') 방향 확정

## 수정 파일 목록

- `resturant_os/supabase/schema.sql`
- `docs/tasks.md`
- `docs/worklogs/2026-05-06_res-partial-001f_legacy-cleanup.md`

## 변경 내용 요약

- `payments_outgoing` 테이블 정의 바로 위에 아래 레거시 주석을 추가했다.
  - `[LEGACY] payments_outgoing은 레거시 테이블입니다.`
  - `현재 식당OS는 payments 단일 테이블(direction='outbound')을 사용합니다.`
  - `이 테이블 기준으로 코드 작성 금지.`
  - `확정일: 2026-05-06 (RES-PARTIAL-001 방향 확정)`

## migration 여부

- 없음 (주석만)

## 테스트 결과

- 미실행 — 주석/문서 변경만 수행

## 남은 위험

- `schema.sql` 자체가 레거시 스냅샷 성격을 갖는다는 점은 `DB-DANGER-002`에서 이미 문서화되어 있으나,
  개별 테이블 단위로도 레거시 표기가 없으면 오인이 재발할 수 있다.

## 다음 권장 작업

- `schema.sql` 내 레거시 테이블/컬럼이 더 존재한다면 동일한 방식으로 “SSOT 아님” 주석을 추가해 회귀 위험을 낮춘다.

