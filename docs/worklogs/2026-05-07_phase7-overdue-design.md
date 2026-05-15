# Phase 7 연체 시스템 설계 문서

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`SUP-DANGER-003`(연체 시스템)과 `SUP-PARTIAL-005`(주문상태 이중 구조)를 함께 해결하기 위한 **Phase 7 설계 SSOT**를 문서로 확정한다. 구현 전에 `due_date`/유예기간/원장 상태 계산의 기준을 고정해, 대시보드·원장·수금 우선순위가 같은 정의를 공유하도록 한다.

## 관련 tasks.md ID

- `SUP-DANGER-003`
- `SUP-PARTIAL-005`

## 수정 파일 목록

- `docs/phase7-overdue-design.md`
- `docs/tasks.md`

## 변경 내용 요약

- `due_date` 기준의 연체 판정 + `grace_days(settings)` 유예기간을 포함한 정의를 확정했다.
- `orders`에 필요한 컬럼(`due_date`, `payment_terms_days`)과 `settings.default_payment_terms_days` 도입을 “필요 DB 변경(계획)”으로 정리했다.
- `RULE-02` 준수: 연체금/거래상태(trade_status)는 **DB 저장이 아니라 런타임 계산**으로 설계했다.
- `trade_status`는 `collection_allocations(status='active')` 기반 수금 배분 합계로 계산하도록 SSOT를 명시했다.
- `order_status(운영)`와 `trade_status(원장)`의 이중 구조를 분리해 상태 혼용을 방지하도록 정리했다.
- Phase 7 실행 순서(마이그레이션/액션/대시보드/수금 스코어 변경)를 단계로 제시했다.

## migration 여부

- 없음 (설계/문서만)

## 테스트 결과

- 미실행 — 문서 작업만 수행

## 남은 위험

- `promised_date`(약속일) 및 “재약정”의 우선순위( due_date vs promised_date ) 정책은 후속 합의가 필요하다.
- `today` 기준(UTC vs 로컬)과 `due_date` 타입(date) 조합 시 경계(자정) 처리 규칙을 구현 단계에서 명확히 해야 한다.
- `collection_allocations`가 없는 기존 데이터에 대해 연체/paid/partial 계산이 보수적으로(미수로) 나올 수 있다(“신규부터 정확” 원칙과 트레이드오프).

## 다음 권장 작업

- Phase 7 구현 착수 시, 가장 먼저 `orders.due_date`/`payment_terms_days` 추가 migration을 생성하고(승인→적용), 주문 생성/수정 시 due_date를 일관되게 채우는 경로를 확정한다.
- `getAccountsReceivable` 및 대시보드 KPI가 동일한 런타임 계산 함수(SSOT)를 호출하도록 통합한다.

