# 2026-05-07 — SUP-MISSING-004 자동화영업(분류 기반) 트리거 구현

## 작업 목적

- PRODUCT §6-13 자동화영업의 “스케줄 기반 실행”을 MVP로 구현한다.
- **자동 발송은 절대 금지**하고(추천/스케줄 생성까지만), 사용자가 스케줄을 보고 **수동 실행**하도록 한다.

## 관련 작업 ID

- `SUP-MISSING-004`

## 변경 파일

- `src/actions/sales-trigger.ts`
- `src/app/(app)/sales/schedule/SalesScheduleClient.tsx`
- `docs/tasks.md`
- `docs/DECISIONS.md`

## 구현 내용 요약

### 1) 분류 기반 트리거 체크 + 스케줄 생성

- `checkAndCreateSalesTriggers(tenant_id?)`
  - `customer_tags`에서 분류(관리등급/유입경로/연락상태)를 읽고 조건을 평가
  - 조건 매칭 시 `sales_schedules`에 **오늘 날짜 스케줄**을 생성
  - 중복 방지: 동일 customer_id + scheduled_date(오늘) 중복 생성 금지

### 2) MVP 트리거 조건(요구사항 확정)

- 관리등급=정기관리 → 마지막 연락일 + 7일 초과 시 생성
- 관리등급=방치 → 마지막 연락일 + 30일 초과 시 생성
- 유입경로=쿠팡 + 연락상태=안심번호 → 즉시 생성(24시간 내 응답 유도 목적)

### 3) /sales 화면 연동

- `/sales/schedule` 상단에 **[분류 트리거 체크]** 버튼 추가
  - 클릭 시 트리거 체크 후 스케줄 생성
  - 생성된 스케줄은 기존 UI 흐름(🎯 영업 실행)으로 사람이 수동 실행
- 스케줄 카드에 트리거 사유(`memo`)를 노출

## migration 여부

- 없음 (기존 `sales_schedules`, `contact_logs`, `customer_tags` 사용)

## 테스트

- `npx tsc --noEmit` 통과

## 남은 위험 / TODO

- “24시간 내 응답 유도”의 기준 이벤트(예: 태그 부여 시점/거래처 생성 시점/마지막 연락 시점)가 명시되지 않아, MVP에서는 “조건 만족 시 오늘 스케줄이 없으면 즉시 생성”으로 단순화했다.
- 추후 트리거 생성 이력을 별도 테이블로 분리(감사/분석)할지 검토 필요.

## 다음 권장 작업

- 트리거 로그(생성/스킵/사유) 테이블 도입 여부 결정
- “실행센터”에서 스케줄/추천을 더 빠르게 처리하는 UX 확장

