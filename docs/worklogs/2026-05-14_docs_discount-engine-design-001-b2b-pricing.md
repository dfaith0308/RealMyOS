| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

B2B 가격정책·할인 엔진을 도입할 때 ERP(`payments`·allocation·`supplier_payables`)와 **충돌하지 않도록** 금액 축을 분리한 **설계 문서**만 작성한다. 구현·migration·DB 변경 없음.

## 관련 `tasks.md` ID

- **`[DISCOUNT-ENGINE-DESIGN-001]`** (신규 블록) · 연계 `DISCOUNT-FORENSIC-001`, `PLATFORM-ERP-*`

## 수정 파일 목록

- `docs/DISCOUNT-ENGINE-DESIGN-001.md` — 신규
- `docs/tasks.md` — 문서 사용법 인벤토리·OPS·DISCOUNT 블록·`[DISCOUNT-ENGINE-DESIGN-001]` 항목

## 변경 내용 요약

- `createCommerceOrder`·`createCommerceOrderAllocations`·`customer_product_prices`·공급자 `orders` 할인의 **현행 코드 기준** 요약.
- `customer_charge` / `supplier_basis` / 부담 주체별 할인 / `platform_fee` / `supplier_payable` 불변식·우선순위·스냅샷 시점·migration 후보·구현 순위·정책 결정 목록.

## migration 여부

없음 (문서만; SECTION 10은 **향후 후보 목록**).

## 테스트 결과

해당 없음.

## 남은 위험

- 정책 미확정 시 스키마만 먼저 가면 불변식 깨짐 — SECTION 12·13 승인 선행 필요.

## 다음 권장 작업

- SECTION 12 항목 승인 후 P0 스키마 초안·`TEST-RUN-ERP-001` 보강을 별 과제로 분리.
