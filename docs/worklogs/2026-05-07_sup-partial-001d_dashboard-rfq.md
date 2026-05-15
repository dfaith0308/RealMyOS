# SUP-PARTIAL-001-D — 대시보드 “RFQ 미응답(24h 초과)” 추가

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

대시보드 “오늘 할 일” 블록에서 RFQ 미응답(24h 초과) 항목을 노출해, 장시간 방치된 발주요청을 빠르게 확인·추적할 수 있도록 한다.

## 관련 tasks.md ID

- SUP-PARTIAL-001-D

## 수정 파일 목록

- `src/actions/dashboard.ts`
- `src/app/(app)/dashboard/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-partial-001d_dashboard-rfq.md`

## 변경 내용 요약

- `getDashboardData()`에 `rfq_unanswered_count`를 추가했다.
  - 기준: `tenant_id = ctx.tenant_id` AND `status = 'open'` AND `created_at < now() - 24h`
- 대시보드 “오늘 할 일” 섹션에 `RFQ 미응답(24h 초과)` 행을 추가했다.
  - `rfq_unanswered_count > 0`일 때만 표시
  - 이동: `/rfq`

## migration 여부

- 없음

## 테스트 결과

- `npx tsc --noEmit` (pass)

## 남은 위험

- `created_at`은 DB 타임존/서버 시각에 의존한다. 현재는 “24시간 초과”를 서버 런타임에서 ISO timestamp로 계산해 비교한다.
- `rfq_requests.status`가 enum이므로, 운영 DB의 실제 값이 `open`과 다르면 카운트가 0이 될 수 있다(이번 작업은 제공된 enum 정의를 전제로 함).

## 다음 권장 작업

- RFQ 관련 “미응답” 기준을 정책화(예: 12h/24h/48h, 알림/배지)하고, PRODUCT의 “오늘 할 일 상세” 항목들과 함께 우선순위/색상 톤을 정합한다.

