# ADM-MISSING-001, ADM-MISSING-008 Action Queue + 거래 흐름 관제

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |
| **차단 사유** |  |

## 작업 목적

- PRODUCT §10-3 중앙 대시보드에 “실행 큐(Action Queue)”를 연결해, 관리자가 **보는 화면이 아니라 실행하는 화면**으로 동작하도록 정합한다.
- PRODUCT §10-4 거래 흐름 관제의 “이상 감지 → Action Queue 연결”을 최소 단위로 구현해 관리자 예외 처리 경로를 만든다.

## 관련 tasks.md ID

- `ADM-MISSING-008` (Action Queue)
- `ADM-MISSING-001` (거래 흐름 관제)

## 수정 파일 목록

- `supabase/migrations/20260507240000_create_action_queue_admin_settings.sql`
- `src/actions/admin/action-queue.ts`
- `src/actions/admin/trade-monitor.ts`
- `src/app/(admin)/dashboard/page.tsx`
- `src/app/(admin)/trades/page.tsx`
- `src/components/layout/AdminSidebar.tsx`
- `src/app/(admin)/overview/page.tsx`
- `docs/DECISIONS.md`
- `docs/tasks.md`

## 변경 내용 요약

- **Action Queue 시스템**
  - `getActionQueue`: pending/in_progress만 조회 + priority 정렬(critical → high → today → normal)
  - `resolveActionQueueItem`: completed 처리 + `resolved_by/resolved_at` 기록 + `admin_logs` 기록
  - `expireStaleItems`: 72시간 이상 미처리 항목을 expired로 전환하고 critical로 자동 승격(escalated_at 기록)
  - `createActionQueueItem`: D-016에 따라 항상 거부(관리자 수동 생성 금지)
- **거래 흐름 관제(최소 이상 감지)**
  - RFQ 24시간 무입찰(open + 24h 초과 & bids=0) → Action Queue(Today, trade)
  - 지급(outbound) due_date 30일 초과 미확정 → Action Queue(High, settlement)
  - 화면 진입 시 이상 감지 후 큐에 enqueue(best-effort)하고 목록에서 “처리”로 완료 전환
- **관리자 중앙 대시보드**
  - `/admin/dashboard` 신설: Critical/Today 큐 섹션 + 처리 버튼 + 관제 화면 연결
  - 사이드바에 대시보드(/admin/dashboard)·거래관제(/admin/trades) 메뉴 추가

## migration 여부

- 파일 추가(미적용) — `supabase/migrations/20260507240000_create_action_queue_admin_settings.sql`

## 테스트 결과

- `npx tsc --noEmit`: PASS

## 남은 위험

- PRODUCT §10-4의 나머지 단계(낙찰→주문확정, 납품→정산 등)는 현재 코드베이스에서 연결 키/테이블이 불명확하여 이번 회차는 “최소 이상 감지”만 구현했다.
- `action_queue` 중복 방지를 위한 DB 유니크 인덱스가 없어 enqueue는 best-effort로 중복을 줄이는 수준이다.

## 다음 권장 작업

- 거래 흐름 7단계 전 구간을 연결하기 위한 식별자(예: `rfq_id → order_id → payment_id`)를 DB/도메인 모델에 명시하고, 관제 규칙을 admin_settings 기반으로 정책화(하드코딩 제거).
- Action Queue에 “정책 콘솔 이동 → in_progress” 흐름(상태 전이)을 추가하고, 항목별 action_options에 라우트/실행 타입을 표준화.

