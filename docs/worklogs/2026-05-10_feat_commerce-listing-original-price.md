# worklog: listing 정상가(original_price) migration

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-10 |

## 작업 목적

식당OS `/buy` 발주 판단 보조 카드에서 시중가 대비 절감액을 **조건부** 표시하기 위해, listing에 정상가 필드가 필요함.

## 관련 `tasks.md` ID

`COMMERCE-001`

## 수정 파일 목록

- `supabase/migrations/20260510110000_add_listing_original_price.sql` (신규)

## 변경 내용 요약

- `commerce_product_listings.original_price` (integer, nullable) 추가.
- 컬럼 코멘트로 `commerce_price`와의 관계·절감 계산 의도 명시.

## migration 여부

**파일 추가(미적용)** — 운영/스테이징 적용은 배포 절차에 따름.

## 테스트 결과

- 저장소에 SQL만 추가. DB 미실행.
- 식당OS 앱: `original_price` select는 마이그레이션 적용 후 정상 동작(미적용 시 PostgREST가 컬럼 미존재로 에러 가능).

## 남은 위험

- migration 전에 식당OS가 `original_price`를 select하면 API 오류 가능 → **마이그레이션 선행** 또는 임시 컬럼 추가 필요.

## 다음 권장 작업

- 스테이징에 migration 적용 후 mock listing에 `original_price` 샘플 값 입력.
- 관리자OS listing 편집에 정상가 필드 노출 여부 검토.
