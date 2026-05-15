# SUP-PARTIAL-005 Phase 7로 분리 (주문상태 이중 구조)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

주문 상태를 PRODUCT 6-4의 “이중 구조(주문상태/거래상태)”로 확장하는 작업은 `due_date`·연체 시스템 설계와 결합되는 변경 범위가 커서, Phase 4~5 이후 **Phase 7에서 연체 시스템(SUP-DANGER-003)과 함께 설계**하도록 분리하고 임의 착수를 방지한다.

## 관련 tasks.md ID

- SUP-PARTIAL-005
- SUP-DANGER-003

## 수정 파일 목록

- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-06_sup-partial-005_deferred-to-phase7.md`

## 변경 내용 요약

- `SUP-PARTIAL-005`에 Phase 7 이관 메모를 추가했다.
- 실행 로드맵 Phase 7 블록에 `SUP-PARTIAL-005`를 `SUP-DANGER-003`와 함께 설계 대상으로 명시했다.

## DB/코드 일치 확인 결과 (거래상태)

- 운영 DB `orders.status` CHECK: `draft` / `confirmed` / `cancelled`
- 운영 DB 데이터 분포: `confirmed` 97건, `cancelled` 4건
- 코드도 `draft/confirmed/cancelled` 기반으로 동작함을 확인했다.

## migration 여부

- 없음 (문서 업데이트만)

## 테스트 결과

- 미실행 — 문서 변경만 수행

## 남은 위험

- 주문상태(운영 흐름: 접수/확인/출고/납품 등) 컬럼/모델이 없어, 운영 진행 상태를 표현/필터링/전이하는 기능은 아직 구현되지 않았다.

## 다음 권장 작업

- Phase 7에서 `SUP-DANGER-003`(연체)와 함께:
  - `order_status`(운영) vs `trade_status`(원장) 컬럼/전이/권한 규칙
  - `due_date` 생성 규칙 및 약정일/유예기간/연체 전이
  - 알림/위험도/수금 스코어링 정의
  를 단일 설계 문서로 먼저 확정한다.

