## SUP-MISSING-011 바코드 스캔 + Vision 자동 등록

### PRODUCT 정합
- **§6-6** 상품등록: 바코드 입력·검색
- **§4999~** 식자재 입력: 수기 + 사진 인식 MVP (제품명/용량/가격)

### realmyos
- `src/lib/barcode-lookup.ts`: 식품안전나라 `C005` → `I2570` → 영양 DB `getFoodNtrCpntDbInq02` 체인
- `src/actions/barcode.ts`: `lookupBarcode`, `recognizeProductFromImage` (서버에서 외부 API 호출)
  - 키: `settings.key = foodsafety_api_key` → `FOOD_SAFETY_API_KEY` / 영양은 `FOOD_NTR_API_KEY` 우선
- `src/components/product/BarcodeScanner.tsx`: `@ericblade/quagga2`
- `src/components/product/BarcodeLookupSection.tsx`: 카메라·수동 조회·사진 인식
- `src/components/product/ProductCreateForm.tsx`: 상단 연동
- `package.json`: `@ericblade/quagga2` 의존성
- migration: `supabase/migrations/20260508150000_add_products_barcode_if_missing.sql` (**승인 후 DB 실행**)

### resturant_os
- 동일 조회 로직 `src/lib/barcode-lookup.ts`, `src/actions/barcode.ts` (테넌트 `settings` 없음 → `FOOD_SAFETY_API_KEY`)
- `src/components/product/BarcodeScanner.tsx`, `IngredientBarcodeSection.tsx`
- `src/components/settings/IngredientsClient.tsx`, `src/actions/ingredients.ts` (`barcode` 저장)
- migration: `supabase/migrations/20260508150000_add_ingredients_barcode_if_missing.sql` (**승인 후 DB 실행**)

### 운영 설정
- 공급자: Supabase `settings` 행 `foodsafety_api_key` 또는 `FOOD_SAFETY_API_KEY`
- 식당: `FOOD_SAFETY_API_KEY`
- 영양 DB 별도 키: `FOOD_NTR_API_KEY` (미설정 시 식품안전나라 키와 동일 값 사용)
- Vision: `ANTHROPIC_API_KEY`, 선택 `ANTHROPIC_VISION_MODEL` (기본 `claude-3-5-sonnet-20241022`)

### 검증
- `npx tsc --noEmit` (realmyos, resturant_os)
