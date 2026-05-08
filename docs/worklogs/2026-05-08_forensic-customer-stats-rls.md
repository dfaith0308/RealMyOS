| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

`customer_stats` 테넌트 격리를 위해 RLS·정책을 소급 migration으로 고정하고, `FORENSIC.md`에 §5 부분 해소·§6 신설로 기록한다.

## 관련 `tasks.md` ID

`DB-DANGER-004` 맥락(계산값 저장)과 정합 — RLS는 별도 forensic 항목으로 §6에 명시.

## 수정 파일 목록

- `supabase/migrations/20260508030000_fix_customer_stats_rls.sql`
- `docs/FORENSIC.md` (§5 갱신, §6 `customer_stats`, 기존 문서 드리프트 §7로 이동)
- 코드 변경 없음

## 변경 내용 요약

- `ENABLE ROW LEVEL SECURITY` + `customer_stats_tenant` (`FOR ALL`, `USING`/`WITH CHECK`).
- `orders` 세 컬럼·`WITH CHECK`와 연계한 §5 부분 해소 서술.

## migration 여부

파일 추가 — 사용자 지시 기준 **운영 적용 완료(2026-05-08)** 소급 기록.

## 테스트 결과

해당 없음.

## 남은 위험

Greenfield에서 `customer_stats` 테이블·`get_my_tenant_id()` 선행 없으면 적용 실패 가능.

## 다음 권장 작업

`DB-DANGER-004` 장기 이행(원장 SSOT)과 별도로 CONTEXT/tasks 재수집(`FORENSIC.md` §7).
