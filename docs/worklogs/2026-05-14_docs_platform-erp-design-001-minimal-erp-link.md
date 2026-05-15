| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

`PLATFORM-ERP-DESIGN-001`: `commerce_orders`를 기존 `payments`·정산·원장 구조에 **최소 위험**으로 붙이기 위한 **설계 문서**만 확정한다. 구현·migration·DB 변경 없음.

## 2. 관련 `tasks.md` ID

- **`[PLATFORM-ERP-001]`**
- 선행: **`docs/PLATFORM-ERP-ARCH-001.md`**, **`docs/PAYMENT-FORENSIC-001.md`**

## 3. 수정 파일 목록

- `docs/PLATFORM-ERP-DESIGN-001.md` (신규)
- `docs/tasks.md` (문서 사용법 17번·OPS·`[PLATFORM-ERP-001]`·COMMERCE SSOT)
- `docs/worklogs/2026-05-14_docs_platform-erp-design-001-minimal-erp-link.md` (본 파일)

## 4. 변경 내용 요약

- **Q1**: 옵션 A(단일 `payments`) 권장 — `payment_allocations`·정산 UI가 `payments` 전제; 옵션 B는 이중화.
- **Q2**: receivable owner = **platform (디닷페이스)** — 현행 `getCustomerLedger`는 `commerce_orders` 미포함 사실 명시.
- **Q3**: storefront 고객 = **플랫폼 관점**; `customers`와는 **`customer_id` 없어 직접 FK 없음**.
- **Q4**: `payments` 생성 시점 = **`paid` 확정 시** 권장; 생성 주체 = **Server Action 또는 기존 RPC 패턴**; enum은 **서로 다른 CHECK**로 매핑 필요.
- **SECTION 7**: migration **목록만**(실행 없음). **SECTION 8**: `order_id`에 `commerce_orders.id` 금지, `commerce_order_id` XOR 방어.

## 5. migration 여부

없음(설계 문서에 **필요 목록**만 기술).

## 6. 테스트 결과

해당 없음.

## 7. 남은 위험

- `payments.type` 컬럼 DDL이 증분에 없고 **코드가 의존** — 실제 baseline 스키마 검증은 운영 절차에 따름.

## 8. 다음 권장 작업

- `[PLATFORM-ERP-001]` 하위에 **SECTION 7 migration 초안** 리뷰 태스크 분리 후 구현 착수 승인.
