# DISCOUNT-FORENSIC-001 — 기간할인·프로모션 가격 포렌식

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

기간할인·프로모션이 **코드·스키마상 실제로 어떻게 구현되는지** 확인한다. `DISCOUNT-FIX-001` 전제 조사로 **문서만** 남긴다.

## 2. 관련 `tasks.md` ID

- `DISCOUNT-FORENSIC-001` (신규)
- 참고: `POINT-FORENSIC-001`, `COMMERCE-*`, `PAYMENT-FORENSIC-001`

## 3. 수정 파일 목록

- `docs/DISCOUNT-FORENSIC-001.md` (신규)
- `docs/tasks.md`
- `docs/worklogs/2026-05-14_docs_discount-forensic-001-pricing.md` (본 파일)

## 4. 변경 내용 요약

- listing에 **프로모션 기간 컬럼 없음**; 가격은 `commerce_price` + 선택 `original_price`(표시).
- storefront 주문은 `createCommerceOrder`에서 **DB 현재가**로 스냅샷.
- 공급자 `orders.discount_amount`는 **수동 헤더**; export CSV는 **단가·합계 미포함**.

## 5. migration 여부

없음.

## 6. 테스트 결과

- grep·파일 열람·CONTEXT 인용만. DB 미조회.

## 7. 남은 위험

- 정무님 정책(식당별·기간별)과 구조 갭 — 본 문서 §6.

## 8. 다음 권장 작업

- 후속 `DISCOUNT-FIX-001`에서 요구사항·스키마 설계 분기.
