# worklog — PAYMENTS-TAXONOMY-DESIGN-001 payments taxonomy 설계 문서

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

`payments`에 혼재한 **storefront·RFQ·정산·지급·reversal** 등 이벤트를 **`type` taxonomy**와 **type/status 역할**로 정렬할 수 있는지, append-only·KPI·settlement와의 관계를 **코드·migration 사실**에 기반해 설계 문서로 고정한다. **구현·DB 변경 없음.**

## 관련 `tasks.md` ID

- **[PAYMENTS-TAXONOMY-DESIGN-001]** (신규)
- **[ACCOUNTING-EVENT-MODEL-001]**, **[ACCOUNTING-REVERSAL-DESIGN-001]**, **[KPI-REVERSAL-P0-001]**, **`[PLATFORM-ERP-001]`**, **[D-021]**

## 수정 파일 목록

| 경로 | 역할 |
|------|------|
| `docs/PAYMENTS-TAXONOMY-DESIGN-001.md` | SECTION 1~13 + 부록(포렌식·KPI 표) |
| `docs/tasks.md` | 문서 사용법 30번·Epic 블록·OPS 작업 이력 |
| `docs/worklogs/2026-05-14_docs_payments-taxonomy-design-001.md` | 본 로그 |

## 변경 내용 요약

- 저장소 기준: `payments` **CREATE TABLE DDL 없음**; `type`은 **`settlement-control.ts`** 에서 `settlement`로 명시, storefront·RPC 다수 INSERT는 **`type` 미설정**; `payments_status_check`는 `pending|confirmed|reversed`인데 **`accept_bid_atomic`은 `planned`** 기입 등 **정합 리스크** 명시.
- 제안 taxonomy·lifecycle·KPI 표·`ledger_entries` 시점·정책 결정 10항 게이트 정리.

## migration 여부

없음 (문서만).

## 테스트 결과

해당 없음 (문서).

## 남은 위험

운영 DB의 `payments.status`·`type` 실분포·RPC `create_payment_atomic` 본문은 저장소 밖 — 문서에 **대조 필요**로 명시.

## 다음 권장 작업

SECTION 13 정책 확정 후 P1: `type` CHECK·백필·INSERT 경로 강제.
