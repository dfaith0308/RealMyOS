| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-10 |

## 작업 목적

플랫폼 `product_categories`를 운영 자산으로 관리할 수 있는 관리자OS 화면을 추가한다. 최대 2-depth(대분류→소분류)만 허용하고, slug·정렬·활성 여부로 검색/노출 품질의 기반을 마련한다.

## 관련 `tasks.md` ID

- `COMMERCE-001` — `20260510130000_add_category_columns.sql`
- `COMMERCE-002` — 카테고리 관리 UI·서버 액션
- `COMMERCE-004` — 사이드바 카테고리 링크

## 수정 파일 목록

- `supabase/migrations/20260510130000_add_category_columns.sql`
- `src/actions/admin/commerce.ts`
- `src/app/(admin)/admin/commerce/categories/page.tsx`
- `src/components/commerce/CategoriesClient.tsx`
- `src/components/layout/AdminSidebar.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-10_feat_admin-commerce-categories.md`

## 변경 내용 요약

- DDL(미적용): `slug`, `sort_order`, `is_active` 추가.
- 서버: `getAdminCategories`, `createCategory`, `updateCategory`, `toggleCategoryActive`, `deleteCategory`; `getCategories`는 활성 대분류만·`sort_order` 정렬.
- UI: `/admin/commerce/categories`, 트리 카드·인라인 수정·토스트·`router.refresh()`.
- 사이드바: 카테고리 메뉴.

## migration 여부

파일 추가(미적용) — `20260510130000_add_category_columns.sql`

## 테스트 결과

- `npx tsc --noEmit` (realmyos): **pass**
- 브라우저 E2E: 미실행

## 남은 위험

- migration 미적용 환경에서는 `getCategories`의 `is_active`/`sort_order` 컬럼 조회가 실패할 수 있음.
- Listing의 `category_id`는 여전히 **대분류만** 허용(`createListing`); 소분류는 추후 연동 검토.

## 다음 권장 작업

- 운영 DB에 migration 적용 후 시드·관리 화면 smoke 테스트.
- 필요 시 Listing·식당OS 노출에 소분류 반영 설계.
