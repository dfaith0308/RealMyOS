# 2026-05-07 — SUP-PARTIAL-006-A 자동화영업 실행센터 (/sales/exec)

## 목적

- PRODUCT §6-13 “실행센터(매출 직결 핵심)” 정의대로 **지금 당장 해야 할 영업을 즉시 실행**하는 허브 화면을 추가한다.
- **자동 발송 금지(D-013)** 원칙을 지키며, 모든 실행은 **사람이 버튼 클릭 후** 이루어진다.
- 점수/추천은 **실시간 계산(저장 금지)** 으로 유지한다.

## 관련 tasks.md ID

- `SUP-PARTIAL-006-A`

## 구현 요약

- **새 화면**: `/sales/exec`
  - “지금 연락해야 할 고객 TOP 3” 리스트
  - 컬럼: 거래처명 / 점수 / 추천 행동 / 마지막 연락일
  - 액션: `[전화] [문자] [주문작성]`
  - 데이터 없을 때: “아직 연락이 필요한 거래처가 없어요” + `/orders` 유도

- **TOP3 점수 산정**
  - 기존 `src/actions/sales.ts`의 점수 계산 로직(`calculateScore`)을 기반으로 **실시간 계산 결과 상위 3개**를 사용
  - 추천 행동은 간단 규칙으로 도출(연체 우선 → 전화, 장기 미연락 → 문자, 그 외 → 방문)

- **실행 흐름(수동)**
  - 실행 버튼 클릭 → 스크립트 선택 모달(`sales_scripts`) → 실행
  - 실행 시 `contact_logs` 기록 생성(tenant_id 필수)
  - 해당 고객의 **오늘 pending 스케줄이 있으면** `sales_schedules`를 `done`으로 완료 처리
  - 문자 실행은 `executeMessage(channel='clipboard')`로 **클립보드 실행(자동 발송 없음)** + 로그 기록

- **연결**
  - 사이드바: 자동화영업 하위 메뉴에 “실행센터” 추가
  - 대시보드: Quick Actions에 “지금 영업하기 →” 버튼 추가(`/sales/exec`)

## 변경 파일

- `src/actions/sales.ts`
- `src/app/(app)/sales/exec/page.tsx`
- `src/app/(app)/sales/exec/SalesExecClient.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/app/(app)/dashboard/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-partial-006a_exec-center.md`

## Migration

- 없음 (UI/액션만)

## 테스트

- `npx tsc --noEmit` ✅

## 리스크 / 남은 일

- 추천 행동 로직은 현재 단순 규칙 기반이므로, PRODUCT에서 기대하는 세부 가중치/추천 근거(설정화 포함)는 후속 정밀화 대상.
- “주문작성”은 링크 기반 진입이며, 주문 폼에서 `customer_id` 파라미터를 사용하는 UX는 추가 개선 여지.

