| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-10 |

## 작업 목적

관리자 상품 관리·등록 모달에서 `getProducts()`가 `products.selling_price`를 조회해 DB 오류가 났다. 실제 `products` 스키마에 해당 컬럼이 없으므로 제거하고, 이미 있는 플랫폼 Listing이면 `commerce_product_listings.commerce_price`로 참고가를 표시한다.

## 관련 `tasks.md` ID

`COMMERCE-002`

## 수정 파일 목록

- `src/actions/admin/commerce.ts`
- `src/components/commerce/ListingsClient.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-10_hotfix_admin-commerce-products-selling-price.md`

## 변경 내용 요약

- `ProductPickRow.selling_price` → `listing_commerce_price`(플랫폼 listing 조인 맵).
- `products` select에서 `selling_price` 제거.

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit`: pass

## 남은 위험

- 미등록 상품은 참고가 숫자가 없어 판매가 필드를 비운 채로 시작(의도된 동작).

## 다음 권장 작업

- `product.ts` 등 다른 모듈의 `products.selling_price` 조회가 운영 스키마와 불일치하면 별도 정리.
