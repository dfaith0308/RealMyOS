| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

주문 취소·환불·rollback 시 `payments`, `commerce_order_allocations`, `supplier_payables`, 가격 스냅샷을 **코드·migration 사실**에 기반해 포렌식하고, **immutable ledger** 원칙을 해치지 않는 역흐름 설계 방향을 문서화한다. (구현·migration 실행·DB 변경 없음.)

## 관련 `tasks.md` ID

- **[ACCOUNTING-REVERSAL-DESIGN-001]** (신규 블록)
- 연계: **[PLATFORM-ERP-001]**, `PLATFORM-ERP-P0-001`, `PLATFORM-ERP-P2-003`, `TEST-RUN-ERP-001`

## 수정 파일 목록

- `docs/ACCOUNTING-REVERSAL-DESIGN-001.md` (신규)
- `docs/tasks.md` (문서 사용법 항목·감사 ID 블록·작업 이력)
- `docs/worklogs/2026-05-14_docs_accounting-reversal-design-001.md` (본 파일)

## 변경 내용 요약

- SECTION 1~13 및 **사람이 결정해야 하는 정책 목록**을 포함한 설계·포렌식 문서 작성.
- `tasks.md`에 문서 인덱스(항목 25)·`[ACCOUNTING-REVERSAL-DESIGN-001]` 블록·OPS·`[PLATFORM-ERP-001]` 작업 이력 반영.

## migration 여부

- 없음 (설계 문서 SECTION 10은 **검토 목록만**, 실행 없음.)

## 테스트 결과

- 해당 없음 (문서만; `tsc`/`npm test` 미실행.)

## 남은 위험

- 운영 DB에 `resturant_os` `payments.status='cancelled'` 경로가 남아 있으면 realmyos CHECK 제약과 충돌할 수 있음 — 본 설계 문서 SECTION 1.7에 기재.

## 다음 권장 작업

- SECTION 13·정책 목록을 `DECISIONS.md` 또는 운영 결정록에 투영한 뒤, P0 범위(`payments`·`admin_logs` 정합) 구현 티켓 분리.
