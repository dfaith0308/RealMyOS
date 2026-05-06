# SUP-DANGER-002 운영 DB 적용 완료 (구버전 RPC DROP)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`SUP-DANGER-002`의 핵심 원인(주문 라인 갱신 후 헤더 합계 갱신이 원자적으로 묶이지 않음)을 해결하기 위해 도입한 `update_order_lines` RPC(5파라미터 버전)의 **운영 DB 적용 상태를 확정**하고, 남아 있을 수 있는 **구 3파라미터 버전 RPC를 제거**하여 혼선을 제거한다.

## 관련 tasks.md ID

- SUP-DANGER-002

## 수정 파일 목록

- `realmyos/supabase/migrations/20260506140000_update_order_lines_atomic.sql`
- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-06_hotfix_sup-danger-002_db-apply.md`

## 변경 내용 요약

- `update_order_lines`의 **구 3파라미터 버전**(`uuid, uuid, jsonb`)을 제거하는 `DROP FUNCTION`을 migration 파일 맨 끝에 추가했다.
- `tasks.md`의 `SUP-DANGER-002`에 운영 DB 적용 완료 및 구버전 DROP 완료 사실을 작업 이력으로 남기고 **종료 처리**했다.

## migration 여부

- production 적용 — `20260506140000_update_order_lines_atomic.sql` (운영 DB에서 5파라미터 버전 존재 확인, 3파라미터 버전 DROP 완료)

## 테스트 결과

- 미실행 — 문서/DDL 정리 작업이며, 별도 애플리케이션 테스트/CI는 수행하지 않았다.

## 남은 위험

- 운영 DB 외 환경(dev/staging 등)에 동일 함수가 남아 있을 수 있음(환경별 동기화 정책에 따라 확인 필요).

## 다음 권장 작업

- 다른 환경에도 동일하게 **3파라미터 버전 RPC가 없는지** 확인하고, 호출 경로가 남아 있지 않은지(특히 과거 클라이언트/스크립트) 점검한다.

