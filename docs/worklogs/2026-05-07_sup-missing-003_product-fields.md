# 2026-05-07 — SUP-MISSING-003 상품 인텔리전스 필드 추가

## 목표

- PRODUCT §6-6 “상품등록 확정 필드” 누락분 반영
  - `ingredients` (원재료명 및 함량, 선택)
  - `item_report_number` (품목보고번호, 선택)

## 범위 / 원칙

- DB 적용은 이미 완료된 상태(본 worklog는 **코드 연결** 기록)
- UI는 기존 상품 등록 흐름을 유지하면서 “선택 입력 섹션”으로 추가

## 변경 내용

- `createProduct`에 `ingredients`, `item_report_number` 필드 전달 및 `products` insert payload 반영
- `ProductCreateForm`에 “선택 입력” 섹션 추가
  - textarea: “원재료명 및 함량 (선택)” + 안내 문구 “입력 시 상품 인텔리전스 기능 활성화”
  - text input: “품목보고번호 (선택)” + 안내 문구 “상품 식별용 고유 값”

## 변경 파일

- `src/actions/product.ts`
- `src/components/product/ProductCreateForm.tsx`
- `docs/tasks.md`

## 테스트

- `npx tsc --noEmit`

## 후속

- 상품 수정 화면(`ProductEditForm`)에도 동일 필드 노출/수정 지원(필요 시)

