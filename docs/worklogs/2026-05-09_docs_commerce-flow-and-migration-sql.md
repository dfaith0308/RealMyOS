# COMMERCE-FLOW SSOT 문서 + 커머스 migration SQL (저장소만)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`COMMERCE-000` 상태 플로우를 단일 문서로 고정하고, `COMMERCE-001`에 대응하는 DDL·RLS 초안을 migration 파일로 저장소에 두어, 운영 적용 전 리뷰·실행을 분리한다.

## 관련 `tasks.md` ID

`COMMERCE-000`, `COMMERCE-001`, OPS 작업 이력.

## 수정 파일 목록

- `docs/commerce/COMMERCE-FLOW.md` (신규)
- `supabase/migrations/20260509010000_create_commerce_tables.sql` (신규)
- `docs/tasks.md` (작업 이력·SSOT·migration 경로 보강)

## 변경 내용 요약

- Listing·주문 전이, 환불·completed·결제 분기, timeout, 금지 원칙, 가격 스냅샷을 `COMMERCE-FLOW.md`에 표·문단으로 정리.
- `commerce_product_listings`, `cart_items`, `commerce_orders`, `commerce_order_items` 생성·인덱스·RLS 정책 초안을 incremental migration 파일로 추가. 주석에 상태 SSOT 경로·미적용·담당 실행 안내 명시.

## migration 여부

파일 추가만 — `20260509010000_create_commerce_tables.sql` (**운영/로컬 DB 미실행**, 사용자 요청에 따라 적용 보류).

## 테스트 결과

미실행 — SQL은 저장소 보관만.

## 남은 위험

- RLS 정책이 `FOR ALL` + `USING`만 둔 구간은 Postgres 버전·INSERT 동작에 따라 `WITH CHECK` 보강이 필요할 수 있음. 적용 전 Supabase에서 정책 단위 검증 권장.
- `commerce_listings_read`는 인증 없이 `visible` 노출을 허용하는 형태로 초안 작성됨. 공개 범위·서비스 롤 설계와 재합의 필요할 수 있음.
- `commerce_order_items` 테넌트 정책은 INSERT 시 `order_id` 부모와의 정합을 앱/트리거에서 보완해야 할 수 있음.

## 다음 권장 작업

1. 권한자 승인 후 Supabase에서 migration 실행·검증.
2. `COMMERCE-002`~`003` 구현 시 `admin_logs`·상태 전이를 `COMMERCE-FLOW.md`와 코드 단일화.
