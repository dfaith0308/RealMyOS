# worklog: 커머스 플랫폼 카테고리 seed SQL

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

공급자 테넌트 소유 `product_categories`만으로는 플랫폼 커머스(`/buy`) 필터용 공통 카테고리 트리가 없어, 플랫폼 테넌트 ID로 대·소분류를 시드할 수 있는 SQL을 저장소에 두기 위함.

## 관련 `tasks.md` ID

`COMMERCE-001` (커머스 DB·데이터 정합 맥락) — 별도 감사 ID 없이 COMMERCE 블록 작업 이력에 기록.

## 수정 파일 목록

- `supabase/seeds/commerce_categories.sql` (신규)

## 변경 내용 요약

- `tenant_id = '00000000-0000-0000-0000-000000000000'` 기준 대분류 8개(`parent_id` NULL).
- 소분류: `장류` 하위 5개, `소스·양념` 하위 5개 — 부모는 이름·테넌트·`parent_id IS NULL`로 조인.
- `ON CONFLICT (tenant_id, name) DO NOTHING` 적용.
- 파일 헤더에 `parent_id` 컬럼·유니크 선행 조건 주석 명시.

## migration 여부

시드 파일 추가만 — **DB 미실행** (운영 적용 시 수동).

## 테스트 결과

- 저장소에 SQL만 추가. DB 시드 미실행.
- 식당OS 쪽: `.next` 삭제 후 `npm run dev` 재기동 — **Ready**, 컴파일 오류 없음(포트 3000 점유로 3002 기동).

## 남은 위험

- 운영 `product_categories`에 `(tenant_id, name)` 유니크 또는 `parent_id` 컬럼이 없으면 시드 실행 전 DDL 보강 필요.
- `/buy` 칩·상품 `category_id`와 실제 UUID 연동은 별도 작업.

## 다음 권장 작업

- `parent_id` 미보유 시 migration 추가 후 시드 실행.
- `resturant_os` `buy-category-chips.ts`에 플랫폼 카테고리 UUID 연결.
