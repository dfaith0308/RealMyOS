# 2026-05-07 — SUP-PARTIAL-006-B 영업스케줄 UX 정합

## 목적

- PRODUCT §6-13 자동화영업의 영업스케줄 UX를 “지금 실행” 중심으로 정합 맞춘다.
- 달력/리스트 전환 + 상단 요약 + snooze(내일로) + 중복 방지를 UX에서 드러내고, **삭제(물리 DELETE)를 금지**한다.

## 관련 tasks.md ID

- `SUP-PARTIAL-006-B`

## 구현 요약

### 1) 상단 요약 (오늘 기준)

- “오늘 할 일 / 오늘 완료 / 미처리”를 `sales_schedules`에서 오늘 날짜로 집계하여 표시.

### 2) 달력↔리스트 뷰 전환

- `[달력] [리스트]` 토글 버튼 추가.
- 달력 뷰: 기존 날짜 dot 표시 + 날짜 클릭 → 해당 날짜 스케줄 카드 목록.
- 리스트 뷰: 전체 미처리(pending) 스케줄 목록을 날짜 오름차순으로 표시.

### 3) 리스트 컬럼 (PRODUCT)

- 거래처명 / 점수 / 행동유형 / 추천 스크립트 / 상태 / [즉시 실행] / [내일로]
- 점수는 `getSalesTargets()`로 계산된 위험 점수(실시간 계산)를 매핑해 표시.
- 추천 스크립트는 스케줄 `script_id` 또는 타입별 default 스크립트 타이틀을 표시.

### 4) snooze(내일로)

- “내일로” 버튼 클릭 시 `scheduled_date + 1일`로 UPDATE (삭제 아님).
- `snoozeSchedule` Server Action을 그대로 사용.

### 5) 삭제 금지 (RULE-10)

- 기존 `deleteSchedule()`의 물리 DELETE를 제거하고 **`status='cancelled'`로 취소 처리**로 변경.
- UI의 삭제 버튼은 “취소(삭제되지 않음)”으로 동작.

### 6) 중복 방지 인덱스 (소급)

- unique index가 운영 DB에 적용되어 있으므로, 소급 migration 파일을 추가:
  - `supabase/migrations/20260507210000_add_sales_schedules_unique.sql`

## 변경 파일

- `src/app/(app)/sales/schedule/SalesScheduleClient.tsx`
- `src/actions/sales.ts`
- `supabase/migrations/20260507210000_add_sales_schedules_unique.sql`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-partial-006b_schedule-ux.md`

## Migration

- 있음(소급, 실행 금지): `20260507210000_add_sales_schedules_unique.sql`

## 테스트

- `npx tsc --noEmit` ✅

## 리스크 / 남은 일

- 스케줄 취소(cancelled) 이후 재예약 UX(같은 고객/날짜) 흐름은 인덱스 조건과 함께 기대 동작을 운영에서 확인 필요.

