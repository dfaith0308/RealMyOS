# 상품 등록 스튜디오 UX·구조 개선

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

운영자가 “쇼핑몰에 상품을 올리는” 흐름에 맞게 관리자OS 상품 등록 스튜디오의 구조를 정리한다. 필드 남발이 아니라 카테고리·가격 입력·배송 정책·썸네일 뱃지·공개 설정을 분리·단순화하고, DB에 맞는 항목만 저장한다.

## 관련 `tasks.md` ID

- `COMMERCE-001` (migration: `icon_url`, `badge_labels`, `shipping_type` CHECK)
- `COMMERCE-002` (Listing 등록 UI·`createListingFull`·목록 배지)

## 수정 파일 목록

- `supabase/migrations/20260510150000_add_category_icon.sql`
- `supabase/migrations/20260510160000_listing_badge_labels_shipping_types.sql`
- `src/lib/calc.ts`
- `src/lib/commerce-constants.ts`
- `src/actions/admin/commerce.ts`
- `src/components/commerce/ListingNewClient.tsx`
- `src/components/commerce/listing-new-client.module.css`
- `src/components/commerce/ListingsClient.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-09_feat_commerce-listing-studio-ux-restructure.md`

## 변경 내용 요약

- `product_categories.icon_url` 마이그레이션 추가; 카테고리 조회에 컬럼 선택(없으면 null).
- 상품 등록 화면: 대분류 옆 아이콘 표시(네이티브 select 제약 고려), [카테고리 관리] 링크.
- 가격·배송비·조건부 기준 금액: 숫자만 상태, 표시는 쉼표 포맷(`formatDigitsForInput` 등).
- 배송 유형: `free` / `paid` / `conditional_free`만; 유료 시 박스 단위 안내·클라이언트 티어 문자열; 묶음배송 그룹은 UI만(TODO).
- 썸네일 뱃지: 고정 목록·최대 2개; 미리보기 반영; `badge_labels text[]` 저장.
- 공개 설정: UI 문구만 “비공개(draft)” / “공개(visible)”.
- 목록 화면: `conditional_free` 배지 스타일; 레거시 `cold`/`same_day` 라벨 유지.

## migration 여부

- **파일 추가(미적용)** — `20260510150000_add_category_icon.sql`, `20260510160000_listing_badge_labels_shipping_types.sql` (저장소 반영만; 운영 DB 적용은 배포 절차).

## 테스트 결과

- `npx tsc --noEmit` (realmyos) — **pass**

## 남은 위험

- 마이그레이션 미적용 환경에서는 `icon_url`/`badge_labels` SELECT·INSERT 또는 `shipping_type` CHECK와 불일치로 런타임 오류 가능.
- 박스 단위 배송비·묶음 그룹·조건부 기준 금액 중 일부는 아직 DB 미연동(TODO 주석).

## 다음 권장 작업

- 운영/스테이징에 두 migration 순서 적용 후 smoke: Listing 생성·목록·카테고리 CRUD.
- `shipping_fee` / `shipping_box_qty` / `free_shipping_threshold` / `shipping_group` 컬럼 설계 시 UI TODO 제거.
