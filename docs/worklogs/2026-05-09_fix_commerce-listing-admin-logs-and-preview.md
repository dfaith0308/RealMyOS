| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

`createListingFull`에서 `products`·`commerce_product_listings` INSERT는 성공했으나 `admin_logs` INSERT가 `admin_tenant_id` NOT NULL 위반으로 실패할 때 전체를 `success: false`로 돌려 운영자가 재시도·중복 상품을 만드는 문제를 끊는다. 감사 로그 INSERT에 `admin_tenant_id`를 채워 실패 가능성을 낮추고, 상품 저장 성공 UX(토스트·색상)와 상품 관리 목록의 `/buy`형 카드 미리보기를 보강한다.

## 관련 `tasks.md` ID

`COMMERCE-002`

## 수정 파일 목록

- `src/actions/admin/commerce.ts`
- `src/components/commerce/ListingNewClient.tsx`
- `src/components/commerce/ListingsClient.tsx`

## 변경 내용 요약

- `insertAdminLog`: INSERT에 `admin_tenant_id` 포함(기본 `PLATFORM_OWNER_TENANT`). `createListingFull`에서는 `auth.ctx.tenant_id` 전달.
- `createListingFull`: `admin_logs` 실패 시 `console.error`만 하고 상품·리스팅 커밋 후에는 `success: true` 유지.
- `ListingNewClient`: 저장 성공 토스트 문구를 초안/공개 구분, 성공 녹색·실패 적색 토스트, 성공 시 `showToast` 후 `applyResetForm`.
- `ListingsClient`: 행별「미리보기」버튼·모달로 썸네일·뱃지·브랜드·명·가격·절감·배송·상태 표시.

## migration 여부

없음 (스키마 변경 없음)

## 테스트 결과

- `npx tsc --noEmit`: PASS
- 브라우저·운영 DB 스모크: 미실행 (에이전트 환경)

## 남은 위험

- 다른 커머스 액션은 여전히 `admin_logs` 실패 시 `success: false`일 수 있음(이번 범위는 `createListingFull` 중심).
- 미리보기는 실제 `resturant_os` /buy와 픽셀 단위 동일하지 않을 수 있으나 정보 계열은 맞춤.

## 다음 권장 작업

- 운영에서 상품 등록 1회로 성공 토스트·목록 반영·`admin_logs` 행 적재 여부 확인.
- 필요 시 다른 `commerce.ts` 액션도 감사 로그 실패를 비치명으로 통일할지 정책 결정.
