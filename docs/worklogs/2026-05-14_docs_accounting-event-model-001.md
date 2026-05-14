| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

회계 이벤트 taxonomy(`cancelled`·`void`·`reversal`·`refund`·`adjustment`), `payments` SSOT 역할(옵션 A/B/C), immutable ledger 원칙, reversal lifecycle, KPI·forensic 기준을 **코드·migration 사실** 위에 문서로 확정하여 이후 역환불·정산·`[PLATFORM-ERP-001]` 구현의 상위 원칙으로 둔다.

## 관련 `tasks.md` ID

- **[ACCOUNTING-EVENT-MODEL-001]** (신규)
- 연계: **[ACCOUNTING-REVERSAL-DESIGN-001]**, **`[PLATFORM-ERP-001]`**

## 수정 파일 목록

- `docs/ACCOUNTING-EVENT-MODEL-001.md` (신규)
- `docs/tasks.md` (문서 목록·감사 ID 블록·OPS·`[PLATFORM-ERP-001]` 작업 이력)
- `docs/worklogs/2026-05-14_docs_accounting-event-model-001.md` (본 파일)

## 변경 내용 요약

- SECTION 1~13 및 **사람이 결정해야 하는 정책 목록** 포함.
- `payments`가 storefront·RFQ·정산(`settlement-control`·`type: 'settlement'`)에 쓰이는 사실, `commerce_order_allocations`의 INSERT 실패 시 DELETE 롤백 사실 등을 포렌식으로 명시.
- **권장**: `payments` SSOT **옵션 C(하이브리드)** , 최종 ledger 목표 **전략 B**, **refund ≠ reversal** 구분 확정.

## migration 여부

- 없음 (문서 SECTION 10은 검토 목록만.)

## 테스트 결과

- 해당 없음 (문서만.)

## 남은 위험

- 저장소 증분 migration에 `payments` 전체 DDL·`type` 컬럼 추가 파일이 없어, 운영 스키마는 baseline과의 **동기화 검증**이 필요함(문서 SECTION 13·SECTION 1 반영).

## 다음 권장 작업

- SECTION 13 정책을 `DECISIONS.md` 등에 반영한 뒤, P0(`admin_logs` 공백·주문-`payments` 정합) 구현 티켓 분리.
