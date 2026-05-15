| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

`PLATFORM-ERP-ARCH-001`: 관리자OS가 문서상「디닷페이스 ERP」역할을 **코드·migration·기존 포렌식 문서**만으로 어디까지 가능한지, storefront(`commerce_orders`)가 **ERP·`payments`·정산**에 자동 연결되는지 **추정 없이** 정리한다.

## 2. 관련 `tasks.md` ID

- **`[PLATFORM-ERP-001]`**
- 연계 문서: `docs/PAYMENT-FORENSIC-001.md`, `docs/ORDER-FORENSIC-001.md`

## 3. 수정 파일 목록

- `docs/PLATFORM-ERP-ARCH-001.md` (신규)
- `docs/tasks.md` (문서 사용법·OPS·`[PLATFORM-ERP-001]`·COMMERCE SSOT 한 줄)
- `docs/worklogs/2026-05-14_docs_platform-erp-arch-001-forensic.md` (본 파일)

## 4. 변경 내용 요약

- 관리자 정산·GMV·통합 뷰는 **`orders` + `payments`** 만 사용; **`commerce_orders` 미참조** (`settlement-control.ts`).
- storefront 주문 생성은 **`resturant_os` `createCommerceOrder`** 가 `commerce_orders`/`commerce_order_items`만 기록; **`payments`/원장 자동 반영 없음**.
- 원장 `getCustomerLedger`는 **`orders`/`payments`** 만 — **`commerce_orders` 분리**.
- Toss PG: 양 repo `package.json`에 `@tosspayments/*` 없음; `PAYMENT-FORENSIC-001`과 정합.
- 난이도 **HIGH**, 충돌 위험 TOP 5·즉시 활용 가능 항목·갭(P0–P2) 표로 정리.

## 5. migration 여부

없음 (문서·분석만).

## 6. 테스트 결과

해당 없음(코드 변경·실행 테스트 없음).

## 7. 남은 위험

- 본 포렌식은 **저장소 스냅샷** 기준이며, 운영 DB에만 있는 객체는 **미포함**될 수 있음.

## 8. 다음 권장 작업

- `[PLATFORM-ERP-001]` 하위에 **데이터 소스 단일화**(플랫폼 주문 vs RFQ `orders`) 설계 과제를 분해해 등록.
