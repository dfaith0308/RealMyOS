# RES-TODO-001 식당OS 알림/입찰결과 라우트 공백 구현

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

식당OS(`resturant_os`)에서 PRODUCT §8-2/§8-7 기준으로 비어 있던 라우트 `/notifications`(알림 목록)과 `/orders/results`(입찰 결과)를 구현해, 알림 확인·낙찰 결과 확인의 IA 공백을 제거한다.

## 관련 tasks.md ID

- `RES-TODO-001`

## 수정 파일 목록

- `resturant_os/src/actions/notifications.ts`
- `resturant_os/src/app/(app)/notifications/page.tsx`
- `resturant_os/src/components/notifications/NotificationsClient.tsx`
- `resturant_os/src/app/(app)/orders/results/page.tsx`
- `resturant_os/src/components/today/TodayNotifications.tsx`
- `docs/tasks.md`

## 변경 내용 요약

- `/notifications`
  - `notifications` 테이블을 `tenant_id`로 스코프해 최근 20건을 최신순으로 조회.
  - 알림 목록에서 읽음/미읽음 구분 및 개별 “읽음 처리” 지원(tenant 검증 포함).
  - today 알림 카드에 “전체보기 →” 링크 추가.
- `/orders/results`
  - `rfq_requests`에서 `status IN ('ordered','closed') AND tenant_id=...`를 기준으로 최근 30건 조회.
  - 관련 `rfq_bids`를 1회 조회(in절)해 RFQ별로 매핑 후, 낙찰(accepted) 우선/없으면 최저가 기준으로 결과 표시.
  - `current_price`가 있으면 기준 단가 대비 예상 절약액을 함께 표시.

## migration 여부

- 없음

## 테스트 결과

- `resturant_os`: `npx tsc --noEmit` (pass)

## 남은 위험

- `rfq_bids.status='accepted'`가 항상 존재한다는 보장은 없어, accepted가 없을 때는 “최저가”로 대체 표기한다(정책/상태머신 정합은 별도 과제).
- 알림 “읽음 처리”는 서버 revalidate를 수행하지만, 클라이언트에서도 즉시 상태 반영을 위해 로컬 상태 업데이트를 사용한다(동시성 상황에서 최신성은 서버 재조회가 SSOT).

## 다음 권장 작업

- PRODUCT §8-7의 “중요 알림” 라우트(`/notifications/important`)가 필요하면 priority 기반 필터 UI/라우트를 추가한다.
- `/orders/results`의 “낙찰” 정의(accepted 강제 여부, closed 상태에서의 결과 표기)를 PRODUCT/CONTEXT 상태 정의와 1회 정렬한다.

