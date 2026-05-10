# 묶음배송 그룹 + 상품 등록 스튜디오 미리보기 정리

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-10 |

## 작업 목적

썸네일 미리보기에는 운영자가 선택한 `badge_labels`만 노출하고, 배송 유형·배송비 안내 뱃지는 제거한다. 묶음배송 그룹은 `shipping_groups` 테이블과 `shipping_group_id`로 관리하고, 등록 페이지에서 선택·추가·관리할 수 있게 한다.

## 관련 `tasks.md` ID

- `COMMERCE-001`
- `COMMERCE-002`

## 수정 파일 목록

- `supabase/migrations/20260510170000_create_shipping_groups.sql`
- `src/actions/admin/commerce.ts`
- `src/components/commerce/ListingNewClient.tsx`
- `src/components/commerce/listing-new-client.module.css`
- `docs/tasks.md`
- `docs/worklogs/2026-05-10_feat_commerce-shipping-groups-listing-studio.md`

## 변경 내용 요약

- migration: `shipping_groups` + RLS + `commerce_product_listings.shipping_group_id` FK.
- 서버: `getShippingGroups`, `createShippingGroup`, `updateShippingGroup`, `deleteShippingGroup`(사용 중 listing 있으면 거부·그 외 `is_active` false), `createListingFull`에 `shipping_group_id` 검증·저장, `admin_logs`.
- 클라이언트: 미리보기 오버레이에서 배송 정책 뱃지 제거; 묶음배송 select·인라인 추가·관리 모달.

## migration 여부

- **파일 추가** — `20260510170000_create_shipping_groups.sql` (저장소 소급; 운영 적용 여부는 배포 시 확인)

## 테스트 결과

- `npx tsc --noEmit` (realmyos) — **pass**

## 남은 위험

- DB에 `shipping_groups` / `shipping_group_id`가 아직 없으면 런타임 쿼리 실패 가능.
- 그룹 삭제는 soft delete(`is_active=false`); 과거 listing FK는 그대로 유지될 수 있음(의도에 따라 후속 정리).

## 다음 권장 작업

- Listing 수정 화면·식당OS 카드에 `shipping_group_id` 표시 필요 시 필드 노출 설계.
